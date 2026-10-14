import { Data } from 'effect'

import type { TextEdit } from '../markdown/format.ts'
import type { TextRange } from '../text/focus.ts'

export type Mode = 'normal' | 'insert' | 'visual' | 'visual-line'

/** True for both kinds of visual mode: the textarea holds a selection the keys act on. */
export function isVisual(mode: Mode): boolean {
  return mode === 'visual' || mode === 'visual-line'
}

/** The mode as the status bar names it. */
export function modeLabel(mode: Mode): string {
  return mode === 'visual-line' ? 'VISUAL LINE' : mode.toUpperCase()
}

/** What `d`, `c` and `y` last took; linewise text ends with its line break. */
interface Register {
  readonly text: string
  readonly linewise: boolean
}

/** Everything the layer remembers between two keys. */
export interface VimState {
  readonly mode: Mode
  /** Keys that wait for more: an operator (`d`, `c`, `y`), `g`, or both (`dg`). */
  readonly pending: string
  /** The count typed so far; zero when there is none. */
  readonly count: number
  /** The count typed before an operator, so `2d3w` can multiply to six words. */
  readonly operatorCount: number
  readonly register: Register
  /** Where the visual selection started. */
  readonly visualAnchor: number
  /** The cursor in linewise visual mode, whose selection covers whole lines and so cannot tell where the cursor is; charwise visual mode reads it from the selection. */
  readonly visualCursor: number
  /** The x position `j` and `k` keep across rows (the column, in linewise visual mode), or null when the last command was not a row move. */
  readonly goalX: number | null
}

export const initialVimState: VimState = {
  mode: 'normal',
  pending: '',
  count: 0,
  operatorCount: 0,
  register: { text: '', linewise: false },
  visualAnchor: 0,
  visualCursor: 0,
  goalX: null,
}

/** The parts of a keyboard event the layer reads. */
export interface VimKey {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/** Where a vertical row move lands, and the x position it was aiming for. */
interface RowTarget {
  readonly pos: number
  readonly goalX: number
}

/**
Moves one visual row up or down. The core cannot see wrapping, so the editor measures it:
it returns the target, or null when there is no row in that direction.
*/
export type RowMotion = (pos: number, direction: 1 | -1, goalX: number | null) => RowTarget | null

/**
What the editor does with a key. Every variant but `Pass` carries the next state.
`Pass` leaves the key to the textarea; `Stay` only changes state (a count, a pending operator, a swallowed key).
*/
export type VimResult = Data.TaggedEnum<{
  Pass: {}
  Stay: { readonly state: VimState }
  Move: { readonly state: VimState; readonly selection: TextRange; readonly yank: string | null }
  Edit: { readonly state: VimState; readonly edit: TextEdit; readonly yank: string | null }
  Undo: { readonly state: VimState }
  Redo: { readonly state: VimState }
}>

export const VimResult = Data.taggedEnum<VimResult>()
