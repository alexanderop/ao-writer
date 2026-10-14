import * as Atom from 'effect/reactivity/Atom'

import { buildSegments } from '../../core/editor/annotate.ts'
import { renderMarkdown } from '../../core/markdown/render.ts'
import { countText } from '../../core/text/counts.ts'
import { focusRange } from '../../core/text/focus.ts'
import { initialVimState, isVisual } from '../../core/vim/state.ts'
import type { VimState } from '../../core/vim/state.ts'
import { cursorOf } from '../../core/vim/vim.ts'
import { settingsAtom } from '../settings/atoms.ts'
import { styleOptions, syntaxOptions } from '../settings/settings.ts'

/** The text of the open document. */
export const textAtom = Atom.make('').pipe(Atom.keepAlive)

/** The selected range in the editor; start equals end for a plain caret. */
export const selectionAtom = Atom.make({ start: 0, end: 0 }).pipe(Atom.keepAlive)

/** True while the writer is typing, so the chrome can fade away. */
export const typingAtom = Atom.make(false).pipe(Atom.keepAlive)

/** The Vim layer's mode, pending keys and register; reset whenever Vim is switched or the document changes. */
export const vimAtom = Atom.make<VimState>(initialVimState).pipe(Atom.keepAlive)

/** Where the caret is: the end of the selection, except in Vim's visual modes, where it is the cursor end. */
export const caretAtom = Atom.make((get) => {
  const selection = get(selectionAtom)
  const vim = get(vimAtom)

  return isVisual(vim.mode) ? cursorOf(vim, get(textAtom), selection) : selection.end
})

/** The whole document's counts. */
export const countsAtom = Atom.make((get) => countText(get(textAtom)))

/** The counts of the selection, or null when nothing is selected. */
export const selectionCountsAtom = Atom.make((get) => {
  const { start, end } = get(selectionAtom)

  return end > start ? countText(get(textAtom).slice(start, end)) : null
})

/** The overlay behind the textarea: Markdown styling plus whichever of syntax, style check and focus are on. */
export const segmentsAtom = Atom.make((get) => {
  const text = get(textAtom)
  const settings = get(settingsAtom)
  const end = get(caretAtom)
  const focus = settings.focus ? focusRange(text, end, settings.focusScope) : null

  return buildSegments(text, {
    syntax: syntaxOptions(settings),
    style: styleOptions(settings),
    focus,
    caret: end,
  })
})

/** The preview pane's HTML; empty while the preview is closed. */
export const previewHtmlAtom = Atom.make((get) => (get(settingsAtom).preview ? renderMarkdown(get(textAtom)) : ''))
