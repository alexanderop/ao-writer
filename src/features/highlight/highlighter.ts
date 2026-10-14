import { Context, Effect, Layer } from 'effect'

import { codeBlockKey } from '../../core/markdown/code.ts'
import type { CodeBlock, CodeToken } from '../../core/markdown/code.ts'
import { resolveLanguage } from './languages.ts'
import type { LanguageId } from './languages.ts'

/** Colours code for one grammar. The Shiki one is loaded on first use; tests pass their own. */
export type Tokenizer = (code: string, language: LanguageId) => Promise<readonly CodeToken[]>

/** Syntax colours for fenced code. */
export interface Highlighter {
  /** The coloured tokens of a block, or null when its language is unknown or the highlighter failed (the code stays plain). */
  readonly tokenize: (block: CodeBlock) => Effect.Effect<readonly CodeToken[] | null>
}

/** Blocks remembered before the cache starts over. */
const CACHE_LIMIT = 200

/** A highlighter that remembers the tokens of every block it has seen, so an unchanged block is never coloured twice. */
function makeHighlighter(tokenizer: Tokenizer): Highlighter {
  const cache = new Map<string, readonly CodeToken[]>()

  const tokenize = Effect.fn('CodeHighlighter.tokenize')(function* (block: CodeBlock) {
    const key = codeBlockKey(block)
    const hit = cache.get(key)

    if (hit) return hit

    const language = resolveLanguage(block.lang)

    if (language === null) return null

    const tokens = yield* Effect.tryPromise(() => tokenizer(block.code, language)).pipe(Effect.catch(() => Effect.succeed(null)))

    if (tokens === null) return null

    if (cache.size >= CACHE_LIMIT) cache.clear()

    cache.set(key, tokens)

    return tokens
  })

  return { tokenize }
}

/** Loads Shiki the first time it is asked for tokens. Nothing of it is in the first page load. */
const shikiTokenizer: Tokenizer = async (code, language) => {
  const shiki = await import('./shiki.ts')

  return shiki.tokenize(code, language)
}

export class CodeHighlighter extends Context.Service<CodeHighlighter, Highlighter>()('ao-writer/highlight/CodeHighlighter') {
  /** The browser highlighter: Shiki with the JavaScript regex engine and one dynamic import per grammar. */
  static readonly layerShiki = Layer.sync(CodeHighlighter, () => makeHighlighter(shikiTokenizer))

  /** A highlighter over any tokenizer, for tests. */
  static readonly layerWith = (tokenizer: Tokenizer) => Layer.sync(CodeHighlighter, () => makeHighlighter(tokenizer))
}
