import type { TextRange } from '../text/focus.ts'
import { charLength, clampNormal, firstNonBlank, lineEnd, lineNumber, lineStart, lineStartOf, previousChar } from './lines.ts'
import * as motions from './motions.ts'
import { isVisual, VimResult } from './state.ts'
import type { Mode, RowMotion, VimKey, VimState } from './state.ts'

type Operator = 'd' | 'c' | 'y'

/** How far an operator reaches: up to the target, through it, or over whole lines. */
type MotionKind = 'exclusive' | 'inclusive' | 'linewise'

interface MotionSpec {
  readonly kind: MotionKind
  /** The target for a count (zero when none was typed). */
  readonly target: (text: string, pos: number, count: number) => number
}

/** The text an operator acts on. */
interface Operand {
  readonly range: TextRange
  readonly linewise: boolean
}

const times = (count: number): number => Math.max(1, count)

/** `J` and `K` jump this many rows down and up; they act as `10j` and `10k`, so a count multiplies them. */
const JUMP_ROWS = 10

const JUMPS: ReadonlyMap<string, string> = new Map([
  ['J', 'j'],
  ['K', 'k'],
])

const stepping =
  (motion: motions.Motion): MotionSpec['target'] =>
  (text, pos, count) =>
    motions.repeat(motion, text, pos, times(count))

const MOTIONS: ReadonlyMap<string, MotionSpec> = new Map([
  ['h', { kind: 'exclusive', target: stepping(motions.left) }],
  ['l', { kind: 'exclusive', target: stepping(motions.right) }],
  ['w', { kind: 'exclusive', target: stepping(motions.wordForward) }],
  ['b', { kind: 'exclusive', target: stepping(motions.wordBack) }],
  ['e', { kind: 'inclusive', target: stepping(motions.wordEnd) }],
  ['0', { kind: 'exclusive', target: stepping(motions.lineHome) }],
  ['^', { kind: 'exclusive', target: stepping(motions.lineFirst) }],
  ['$', { kind: 'inclusive', target: stepping(motions.lineLast) }],
  ['j', { kind: 'linewise', target: stepping(motions.lineDown) }],
  ['k', { kind: 'linewise', target: stepping(motions.lineUp) }],
  ['J', { kind: 'linewise', target: (text, pos, count) => motions.repeat(motions.lineDown, text, pos, times(count) * JUMP_ROWS) }],
  ['K', { kind: 'linewise', target: (text, pos, count) => motions.repeat(motions.lineUp, text, pos, times(count) * JUMP_ROWS) }],
  ['G', { kind: 'linewise', target: (text, _pos, count) => motions.fileEnd(text, count) }],
  ['gg', { kind: 'linewise', target: (text, _pos, count) => motions.fileStart(text, count) }],
] satisfies [string, MotionSpec][])

/** `dw` stops at the end of the line when the last word it covers is the last one on that line. */
const OPERATOR_WORD: MotionSpec = {
  kind: 'exclusive',
  target: (text, pos, count) => {
    const current = motions.repeat(motions.wordForward, text, pos, times(count) - 1)
    const next = motions.wordForward(text, current)
    const lineBreak = text.indexOf('\n', current)

    return lineBreak !== -1 && lineBreak < next ? lineBreak : next
  },
}

/** `cw` on a word changes to the end of the word, like `ce`, so it leaves the space behind it alone. */
const CHANGE_WORD: MotionSpec = {
  kind: 'inclusive',
  target: (text, pos, count) => motions.repeat(motions.wordEnd, text, motions.runEnd(text, pos), times(count) - 1),
}

/** Keys that name another key, so one rule serves both: arrows, Home, End and the delete keys. */
const KEY_ALIASES: ReadonlyMap<string, string> = new Map([
  ['ArrowLeft', 'h'],
  ['ArrowRight', 'l'],
  ['ArrowUp', 'k'],
  ['ArrowDown', 'j'],
  ['Home', '0'],
  ['End', '$'],
  ['Backspace', 'h'],
  ['Delete', 'x'],
  ['Escape', 'Escape'],
  ['Enter', 'Enter'],
])

/** Single-key commands that are an operator and a motion in disguise. */
const SHORTCUT_OPERATORS: ReadonlyMap<string, readonly [Operator, string]> = new Map([
  ['x', ['d', 'l']],
  ['D', ['d', '$']],
  ['C', ['c', '$']],
  ['s', ['c', 'l']],
  ['X', ['d', 'h']],
])

function isOperator(key: string): key is Operator {
  return key === 'd' || key === 'c' || key === 'y'
}

function isDigit(key: string): boolean {
  return key >= '0' && key <= '9' && key.length === 1
}

function settled(state: VimState, mode: Mode = state.mode): VimState {
  return { ...state, mode, pending: '', count: 0, operatorCount: 0, goalX: null }
}

/** The count in effect: the one before an operator times the one after it. */
function totalCount(state: VimState): number {
  return state.operatorCount > 0 ? state.operatorCount * times(state.count) : state.count
}

function collapsed(pos: number): TextRange {
  return { start: pos, end: pos }
}

/** The text a visual selection covers when its cursor is on `cursor`; the cursor's character is part of it. */
export function visualRange(text: string, anchor: number, cursor: number): TextRange {
  const low = Math.min(anchor, cursor)
  const high = Math.max(anchor, cursor)

  return { start: low, end: high + (text[high] === '\n' ? 1 : charLength(text, high)) }
}

/** The whole lines from the anchor's to the cursor's, without the line break that ends the last one. */
function lineSpan(text: string, anchor: number, cursor: number): TextRange {
  return { start: lineStart(text, Math.min(anchor, cursor)), end: lineEnd(text, Math.max(anchor, cursor)) }
}

/** The text linewise visual mode selects: whole lines and the line break behind them, when there is one. */
export function visualLineRange(text: string, anchor: number, cursor: number): TextRange {
  const { start, end } = lineSpan(text, anchor, cursor)

  return { start, end: end < text.length ? end + 1 : end }
}

/**
The cursor's position for a state and the textarea's selection.
In charwise visual mode the cursor is the end of the selection that is not the anchor;
a linewise selection says nothing about columns, so the state keeps the cursor.
*/
export function cursorOf(state: VimState, text: string, selection: TextRange): number {
  if (state.mode === 'visual-line') return clampNormal(text, state.visualCursor)

  if (state.mode !== 'visual') return clampNormal(text, selection.start)

  if (selection.start === state.visualAnchor) return selection.end > selection.start ? previousChar(text, selection.end) : selection.start

  return selection.start
}

function operandOf(text: string, pos: number, spec: MotionSpec, count: number): Operand {
  const target = spec.target(text, pos, count)
  const low = Math.min(pos, target)
  const high = Math.max(pos, target)

  switch (spec.kind) {
    case 'linewise':
      return { range: { start: lineStart(text, low), end: lineEnd(text, high) }, linewise: true }
    case 'inclusive':
      return { range: { start: low, end: high + charLength(text, high) }, linewise: false }
    case 'exclusive':
      // a motion that ends in the first column of a line stops before the line break that leads there
      return { range: { start: low, end: high > low && high === lineStart(text, high) ? high - 1 : high }, linewise: false }
  }
}

/** The lines `count` lines from the cursor on, as an operand (`dd`, `cc`, `yy`). */
function linesOperand(text: string, pos: number, count: number): Operand {
  const last = lineStartOf(text, lineNumber(text, pos) + times(count) - 1)

  return { range: { start: lineStart(text, pos), end: lineEnd(text, last) }, linewise: true }
}

function deleteEdit(state: VimState, range: TextRange, cursor: number): VimResult {
  return VimResult.Edit({ state, edit: { from: range.start, to: range.end, insert: '', selectionStart: cursor, selectionEnd: cursor }, yank: null })
}

/** Removes whole lines; on the last line it takes the line break before it, so no empty line is left behind. */
function deleteLines(state: VimState, text: string, range: TextRange): VimResult {
  const to = range.end < text.length ? range.end + 1 : range.end
  const from = range.end >= text.length && range.start > 0 ? range.start - 1 : range.start
  const rest = text.slice(0, from) + text.slice(to)
  const register = { text: `${text.slice(range.start, range.end)}\n`, linewise: true }

  return deleteEdit({ ...state, register }, { start: from, end: to }, firstNonBlank(rest, from))
}

function operate(state: VimState, operator: Operator, text: string, pos: number, operand: Operand): VimResult {
  const { range, linewise } = operand
  const settledState = settled(state)
  const taken = text.slice(range.start, range.end)
  const register = { text: linewise ? `${taken}\n` : taken, linewise }

  if (operator === 'y') {
    const column = pos - lineStart(text, pos)
    const cursor = linewise ? clampNormal(text, Math.min(range.start + column, lineEnd(text, range.start))) : range.start

    return range.start === range.end && !linewise
      ? VimResult.Stay({ state: settledState })
      : VimResult.Move({ state: { ...settledState, register }, selection: collapsed(cursor), yank: register.text })
  }

  if (operator === 'c') {
    const next = { ...settledState, mode: 'insert' as const, register }

    return range.start === range.end ? VimResult.Move({ state: next, selection: collapsed(range.start), yank: null }) : deleteEdit(next, range, range.start)
  }

  if (linewise) return deleteLines(settledState, text, range)

  if (range.start === range.end) return VimResult.Stay({ state: settledState })

  const rest = text.slice(0, range.start) + text.slice(range.end)

  return deleteEdit({ ...settledState, register }, range, clampNormal(rest, range.start))
}

/** The motion an operator uses for a key, with the two cases where Vim bends `w`. */
function specFor(operator: Operator, key: string, text: string, pos: number): MotionSpec | undefined {
  if (key !== 'w') return MOTIONS.get(key)

  return operator === 'c' && motions.isNonBlank(text[pos]) ? CHANGE_WORD : OPERATOR_WORD
}

function paste(state: VimState, text: string, pos: number, before: boolean): VimResult {
  const { register } = state
  const settledState = settled(state)

  if (register.text === '') return VimResult.Stay({ state: settledState })

  const count = times(state.count)
  const body = register.text.repeat(count)

  if (register.linewise) {
    const at = before ? lineStart(text, pos) : lineEnd(text, pos)
    const insert = before ? body : `\n${body.slice(0, -1)}`
    const line = before ? at : at + 1
    const rest = text.slice(0, at) + insert + text.slice(at)

    return VimResult.Edit({ state: settledState, edit: { from: at, to: at, insert, selectionStart: firstNonBlank(rest, line), selectionEnd: firstNonBlank(rest, line) }, yank: null })
  }

  const at = before ? pos : pos + charLength(text, pos)
  const rest = text.slice(0, at) + body + text.slice(at)
  const cursor = clampNormal(rest, previousChar(rest, at + body.length))

  return VimResult.Edit({ state: settledState, edit: { from: at, to: at, insert: body, selectionStart: cursor, selectionEnd: cursor }, yank: null })
}

function enterInsert(state: VimState, pos: number): VimResult {
  return VimResult.Move({ state: settled(state, 'insert'), selection: collapsed(pos), yank: null })
}

/** `o` and `O`: open an empty line below or above and start typing on it. */
function openLine(state: VimState, text: string, pos: number, below: boolean): VimResult {
  const at = below ? lineEnd(text, pos) : lineStart(text, pos)
  const cursor = below ? at + 1 : at

  return VimResult.Edit({ state: settled(state, 'insert'), edit: { from: at, to: at, insert: '\n', selectionStart: cursor, selectionEnd: cursor }, yank: null })
}

/** `I` starts before the first character that is not a blank. */
function insertStart(text: string, pos: number): number {
  const first = firstNonBlank(text, pos)

  return motions.isNonBlank(text[first]) ? first : lineEnd(text, pos)
}

/** Where a row move or a motion key puts the cursor, or null when the key is not a motion. */
function landing(state: VimState, key: string, text: string, pos: number, rows: RowMotion): { pos: number; goalX: number | null } | null {
  const jump = JUMPS.get(key)

  if (jump !== undefined) return landing({ ...state, count: times(totalCount(state)) * JUMP_ROWS, operatorCount: 0 }, jump, text, pos, rows)

  if ((key === 'j' || key === 'k') && state.mode === 'visual-line') {
    // the selection is made of lines, so the cursor moves by line, as `dj` does
    const column = state.goalX ?? pos - lineStart(text, pos)
    const delta = times(totalCount(state)) * (key === 'j' ? 1 : -1)

    return { pos: motions.lineBy(text, pos, delta, column), goalX: column }
  }

  if (key === 'j' || key === 'k') {
    let current = pos
    let goalX = state.goalX

    for (let step = 0; step < times(totalCount(state)); step += 1) {
      const target = rows(current, key === 'j' ? 1 : -1, goalX)

      if (target === null) break

      current = target.pos
      goalX = target.goalX
    }

    return { pos: current, goalX }
  }

  const spec = MOTIONS.get(key)

  return spec === undefined ? null : { pos: clampNormal(text, spec.target(text, pos, totalCount(state))), goalX: null }
}

function moveTo(state: VimState, text: string, target: { pos: number; goalX: number | null }): VimResult {
  const next = { ...settled(state), goalX: target.goalX }

  switch (state.mode) {
    case 'visual':
      return VimResult.Move({ state: next, selection: visualRange(text, state.visualAnchor, target.pos), yank: null })
    case 'visual-line':
      return VimResult.Move({ state: { ...next, visualCursor: target.pos }, selection: visualLineRange(text, state.visualAnchor, target.pos), yank: null })
    default:
      return VimResult.Move({ state: next, selection: collapsed(target.pos), yank: null })
  }
}

/** A pending operator meets its motion, or its own key for whole lines (`dd`). */
function operatorKey(state: VimState, operator: Operator, key: string, text: string, pos: number): VimResult {
  if (key === operator) return operate(state, operator, text, pos, linesOperand(text, pos, totalCount(state)))

  if (key === 'g') return VimResult.Stay({ state: { ...state, pending: `${operator}g` } })

  const spec = specFor(operator, key, text, pos)

  return spec === undefined ? VimResult.Stay({ state: settled(state) }) : operate(state, operator, text, pos, operandOf(text, pos, spec, totalCount(state)))
}

function normalKey(state: VimState, key: string, text: string, pos: number, rows: RowMotion): VimResult {
  const next = settled(state)
  const shortcut = SHORTCUT_OPERATORS.get(key)

  if (shortcut !== undefined) return operatorKey({ ...state, operatorCount: state.count, count: 0 }, shortcut[0], shortcut[1], text, pos)

  const target = landing(state, key, text, pos, rows)

  if (target !== null) return moveTo(state, text, target)

  switch (key) {
    case 'g':
      return VimResult.Stay({ state: { ...state, pending: 'g' } })
    case 'd':
    case 'c':
    case 'y':
      return VimResult.Stay({ state: { ...state, pending: key, operatorCount: state.count, count: 0 } })
    case 'Y':
      return operate(state, 'y', text, pos, linesOperand(text, pos, state.count))
    case 'S':
      return operate(state, 'c', text, pos, linesOperand(text, pos, state.count))
    case 'p':
      return paste(state, text, pos, false)
    case 'P':
      return paste(state, text, pos, true)
    case 'i':
      return enterInsert(state, pos)
    case 'a':
      return enterInsert(state, pos + charLength(text, pos))
    case 'I':
      return enterInsert(state, insertStart(text, pos))
    case 'A':
      return enterInsert(state, lineEnd(text, pos))
    case 'o':
      return openLine(state, text, pos, true)
    case 'O':
      return openLine(state, text, pos, false)
    case 'v':
      return enterVisual(state, text, 'visual', pos, pos)
    case 'V':
      return enterVisual(state, text, 'visual-line', pos, pos)
    case 'u':
      return VimResult.Undo({ state: next })
    case 'C-r':
      return VimResult.Redo({ state: next })
    default:
      return VimResult.Stay({ state: next })
  }
}

/** Starts visual mode of one kind, or turns the other kind into it, around the same anchor and cursor. */
function enterVisual(state: VimState, text: string, mode: 'visual' | 'visual-line', anchor: number, cursor: number): VimResult {
  const selection = mode === 'visual' ? visualRange(text, anchor, cursor) : visualLineRange(text, anchor, cursor)

  return VimResult.Move({ state: { ...settled(state, mode), visualAnchor: anchor, visualCursor: cursor }, selection, yank: null })
}

function leaveVisual(state: VimState, cursor: number): VimResult {
  return VimResult.Move({ state: settled(state, 'normal'), selection: collapsed(cursor), yank: null })
}

/** `d`, `x`, `y` and `c` on a charwise selection. */
function charOperator(state: VimState, key: string, text: string, cursor: number): VimResult {
  const selection = visualRange(text, state.visualAnchor, cursor)
  const taken = text.slice(selection.start, selection.end)
  const register = { text: taken, linewise: false }
  const rest = text.slice(0, selection.start) + text.slice(selection.end)

  switch (key) {
    case 'y':
      return VimResult.Move({ state: { ...settled(state, 'normal'), register }, selection: collapsed(clampNormal(text, selection.start)), yank: taken })
    case 'c':
      return selection.start === selection.end
        ? VimResult.Move({ state: { ...settled(state, 'insert'), register }, selection: collapsed(cursor), yank: null })
        : deleteEdit({ ...settled(state, 'insert'), register }, selection, selection.start)
    default:
      return selection.start === selection.end
        ? leaveVisual(state, cursor)
        : deleteEdit({ ...settled(state, 'normal'), register }, selection, clampNormal(rest, selection.start))
  }
}

/** `d`, `x`, `y` and `c` on whole lines: the same as `dd`, `yy` and `cc` over the selected lines. */
function lineOperator(state: VimState, key: string, text: string, cursor: number): VimResult {
  const operator = key === 'y' || key === 'c' ? key : 'd'
  const range = lineSpan(text, state.visualAnchor, cursor)

  // the end that sits higher in the text decides the column `y` returns to
  return operate(settled(state, 'normal'), operator, text, Math.min(state.visualAnchor, cursor), { range, linewise: true })
}

/**
`p` and `P` over the selection: the register's text takes its place, and `p` leaves the replaced text in the register.
Lines put over a charwise selection split its line; a charwise text put over lines becomes a line.
*/
function visualPut(state: VimState, key: string, text: string, cursor: number): VimResult {
  const { register } = state

  if (register.text === '') return VimResult.Stay({ state: settled(state) })

  const lines = state.mode === 'visual-line'
  const range = lines ? lineSpan(text, state.visualAnchor, cursor) : visualRange(text, state.visualAnchor, cursor)
  const taken = text.slice(range.start, range.end)
  const replaced = { text: lines ? `${taken}\n` : taken, linewise: lines }
  const body = register.text.repeat(times(state.count))
  const split = register.linewise && !lines
  const insert = split ? `\n${body.slice(0, -1)}\n` : register.linewise ? body.slice(0, -1) : body
  const rest = text.slice(0, range.start) + insert + text.slice(range.end)
  const caret = register.linewise ? firstNonBlank(rest, range.start + (split ? 1 : 0)) : clampNormal(rest, previousChar(rest, range.start + insert.length))
  const next = { ...settled(state, 'normal'), register: key === 'p' ? replaced : register }

  return VimResult.Edit({ state: next, edit: { from: range.start, to: range.end, insert, selectionStart: caret, selectionEnd: caret }, yank: null })
}

function visualKey(state: VimState, key: string, text: string, cursor: number, rows: RowMotion): VimResult {
  const target = landing(state, key, text, cursor, rows)

  if (target !== null) return moveTo(state, text, target)

  const lines = state.mode === 'visual-line'

  switch (key) {
    case 'g':
      return VimResult.Stay({ state: { ...state, pending: 'g' } })
    case 'o':
      return enterVisual(state, text, lines ? 'visual-line' : 'visual', cursor, state.visualAnchor)
    case 'v':
      return lines ? enterVisual(state, text, 'visual', state.visualAnchor, cursor) : leaveVisual(state, cursor)
    case 'V':
      return lines ? leaveVisual(state, cursor) : enterVisual(state, text, 'visual-line', state.visualAnchor, cursor)
    case 'p':
    case 'P':
      return visualPut(state, key, text, cursor)
    case 'y':
    case 'd':
    case 'x':
    case 'c':
      return lines ? lineOperator(state, key, text, cursor) : charOperator(state, key, text, cursor)
    default:
      return VimResult.Stay({ state: settled(state) })
  }
}

/** A key that waits on `g` (`gg`, `dgg`): anything but a second `g` cancels. */
function gotoKey(state: VimState, key: string, text: string, pos: number, rows: RowMotion): VimResult {
  if (key !== 'g') return VimResult.Stay({ state: settled(state) })

  const operator = state.pending.slice(0, -1)

  if (isOperator(operator)) return operatorKey({ ...state, pending: operator }, operator, 'gg', text, pos)

  const target = landing(state, 'gg', text, pos, rows)

  return target === null ? VimResult.Stay({ state: settled(state) }) : moveTo(state, text, target)
}

/** The key a command is named by, or null for the keys the textarea keeps (modifier chords, Tab, function keys). */
function commandName(input: VimKey): string | null {
  if (input.ctrlKey) {
    if (input.key.toLowerCase() === 'r' && !input.shiftKey) return 'C-r'

    return input.key === '[' ? 'Escape' : null
  }

  // a name such as "ArrowLeft"; one character, even an astral one, is a plain key
  if ([...input.key].length > 1) {
    return input.shiftKey ? null : (KEY_ALIASES.get(input.key) ?? null)
  }

  return input.key
}

function insertKey(state: VimState, input: VimKey, text: string, selection: TextRange): VimResult {
  if (commandName(input) !== 'Escape') return VimResult.Pass()

  const at = selection.end
  const cursor = at > lineStart(text, at) ? previousChar(text, at) : at

  return VimResult.Move({ state: settled(state, 'normal'), selection: collapsed(cursor), yank: null })
}

/**
Runs one key through the Vim layer.
`selection` is the textarea's selection and `rows` moves by wrapped row; the result says what the editor does next.
*/
export function handleKey(state: VimState, input: VimKey, text: string, selection: TextRange, rows: RowMotion): VimResult {
  if (input.metaKey || input.altKey) return VimResult.Pass()

  if (state.mode === 'insert') return insertKey(state, input, text, selection)

  const key = commandName(input)

  if (key === null) return VimResult.Pass()

  const cursor = cursorOf(state, text, selection)

  if (key === 'Escape') {
    return isVisual(state.mode)
      ? leaveVisual(state, cursor)
      : VimResult.Stay({ state: settled(state) })
  }

  const counting = state.pending === '' || isOperator(state.pending)

  if (counting && isDigit(key) && (key !== '0' || state.count > 0)) return VimResult.Stay({ state: { ...state, count: state.count * 10 + Number(key) } })

  if (state.pending.endsWith('g')) return gotoKey(state, key, text, cursor, rows)

  if (isOperator(state.pending)) return operatorKey(state, state.pending, key, text, cursor)

  return isVisual(state.mode) ? visualKey(state, key, text, cursor, rows) : normalKey(state, key, text, cursor, rows)
}
