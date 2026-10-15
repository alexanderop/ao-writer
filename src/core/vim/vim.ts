import type { TextEdit } from '../markdown/format.ts'
import type { TextRange } from '../text/focus.ts'
import { charLength, clampNormal, firstNonBlank, lineEnd, lineNumber, lineStart, lineStartOf, previousChar } from './lines.ts'
import * as motions from './motions.ts'
import { isObjectKey, isStretching, textObject } from './objects.ts'
import { isVisual, VimResult } from './state.ts'
import type { Change, Find, FindKind, Mode, RowMotion, VimKey, VimState } from './state.ts'

type Operator = 'd' | 'c' | 'y' | '>' | '<'

/** `>` adds this much indent to a line and `<` takes up to this much (or one tab) away; four spaces nest any Markdown list. */
const SHIFT = '    '

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

const FIND_KINDS: readonly string[] = ['f', 'F', 't', 'T']

/** Keys that press nothing by themselves; a find waiting for its character lets them pass. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Dead'])

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

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
  ['W', { kind: 'exclusive', target: stepping(motions.bigWordForward) }],
  ['B', { kind: 'exclusive', target: stepping(motions.bigWordBack) }],
  ['E', { kind: 'inclusive', target: stepping(motions.bigWordEnd) }],
  ['ge', { kind: 'inclusive', target: stepping(motions.wordEndBack) }],
  ['gE', { kind: 'inclusive', target: stepping(motions.bigWordEndBack) }],
  ['%', { kind: 'inclusive', target: (text, pos) => motions.matchPair(text, pos) ?? pos }],
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

/** `dw` stops at the end of the line when the last word it covers is the last one on that line; `dW` the same for WORDs. */
const operatorWord = (forward: motions.Motion): MotionSpec => ({
  kind: 'exclusive',
  target: (text, pos, count) => {
    const current = motions.repeat(forward, text, pos, times(count) - 1)
    const next = forward(text, current)
    const lineBreak = text.indexOf('\n', current)

    return lineBreak !== -1 && lineBreak < next ? lineBreak : next
  },
})

/** `cw` on a word changes to the end of the word, like `ce`, so it leaves the space behind it alone; `cW` acts as `cE`. */
const changeWord = (end: motions.Motion, runEnd: motions.Motion): MotionSpec => ({
  kind: 'inclusive',
  target: (text, pos, count) => motions.repeat(end, text, runEnd(text, pos), times(count) - 1),
})

const OPERATOR_WORDS: ReadonlyMap<string, MotionSpec> = new Map([
  ['w', operatorWord(motions.wordForward)],
  ['W', operatorWord(motions.bigWordForward)],
])

const CHANGE_WORDS: ReadonlyMap<string, MotionSpec> = new Map([
  ['w', changeWord(motions.wordEnd, motions.runEnd)],
  ['W', changeWord(motions.bigWordEnd, motions.bigRunEnd)],
])

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
  return key === 'd' || key === 'c' || key === 'y' || key === '>' || key === '<'
}

function isFindKind(key: string): key is FindKind {
  return FIND_KINDS.includes(key)
}

/** The operator and the find kind a pending string waits on (`f`, `dt`), or null when it waits for something else. */
function pendingFind(pending: string): { readonly operator: Operator | null; readonly kind: FindKind } | null {
  const kind = pending.slice(-1)
  const operator = pending.slice(0, -1)

  if (!isFindKind(kind)) return null

  if (operator === '') return { operator: null, kind }

  return isOperator(operator) ? { operator, kind } : null
}

/** The operator, direction and query of a search that waits for Enter (`/word`, `d?x`), or null. */
function pendingSearch(pending: string): { readonly operator: Operator | null; readonly backward: boolean; readonly query: string } | null {
  const match = /^([dcy<>]?)([/?])(.*)$/su.exec(pending)

  if (match === null) return null

  const [, operator = '', slash, query = ''] = match

  return { operator: isOperator(operator) ? operator : null, backward: slash === '?', query }
}

/** The operator and the side a pending string waits on for a text object (`di`, `ca`, `i` in visual mode), or null. */
function pendingObject(pending: string): { readonly operator: Operator | null; readonly around: boolean } | null {
  const side = pending.slice(-1)
  const operator = pending.slice(0, -1)

  if (side !== 'i' && side !== 'a') return null

  if (operator === '') return { operator: null, around: side === 'a' }

  return isOperator(operator) ? { operator, around: side === 'a' } : null
}

/** `f` and `t` reach through their target; `F` and `T` stop in front of it, as Vim has it. */
function findMotionKind(kind: FindKind): MotionKind {
  return kind === 'f' || kind === 't' ? 'inclusive' : 'exclusive'
}

/** `,` repeats a find the other way round. */
function reversed(kind: FindKind): FindKind {
  switch (kind) {
    case 'f':
      return 'F'
    case 'F':
      return 'f'
    case 't':
      return 'T'
    case 'T':
      return 't'
  }
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

/** Changes the case of every letter: `~` turns it round, visual `u` and `U` make it lower or upper case. */
function recase(text: string, how: '~' | 'u' | 'U'): string {
  if (how === 'u') return text.toLowerCase()

  if (how === 'U') return text.toUpperCase()

  return [...text].map((char) => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase())).join('')
}

/** `>` and `<` over the lines a range touches; `>` leaves empty lines alone, as Vim does. The cursor goes to the first non-blank. */
function shiftLines(state: VimState, operator: '>' | '<', text: string, range: TextRange): VimResult {
  const from = lineStart(text, range.start)
  const to = lineEnd(text, range.end > range.start ? range.end - 1 : range.start)
  const block = text.slice(from, to)

  const shifted = block
    .split('\n')
    .map((line) => (operator === '>' ? (line.trim() === '' ? line : `${SHIFT}${line}`) : line.replace(/^(?: {1,4}|\t)/u, '')))
    .join('\n')

  if (shifted === block) return VimResult.Stay({ state })

  const cursor = firstNonBlank(text.slice(0, from) + shifted + text.slice(to), from)

  return VimResult.Edit({ state, edit: { from, to, insert: shifted, selectionStart: cursor, selectionEnd: cursor }, yank: null })
}

function operate(state: VimState, operator: Operator, text: string, pos: number, operand: Operand): VimResult {
  const { range, linewise } = operand
  const settledState = settled(state)

  if (operator === '>' || operator === '<') return shiftLines(settledState, operator, text, range)
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

/** The motion an operator uses for a key, with the two cases where Vim bends `w` and `W`. */
function specFor(operator: Operator, key: string, text: string, pos: number): MotionSpec | undefined {
  const change = CHANGE_WORDS.get(key)

  if (operator === 'c' && change !== undefined && motions.isNonBlank(text[pos])) return change

  return OPERATOR_WORDS.get(key) ?? MOTIONS.get(key)
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

/** Starts waiting for the character of a find. The count so far moves to the front, so the status bar reads `d2f`. */
function awaitFind(state: VimState, operator: Operator | null, kind: FindKind): VimResult {
  return VimResult.Stay({ state: { ...state, pending: `${operator ?? ''}${kind}`, operatorCount: totalCount(state), count: 0 } })
}

/** Runs a find: moves the cursor to its target, or applies the operator over the way there. A miss changes nothing and cancels the operator. */
function runFind(state: VimState, found: Find, repeating: boolean, operator: Operator | null, text: string, pos: number): VimResult {
  // `,` goes the other way once without turning the remembered find around
  const remembered = repeating ? state : { ...state, lastFind: found }
  const position = motions.findTarget(text, pos, found, times(totalCount(state)), repeating)

  if (position === null) return VimResult.Stay({ state: settled(remembered) })

  if (operator === null) return moveTo(remembered, text, { pos: position, goalX: null })

  return operate(remembered, operator, text, pos, operandOf(text, pos, { kind: findMotionKind(found.kind), target: () => position }, 0))
}

/** `;` repeats the last find, `,` repeats it the other way round. */
function repeatFind(state: VimState, key: string, operator: Operator | null, text: string, pos: number): VimResult {
  const last = state.lastFind

  if (last === null) return VimResult.Stay({ state: settled(state) })

  return runFind(state, key === ',' ? { ...last, kind: reversed(last.kind) } : last, true, operator, text, pos)
}

/** A pending operator meets its motion, or its own key for whole lines (`dd`). */
function operatorKey(state: VimState, operator: Operator, key: string, text: string, pos: number): VimResult {
  if (key === operator) return operate(state, operator, text, pos, linesOperand(text, pos, totalCount(state)))

  if (key === 'g' || key === 'i' || key === 'a') return VimResult.Stay({ state: { ...state, pending: `${operator}${key}` } })

  if (isFindKind(key)) return awaitFind(state, operator, key)

  if (key === ';' || key === ',') return repeatFind(state, key, operator, text, pos)

  if (key === '/' || key === '?') return awaitSearch(state, operator, key)

  if (key === 'n' || key === 'N' || key === '*' || key === '#') return searchKeyMotion(state, key, operator, text, pos)

  // `%` with no bracket on the line has nowhere to go, so the operator takes nothing
  if (key === '%' && motions.matchPair(text, pos) === null) return VimResult.Stay({ state: settled(state) })

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
    case 'f':
    case 'F':
    case 't':
    case 'T':
      return awaitFind(state, null, key)
    case ';':
    case ',':
      return repeatFind(state, key, null, text, pos)
    case 'd':
    case 'c':
    case 'y':
    case '>':
    case '<':
      return VimResult.Stay({ state: { ...state, pending: key, operatorCount: state.count, count: 0 } })
    case 'r':
      return VimResult.Stay({ state: { ...state, pending: 'r' } })
    case '~':
      return toggleCase(state, text, pos)
    case '/':
    case '?':
      return awaitSearch(state, null, key)
    case 'n':
    case 'N':
    case '*':
    case '#':
      return searchKeyMotion(state, key, null, text, pos)
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
    case 'i':
    case 'a':
      return VimResult.Stay({ state: { ...state, pending: key } })
    case 'f':
    case 'F':
    case 't':
    case 'T':
      return awaitFind(state, null, key)
    case ';':
    case ',':
      return repeatFind(state, key, null, text, cursor)
    case 'o':
      return enterVisual(state, text, lines ? 'visual-line' : 'visual', cursor, state.visualAnchor)
    case 'v':
      return lines ? enterVisual(state, text, 'visual', state.visualAnchor, cursor) : leaveVisual(state, cursor)
    case 'V':
      return lines ? leaveVisual(state, cursor) : enterVisual(state, text, 'visual-line', state.visualAnchor, cursor)
    case 'p':
    case 'P':
      return visualPut(state, key, text, cursor)
    case 'r':
      return VimResult.Stay({ state: { ...state, pending: 'r' } })
    case '~':
    case 'u':
    case 'U':
      return visualCase(state, key, text, cursor)
    case '>':
    case '<':
      return shiftLines(settled(state, 'normal'), key, text, selectionOf(state, text, cursor))
    case '/':
    case '?':
      return awaitSearch(state, null, key)
    case 'n':
    case 'N':
    case '*':
    case '#':
      return searchKeyMotion(state, key, null, text, cursor)
    case 'y':
    case 'd':
    case 'x':
    case 'c':
      return lines ? lineOperator(state, key, text, cursor) : charOperator(state, key, text, cursor)
    default:
      return VimResult.Stay({ state: settled(state) })
  }
}

/** The text a visual selection covers, charwise or linewise. */
function selectionOf(state: VimState, text: string, cursor: number): TextRange {
  return state.mode === 'visual-line' ? visualLineRange(text, state.visualAnchor, cursor) : visualRange(text, state.visualAnchor, cursor)
}

/** `~` in normal mode: turns the case of `count` characters round and moves past them, never off the line. */
function toggleCase(state: VimState, text: string, pos: number): VimResult {
  const end = lineEnd(text, pos)
  let to = pos

  for (let step = 0; step < times(state.count) && to < end; step += 1) to += charLength(text, to)

  if (to === pos) return VimResult.Stay({ state: settled(state) })

  const insert = recase(text.slice(pos, to), '~')
  const cursor = clampNormal(text.slice(0, pos) + insert + text.slice(to), pos + insert.length)

  return VimResult.Edit({ state: settled(state), edit: { from: pos, to, insert, selectionStart: cursor, selectionEnd: cursor }, yank: null })
}

/** `~`, `u` and `U` on the selection. */
function visualCase(state: VimState, key: '~' | 'u' | 'U', text: string, cursor: number): VimResult {
  const range = selectionOf(state, text, cursor)
  const insert = recase(text.slice(range.start, range.end), key)
  const caret = clampNormal(text.slice(0, range.start) + insert + text.slice(range.end), range.start)

  return VimResult.Edit({ state: settled(state, 'normal'), edit: { from: range.start, to: range.end, insert, selectionStart: caret, selectionEnd: caret }, yank: null })
}

/**
`r` waits for one character and puts it in place of `count` characters (all of the selection in visual mode).
`r` and Enter breaks the line there. Too few characters left on the line cancels, as in Vim.
*/
function replaceKey(state: VimState, input: VimKey, text: string, selection: TextRange): VimResult {
  const char = commandName(input) === 'Enter' ? '\n' : typedChar(input)

  if (char === null) return MODIFIER_KEYS.has(input.key) ? VimResult.Stay({ state }) : VimResult.Stay({ state: settled(state) })

  const cursor = cursorOf(state, text, selection)

  if (isVisual(state.mode)) {
    if (char === '\n') return VimResult.Stay({ state: settled(state) })

    const range = selectionOf(state, text, cursor)
    const insert = [...GRAPHEMES.segment(text.slice(range.start, range.end))].map(({ segment }) => (segment === '\n' ? segment : char)).join('')

    return VimResult.Edit({ state: settled(state, 'normal'), edit: { from: range.start, to: range.end, insert, selectionStart: range.start, selectionEnd: range.start }, yank: null })
  }

  const end = lineEnd(text, cursor)
  let to = cursor

  for (let step = 0; step < times(state.count); step += 1) {
    if (to >= end) return VimResult.Stay({ state: settled(state) })

    to += charLength(text, to)
  }

  const insert = char === '\n' ? char : char.repeat(times(state.count))
  const caret = char === '\n' ? cursor + 1 : cursor + insert.length - char.length

  return VimResult.Edit({ state: settled(state), edit: { from: cursor, to, insert, selectionStart: caret, selectionEnd: caret }, yank: null })
}

/** Starts typing a search; the count so far moves to the front, as for a find. */
function awaitSearch(state: VimState, operator: Operator | null, slash: '/' | '?'): VimResult {
  return VimResult.Stay({ state: { ...state, pending: `${operator ?? ''}${slash}`, operatorCount: totalCount(state), count: 0 } })
}

/** Moves to a search's match, or applies the operator up to it (exclusive, like `w`). A miss changes nothing. */
function searchMove(state: VimState, operator: Operator | null, search: motions.Search, backward: boolean, text: string, pos: number): VimResult {
  const target = motions.searchTarget(text, pos, search, backward, times(totalCount(state)))

  if (target === null) return VimResult.Stay({ state: settled(state) })

  if (operator === null) return moveTo(state, text, { pos: clampNormal(text, target), goalX: null })

  return operate(state, operator, text, pos, operandOf(text, pos, { kind: 'exclusive', target: () => target }, 0))
}

/** `n` and `N` repeat the last search the same or the other way; `*` and `#` search the whole word under the cursor forward or back. */
function searchKeyMotion(state: VimState, key: 'n' | 'N' | '*' | '#', operator: Operator | null, text: string, pos: number): VimResult {
  if (key === 'n' || key === 'N') {
    const last = state.lastSearch

    return last === null ? VimResult.Stay({ state: settled(state) }) : searchMove(state, operator, last, key === 'N' ? !last.backward : last.backward, text, pos)
  }

  if (!/[\p{L}\p{N}_]/u.test(text[pos] ?? '')) return VimResult.Stay({ state: settled(state) })

  const start = motions.wordBack(text, pos + 1)
  const search = { query: text.slice(start, motions.runEnd(text, pos) + 1), backward: key === '#', word: true }

  return searchMove({ ...state, lastSearch: search }, operator, search, search.backward, text, start)
}

/** Typing a search: characters add to it, Backspace takes one away (on an empty search it cancels), Enter runs it, Escape cancels. */
function searchKey(state: VimState, input: VimKey, text: string, selection: TextRange, waiting: NonNullable<ReturnType<typeof pendingSearch>>): VimResult {
  if (commandName(input) === 'Escape') return VimResult.Stay({ state: settled(state) })

  if (input.key === 'Backspace') {
    if (waiting.query === '') return VimResult.Stay({ state: settled(state) })

    const graphemes = [...GRAPHEMES.segment(state.pending)]

    return VimResult.Stay({ state: { ...state, pending: graphemes.slice(0, -1).map(({ segment }) => segment).join('') } })
  }

  if (input.key === 'Enter') {
    const query = waiting.query === '' ? (state.lastSearch?.query ?? '') : waiting.query

    if (query === '') return VimResult.Stay({ state: settled(state) })

    const search = { query, backward: waiting.backward, word: false }

    return searchMove({ ...state, lastSearch: search }, waiting.operator, search, search.backward, text, cursorOf(state, text, selection))
  }

  const char = typedChar(input)

  return VimResult.Stay({ state: char === null ? state : { ...state, pending: `${state.pending}${char}` } })
}

/**
A text object after an operator (`diw`, `ca"`) or in visual mode (`vi(`). A key that names no object, or an object
that is not there, cancels.
*/
function objectKey(state: VimState, key: string, text: string, cursor: number, operator: Operator | null, around: boolean): VimResult {
  if (!isObjectKey(key)) return VimResult.Stay({ state: settled(state) })

  if (operator !== null) {
    const object = textObject(text, cursor, key, around, times(totalCount(state)))

    return object === null ? VimResult.Stay({ state: settled(state) }) : operate(state, operator, text, cursor, object)
  }

  return visualObject(state, key, text, cursor, around)
}

/**
A text object selects itself in visual mode; an object made of lines (`ip`) makes the selection linewise.
When the selection is already bigger than one character, `aw` `is` `ip` take the next one from the cursor on,
and quotes, brackets and tags take the next pair around the selection.
*/
function visualObject(state: VimState, key: string, text: string, cursor: number, around: boolean): VimResult {
  const current = state.mode === 'visual-line' ? visualLineRange(text, state.visualAnchor, cursor) : visualRange(text, state.visualAnchor, cursor)
  const growing = state.mode === 'visual-line' ? lineStart(text, state.visualAnchor) !== lineStart(text, cursor) : cursor !== state.visualAnchor
  const count = times(totalCount(state))
  let object = textObject(text, growing && isStretching(key) ? current.end : cursor, key, around, count)

  // quotes have no outer pair, so the search gives up after a few rounds instead of finding the same pair forever
  for (let outer = count + 1; growing && !isStretching(key) && outer < count + 50 && object !== null && object.range.start >= current.start && object.range.end <= current.end; outer += 1) {
    object = textObject(text, cursor, key, around, outer)
  }

  if (object === null || object.range.start === object.range.end) return VimResult.Stay({ state: settled(state) })

  const start = growing && isStretching(key) ? Math.min(current.start, object.range.start) : object.range.start
  const last = clampNormal(text, previousChar(text, object.range.end))

  return enterVisual(state, text, object.linewise ? 'visual-line' : 'visual', start, object.linewise ? last : previousChar(text, object.range.end))
}

/** A key that waits on `g` (`gg`, `ge`, `gE`, `dgg`): anything else cancels. */
function gotoKey(state: VimState, key: string, text: string, pos: number, rows: RowMotion): VimResult {
  const name = `g${key}`

  if (!MOTIONS.has(name)) return VimResult.Stay({ state: settled(state) })

  const operator = state.pending.slice(0, -1)

  if (isOperator(operator)) return operatorKey({ ...state, pending: operator }, operator, name, text, pos)

  const target = landing(state, name, text, pos, rows)

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

/** The character a key types, or null for a chord, a modifier or a named key such as "Enter". */
function typedChar(input: VimKey): string | null {
  if (input.ctrlKey) return null

  return [...GRAPHEMES.segment(input.key)].length === 1 ? input.key : null
}

/** A find waits for its character: any single one, a space and punctuation included. Escape or any other key cancels it. */
function findKey(state: VimState, input: VimKey, text: string, selection: TextRange, kind: FindKind, operator: Operator | null): VimResult {
  const char = typedChar(input)

  if (char !== null) return runFind(state, { kind, char }, false, operator, text, cursorOf(state, text, selection))

  // Shift on its way to a capital letter is not an answer
  if (MODIFIER_KEYS.has(input.key)) return VimResult.Stay({ state })

  return VimResult.Stay({ state: settled(state) })
}

function insertKey(state: VimState, input: VimKey, text: string, selection: TextRange): VimResult {
  if (commandName(input) !== 'Escape') return VimResult.Pass()

  const at = selection.end
  const cursor = at > lineStart(text, at) ? previousChar(text, at) : at

  return VimResult.Move({ state: settled(state, 'normal'), selection: collapsed(cursor), yank: null })
}

/** Runs one key through the Vim layer, without `.`: the result says what the editor does next. */
function step(state: VimState, input: VimKey, text: string, selection: TextRange, rows: RowMotion): VimResult {
  if (input.metaKey || input.altKey) return VimResult.Pass()

  if (state.mode === 'insert') return insertKey(state, input, text, selection)

  const search = pendingSearch(state.pending)

  if (search !== null) return searchKey(state, input, text, selection, search)

  if (state.pending === 'r') return replaceKey(state, input, text, selection)

  const waiting = pendingFind(state.pending)

  if (waiting !== null) return findKey(state, input, text, selection, waiting.kind, waiting.operator)

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

  const object = pendingObject(state.pending)

  if (object !== null) return objectKey(state, key, text, cursor, object.operator, object.around)

  if (state.pending.endsWith('g')) return gotoKey(state, key, text, cursor, rows)

  if (isOperator(state.pending)) return operatorKey(state, state.pending, key, text, cursor)

  return isVisual(state.mode) ? visualKey(state, key, text, cursor, rows) : normalKey(state, key, text, cursor, rows)
}

const ESCAPE: VimKey = { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }

function stateOf(result: VimResult): VimState | null {
  return VimResult.$is('Pass')(result) ? null : result.state
}

function withState(result: VimResult, state: VimState): VimResult {
  return VimResult.$match(result, {
    Pass: () => result,
    Stay: () => VimResult.Stay({ state }),
    Move: ({ selection, yank }) => VimResult.Move({ state, selection, yank }),
    Edit: ({ edit, yank }) => VimResult.Edit({ state, edit, yank }),
    Undo: () => VimResult.Undo({ state }),
    Redo: () => VimResult.Redo({ state }),
  })
}

/** One edit that turns `before` into `after`: whatever lies between their common start and their common end. */
function diffEdit(before: string, after: string, selection: TextRange): TextEdit {
  let head = 0

  while (head < before.length && head < after.length && before[head] === after[head]) head += 1

  let tail = 0

  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1

  return { from: head, to: before.length - tail, insert: after.slice(head, after.length - tail), selectionStart: selection.start, selectionEnd: selection.end }
}

/** The command keys with their count swapped for `count` (`3.`), or as they were when no count was typed. */
function recount(keys: readonly VimKey[], count: number): readonly VimKey[] {
  if (count === 0) return keys

  const first = keys.findIndex((key) => !isDigit(key.key))
  const digits = [...String(count)].map((key) => ({ ...ESCAPE, key }))

  return [...digits, ...keys.slice(first === -1 ? keys.length : first)]
}

/**
`.`: plays the last change again at the cursor, typed text included, and hands the editor one edit for all of it,
so a single undo takes it back.
*/
function repeatChange(state: VimState, text: string, selection: TextRange, rows: RowMotion): VimResult {
  const change = state.lastChange

  if (change === null) return VimResult.Stay({ state: settled(state) })

  let current: VimState = settled(state)
  let doc = text
  let caret = selection

  const play = (input: VimKey): void => {
    VimResult.$match(step(current, input, doc, caret, rows), {
      Pass: () => undefined,
      Stay: ({ state: next }) => {
        current = next
      },
      Move: ({ state: next, selection: moved }) => {
        current = next
        caret = moved
      },
      Edit: ({ state: next, edit }) => {
        current = next
        doc = doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
        caret = { start: edit.selectionStart, end: edit.selectionEnd }
      },
      Undo: ({ state: next }) => {
        current = next
      },
      Redo: ({ state: next }) => {
        current = next
      },
    })
  }

  for (const input of recount(change.keys, state.count)) play(input)

  if (current.mode === 'insert') {
    if (change.inserted !== null) {
      doc = doc.slice(0, caret.start) + change.inserted + doc.slice(caret.end)
      caret = collapsed(caret.start + change.inserted.length)
    }

    play(ESCAPE)
  }

  const next = { ...current, recording: [], lastChange: change, insertFrom: null }

  return doc === text ? VimResult.Move({ state: next, selection: caret, yank: null }) : VimResult.Edit({ state: next, edit: diffEdit(text, doc, caret), yank: null })
}

/** What insert mode starts from after a result: the caret, and the length of the text once the result's edit is in. */
function insertMark(result: VimResult, text: string, selection: TextRange): VimState['insertFrom'] {
  return VimResult.$match(result, {
    Edit: ({ edit }) => ({ pos: edit.selectionStart, length: text.length - (edit.to - edit.from) + edit.insert.length }),
    Move: ({ selection: moved }) => ({ pos: moved.start, length: text.length }),
    Pass: () => ({ pos: selection.start, length: text.length }),
    Stay: () => ({ pos: selection.start, length: text.length }),
    Undo: () => ({ pos: selection.start, length: text.length }),
    Redo: () => ({ pos: selection.start, length: text.length }),
  })
}

/** The text typed since insert mode began, when the caret is still at its end; null when the typing went elsewhere. */
function typedSince(state: VimState, text: string, selection: TextRange): string | null {
  const mark = state.insertFrom

  if (mark === null) return null

  const grown = text.length - mark.length

  return grown >= 0 && selection.end === mark.pos + grown ? text.slice(mark.pos, selection.end) : null
}

/** Remembers the keys of a normal-mode command as it is typed, and the command as the last change once it edits or starts insert mode. */
function record(before: VimState, input: VimKey, result: VimResult, text: string, selection: TextRange): VimResult {
  const after = stateOf(result)

  if (after === null) return result

  if (before.mode === 'insert') {
    if (after.mode === 'insert' || before.lastChange === null || before.insertFrom === null) return result

    return withState(result, { ...after, lastChange: { ...before.lastChange, inserted: typedSince(before, text, selection) }, insertFrom: null })
  }

  if (before.mode !== 'normal') return withState(result, { ...after, recording: [] })

  const keys = [...before.recording, input]

  if (after.mode === 'normal' && (after.pending !== '' || after.count > 0 || after.operatorCount > 0)) return withState(result, { ...after, recording: keys })

  if (!VimResult.$is('Edit')(result) && after.mode !== 'insert') return withState(result, { ...after, recording: [] })

  const change: Change = { keys, inserted: null }

  return withState(result, { ...after, recording: [], lastChange: change, insertFrom: after.mode === 'insert' ? insertMark(result, text, selection) : null })
}

/**
Runs one key through the Vim layer.
`selection` is the textarea's selection and `rows` moves by wrapped row; the result says what the editor does next.
*/
export function handleKey(state: VimState, input: VimKey, text: string, selection: TextRange, rows: RowMotion): VimResult {
  if (state.mode === 'normal' && state.pending === '' && !input.metaKey && !input.altKey && !input.ctrlKey && input.key === '.') {
    return repeatChange(state, text, selection, rows)
  }

  return record(state, input, step(state, input, text, selection, rows), text, selection)
}
