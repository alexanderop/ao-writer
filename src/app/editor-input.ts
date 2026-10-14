import * as Atom from 'effect/reactivity/Atom'

import { applyFormat } from '../core/markdown/format.ts'
import type { FormatAction, TextEdit } from '../core/markdown/format.ts'

/** The editor's textarea, so buttons and shortcuts outside the editor can edit through it. */
export const editorInputAtom = Atom.make<HTMLTextAreaElement | null>(null).pipe(Atom.keepAlive)

/**
Applies an edit the way typing would, so the browser's own undo stack keeps it.
`execCommand` is the only API that does that for a textarea; `setRangeText` is the fallback where it is missing.
*/
export function applyEdit(input: HTMLTextAreaElement, edit: TextEdit): void {
  if (edit.from === edit.to && edit.insert === '') {
    input.setSelectionRange(edit.selectionStart, edit.selectionEnd)

    return
  }

  input.focus()
  input.setSelectionRange(edit.from, edit.to)

  const applied = edit.insert === '' ? document.execCommand('delete') : document.execCommand('insertText', false, edit.insert)

  if (!applied) {
    input.setRangeText(edit.insert, edit.from, edit.to, 'end')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  input.setSelectionRange(edit.selectionStart, edit.selectionEnd)
}

/** Runs a format action on the editor's current selection. */
export function formatInput(input: HTMLTextAreaElement, action: FormatAction): void {
  applyEdit(input, applyFormat(input.value, input.selectionStart, input.selectionEnd, action))
}
