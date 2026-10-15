import { Data } from 'effect'

import type { TextEdit } from '../markdown/format.ts'
import type { TextRange } from '../text/focus.ts'
import type { Search } from './motions.ts'

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

/** The four in-line find commands: `f` and `F` land on the character, `t` and `T` stop short of it; lowercase looks forward, uppercase back. */
export type FindKind = 'f' | 'F' | 't' | 'T'

/** A find as `;` and `,` repeat it. */
export interface Find {
  readonly kind: FindKind
  /** The character searched for: one grapheme, possibly more than one UTF-16 unit. */
  readonly char: string
}

/** The last change, as `.` repeats it: the keys of the command and the text typed in the insert mode it started. */
export interface Change {
  readonly keys: readonly VimKey[]
  /** What was typed before Escape, or null when the command did not insert or the typing went back past its start. */
  readonly inserted: string | null
}

/** Where insert mode began and how long the text was then, so Escape can tell what was typed. */
interface InsertMark {
  readonly pos: number
  readonly length: number
}

/** Everything the layer remembers between two keys. */
export interface VimState {
  readonly mode: Mode
  /** Keys that wait for more: an operator (`d`, `c`, `y`, `>`, `<`), `g`, or both (`dg`); a find or `r` waits for its character (`f`, `dt`), a text object for its key (`di`), a search for Enter (`/word`). */
  readonly pending: string
  /** The count typed so far; zero when there is none. */
  readonly count: number
  /** The count typed before an operator, so `2d3w` can multiply to six words; a find that waits for its character takes the whole count, so the status bar reads `3f`. */
  readonly operatorCount: number
  readonly register: Register
  /** The last `f`, `F`, `t` or `T`, for `;` and `,`. */
  readonly lastFind: Find | null
  /** The last `/`, `?`, `*` or `#`, for `n` and `N`. */
  readonly lastSearch: Search | null
  /** The keys of the normal-mode command typed so far, for `.`. */
  readonly recording: readonly VimKey[]
  readonly lastChange: Change | null
  readonly insertFrom: InsertMark | null
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
  lastFind: null,
  lastSearch: null,
  recording: [],
  lastChange: null,
  insertFrom: null,
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
