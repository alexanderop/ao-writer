import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { codeBlockKey } from '../../core/markdown/code.ts'
import type { CodeBlock, CodeToken } from '../../core/markdown/code.ts'
import { markdownLayout } from '../../core/markdown/highlight.ts'
import { codeBlocks } from '../../core/markdown/render.ts'
import { codeTokensAtom, textAtom } from '../editor/atoms.ts'
import { settingsAtom } from '../settings/atoms.ts'
import { CodeHighlighter } from './highlighter.ts'
import { resolveLanguage } from './languages.ts'

const runtime = Atom.runtime(CodeHighlighter.layerShiki)

/** The pause after the last edit before new or changed blocks are coloured, so typing never waits for Shiki. */
const HIGHLIGHT_DELAY = '120 millis'

/** The code blocks in the document that have a grammar: the editor's fences, plus the preview's when it is open. */
const wantedAtom = Atom.make((get): readonly CodeBlock[] => {
  const text = get(textAtom)
  const wanted = new Map<string, CodeBlock>()

  const blocks = get(settingsAtom).preview ? [...markdownLayout(text).blocks, ...codeBlocks(text)] : markdownLayout(text).blocks

  for (const block of blocks) {
    if (resolveLanguage(block.lang) !== null) wanted.set(codeBlockKey(block), { lang: block.lang, code: block.code })
  }

  return [...wanted.values()]
})

/**
 * Keeps the code tokens up to date. A document without a coloured language never touches Shiki. An edit that changes a
 * block waits for a pause, then colours only the blocks it has no tokens for; the older tokens stay on screen meanwhile.
 */
export const highlightAtom = runtime.atom((get) => {
  const wanted = get(wantedAtom)

  return Effect.gen(function* () {
    const registry = yield* AtomRegistry
    const highlighter = yield* CodeHighlighter
    const have = registry.get(codeTokensAtom)

    if (wanted.some((block) => !have.has(codeBlockKey(block)))) yield* Effect.sleep(HIGHLIGHT_DELAY)

    const next = new Map<string, readonly CodeToken[]>()

    for (const block of wanted) {
      const key = codeBlockKey(block)
      const tokens = have.get(key) ?? (yield* highlighter.tokenize(block))

      if (tokens !== null) next.set(key, tokens)
    }

    // an unchanged set keeps its identity, so the overlay and the preview do not repaint for nothing
    if (next.size !== have.size || [...next.keys()].some((key) => !have.has(key))) registry.set(codeTokensAtom, next)
  })
})
