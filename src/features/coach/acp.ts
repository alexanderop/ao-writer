/// <reference types="node" />
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'

import { Option, Schema } from 'effect'

/**
A minimal Agent Client Protocol client: JSON-RPC over the stdio of Claude Code's ACP adapter.
It runs on the dev server only. One adapter process serves every document; each document gets its own session, so the
coach remembers what it already told the writer about that text.
*/

/** The model the coach runs on: quick enough to answer in a few seconds, good enough to teach. */
const MODEL = 'sonnet'

const Message = Schema.Struct({
  id: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Json),
  result: Schema.optional(Schema.Json),
  error: Schema.optional(Schema.Struct({ message: Schema.String })),
})

const TextChunk = Schema.Struct({
  sessionId: Schema.String,
  update: Schema.Struct({
    sessionUpdate: Schema.Literal('agent_message_chunk'),
    content: Schema.Struct({ type: Schema.Literal('text'), text: Schema.String }),
  }),
})

const NewSession = Schema.Struct({ sessionId: Schema.String })

const decodeMessage = Schema.decodeUnknownOption(Schema.fromJsonString(Message))

const decodeChunk = Schema.decodeUnknownOption(TextChunk)

const decodeNewSession = Schema.decodeUnknownSync(NewSession)

type Json = typeof Schema.Json.Type

interface Pending {
  readonly resolve: (result: Json) => void
  readonly reject: (error: Error) => void
}

class AcpConnection {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, Pending>()
  private readonly replies = new Map<string, string>()
  private readonly sessions = new Map<string, Promise<string>>()
  // one prompt at a time per document: a reply is collected per session, so two at once would mix their text
  private readonly turns = new Map<string, Promise<void>>()
  private readonly ready: Promise<Json>
  private nextId = 0
  closed = false

  constructor(private readonly instructions: string) {
    const adapter = createRequire(import.meta.url).resolve('@agentclientprotocol/claude-agent-acp/dist/index.js')

    this.child = spawn(process.execPath, [adapter], { stdio: ['pipe', 'pipe', 'pipe'] })
    createInterface({ input: this.child.stdout }).on('line', (line) => this.receive(line))
    // the adapter logs its progress on stderr; only real problems are worth the terminal
    createInterface({ input: this.child.stderr }).on('line', (line) => {
      if (/error/i.test(line)) console.error(`[coach] ${line}`)
    })
    this.child.on('exit', () => this.close(new Error('The Claude Code ACP adapter stopped.')))
    this.child.on('error', (error) => this.close(error))
    this.ready = this.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } })
  }

  /** Sends one prompt to the document's session, after any prompt still running there, and resolves with the agent's whole text reply. */
  prompt(documentId: string, text: string): Promise<string> {
    const reply = (this.turns.get(documentId) ?? Promise.resolve()).then(() => this.turn(documentId, text))

    this.turns.set(
      documentId,
      reply.then(
        () => undefined,
        () => undefined,
      ),
    )

    return reply
  }

  private async turn(documentId: string, text: string): Promise<string> {
    const sessionId = await this.session(documentId)

    this.replies.set(sessionId, '')
    await this.request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] })

    const reply = this.replies.get(sessionId) ?? ''

    this.replies.delete(sessionId)

    return reply
  }

  /** Whether the coach has seen this document since the server started. */
  knows(documentId: string): boolean {
    return this.sessions.has(documentId)
  }

  private session(documentId: string): Promise<string> {
    const existing = this.sessions.get(documentId)

    if (existing) return existing

    const created = this.ready.then(async () => {
      const { sessionId } = decodeNewSession(
        await this.request('session/new', {
          cwd: process.cwd(),
          mcpServers: [],
          // a teacher, not a coding agent: its own instructions, no tools, and none of the user's settings, skills or MCP servers
          _meta: {
            systemPrompt: this.instructions,
            disableBuiltInTools: true,
            claudeCode: { options: { settingSources: [], strictMcpConfig: true, persistSession: false } },
          },
        }),
      )

      await this.request('session/set_config_option', { sessionId, configId: 'model', value: MODEL })

      return sessionId
    })

    // a failed start is not cached, so the next ask tries again
    created.catch(() => this.sessions.delete(documentId))
    this.sessions.set(documentId, created)

    return created
  }

  private request(method: string, params: Json): Promise<Json> {
    if (this.closed) return Promise.reject(new Error('The Claude Code ACP adapter is not running.'))

    const id = ++this.nextId

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  }

  private receive(line: string): void {
    const message = Option.getOrNull(decodeMessage(line))

    if (message === null) return

    if (message.method === undefined && message.id !== undefined) {
      const pending = this.pending.get(Number(message.id))

      this.pending.delete(Number(message.id))

      if (message.error) pending?.reject(new Error(message.error.message))
      else pending?.resolve(message.result ?? null)

      return
    }

    if (message.method === 'session/update') {
      const chunk = Option.getOrNull(decodeChunk(message.params))

      if (chunk && this.replies.has(chunk.sessionId)) this.replies.set(chunk.sessionId, (this.replies.get(chunk.sessionId) ?? '') + chunk.update.content.text)

      return
    }

    // the coach has no tools, so a request from the agent (a permission prompt, a file read) is refused
    if (message.id !== undefined) this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not supported by the writing coach.' } })}\n`)
  }

  private close(error: Error): void {
    this.closed = true

    for (const pending of this.pending.values()) pending.reject(error)

    this.pending.clear()
  }

  stop(): void {
    this.child.kill()
  }
}

declare global {
  // the connection lives on globalThis, so a dev-server reload of this module reuses it instead of leaking a process
  var aoWriterCoach: AcpConnection | undefined
}

/** The running connection, or a new one when there is none or the last one died. */
export function coachConnection(instructions: string): AcpConnection {
  const running = globalThis.aoWriterCoach

  if (running !== undefined && !running.closed) return running

  const connection = new AcpConnection(instructions)

  globalThis.aoWriterCoach = connection
  process.once('exit', () => connection.stop())

  return connection
}
