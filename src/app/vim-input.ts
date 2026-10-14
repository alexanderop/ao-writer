import { clampNormal } from '../core/vim/lines.ts'
import { handleKey } from '../core/vim/vim.ts'
import { VimResult } from '../core/vim/state.ts'
import type { RowMotion, VimKey, VimState } from '../core/vim/state.ts'
import { applyEdit } from './editor-input.ts'

/** Puts yanked text on the system clipboard as well; a browser that refuses is not an error. */
function copyToClipboard(text: string | null): void {
  if (text === null) return

  try {
    navigator.clipboard?.writeText(text).catch(() => undefined)
  } catch {
    // no clipboard in this context
  }
}

/** Undo and redo go through the browser, which owns the textarea's history; normal mode then pulls the caret back onto a character. */
function stepHistory(input: HTMLTextAreaElement, command: 'undo' | 'redo'): void {
  input.focus()
  document.execCommand(command)

  const caret = clampNormal(input.value, input.selectionStart)

  input.setSelectionRange(caret, caret)
}

/**
Feeds one key to the Vim layer and does what it asks of the textarea.
Returns the next state, or null when the key is not Vim's and the textarea should handle it.
*/
export function runVimKey(input: HTMLTextAreaElement, key: VimKey, state: VimState, rows: RowMotion): VimState | null {
  const result = handleKey(state, key, input.value, { start: input.selectionStart, end: input.selectionEnd }, rows)

  return VimResult.$match(result, {
    Pass: () => null,
    Stay: ({ state: next }) => next,
    Move: ({ state: next, selection, yank }) => {
      input.setSelectionRange(selection.start, selection.end)
      copyToClipboard(yank)

      return next
    },
    Edit: ({ state: next, edit, yank }) => {
      applyEdit(input, edit)
      copyToClipboard(yank)

      return next
    },
    Undo: ({ state: next }) => {
      stepHistory(input, 'undo')

      return next
    },
    Redo: ({ state: next }) => {
      stepHistory(input, 'redo')

      return next
    },
  })
}
