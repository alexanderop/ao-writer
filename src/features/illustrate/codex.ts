/// <reference types="node" />
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
Runs the Codex CLI to render one picture. It runs on the dev server only, on the writer's own Codex login.
*/

const MODEL = 'gpt-6.1-sol'

const TIMEOUT_MS = 180_000

/** Codex runs at once; the rest wait their turn. */
const MAX_RUNS = 2

/** What a run leaves: the PNG as base64, or a short reason it did not. */
export type Rendered = { readonly ok: true; readonly png: string } | { readonly ok: false; readonly reason: string }

let running = 0

const waiting: Array<() => void> = []

async function turn<A>(job: () => Promise<A>): Promise<A> {
  if (running >= MAX_RUNS) await new Promise<void>((resolve) => waiting.push(resolve))
  else running++

  try {
    return await job()
  } finally {
    const next = waiting.shift()

    if (next) next()
    else running--
  }
}

function runCodex(directory: string, prompt: string): Promise<{ code: number | null; timedOut: boolean; stderr: string }> {
  return new Promise((resolve, reject) => {
    // stdin must be closed: with a pipe, codex waits on "Reading additional input from stdin"
    const child = spawn(
      'codex',
      ['exec', '--skip-git-repo-check', '--ephemeral', '-m', MODEL, '-c', 'model_reasoning_effort="low"', '-s', 'workspace-write', '-C', directory, prompt],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: TIMEOUT_MS },
    )

    let stderr = ''

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2_000)
    })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, timedOut: signal === 'SIGTERM', stderr }))
  })
}

/** Renders the prompt with Codex in a scratch directory and returns the PNG it saved there. */
export function renderWithCodex(prompt: string): Promise<Rendered> {
  return turn(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ao-writer-illustrate-'))

    try {
      const run = await runCodex(directory, prompt)

      if (run.timedOut) return { ok: false, reason: 'Codex took too long to draw it.' }

      const png = await readFile(join(directory, 'out.png')).catch(() => null)

      if (png === null) {
        if (run.stderr) console.error(`[illustrate] ${run.stderr.trim()}`)

        return { ok: false, reason: run.code === 0 ? 'Codex did not make a picture.' : 'Codex could not draw it. Is it logged in?' }
      }

      return { ok: true, png: png.toString('base64') }
    } catch (cause) {
      return { ok: false, reason: cause instanceof Error && 'code' in cause && cause.code === 'ENOENT' ? 'The codex command is not installed.' : 'Codex could not be started.' }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
