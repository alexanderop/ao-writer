import { charLength, firstNonBlank, lineEnd, lineNumber, lineStart, lineStartOf, previousChar } from './lines.ts'
import type { Find } from './state.ts'

/**
A motion maps a position to the position it lands on.
Targets are raw: `l` may land on the line break and `w` on the end of the text, because an operator needs that end.
The caller clamps them (`clampNormal`) when a cursor has to rest there.
*/
export type Motion = (text: string, pos: number) => number

const WORD_CHAR = /[\p{L}\p{N}_]/u

type CharClass = 'word' | 'punctuation' | 'blank' | 'break'

export function classOf(char: string): CharClass {
  if (char === '\n') return 'break'

  if (char === ' ' || char === '\t' || char === '\r') return 'blank'

  return WORD_CHAR.test(char) ? 'word' : 'punctuation'
}

/** WORD classes for `W` `B` `E`: anything that is not a blank belongs to the same WORD. */
function bigClassOf(char: string): CharClass {
  const kind = classOf(char)

  return kind === 'punctuation' ? 'word' : kind
}

type Classify = (char: string) => CharClass

/** True for a letter, digit, underscore or punctuation character; false for blanks, line breaks and nothing. */
export function isNonBlank(char: string | undefined): boolean {
  if (char === undefined) return false

  const kind = classOf(char)

  return kind === 'word' || kind === 'punctuation'
}

/** A line break with nothing before it on its line: Vim counts an empty line as a word. */
function isEmptyLine(text: string, pos: number): boolean {
  return text[pos] === '\n' && (pos === 0 || text[pos - 1] === '\n')
}

/** Runs a motion `count` times, stopping early when it no longer moves. */
export function repeat(motion: Motion, text: string, pos: number, count: number): number {
  let current = pos

  for (let step = 0; step < count; step += 1) {
    const next = motion(text, current)

    if (next === current) break

    current = next
  }

  return current
}

/** `h`: one character left, never off the line. */
export const left: Motion = (text, pos) => (pos > lineStart(text, pos) ? previousChar(text, pos) : pos)

/** `l`: one character right, up to the end of the line. */
export const right: Motion = (text, pos) => pos + charLength(text, pos)

const forwardBy =
  (classify: Classify): Motion =>
  (text, pos) => {
  let index = pos
  const first = text[index]

  if (first === undefined) return text.length

  const kind = classify(first)

  if (kind === 'word' || kind === 'punctuation') {
    while (index < text.length && classify(text[index] ?? '\n') === kind) index += 1
  } else if (kind === 'break') {
    index += 1
  }

  while (index < text.length) {
    const char = text[index] ?? ''

    if (isEmptyLine(text, index)) return index

    if (classOf(char) !== 'blank' && char !== '\n') return index

    index += 1
  }

  return text.length
}

/** `w`: the start of the next word; a run of punctuation is a word, and so is an empty line. */
export const wordForward = forwardBy(classOf)

/** `W`: the start of the next WORD, which ends only at a blank. */
export const bigWordForward = forwardBy(bigClassOf)

const backBy =
  (classify: Classify): Motion =>
  (text, pos) => {
  let index = pos - 1

  while (index > 0) {
    const char = text[index] ?? ''

    if (isEmptyLine(text, index)) return index

    if (classOf(char) !== 'blank' && char !== '\n') break

    index -= 1
  }

  if (index <= 0) return 0

  const kind = classify(text[index] ?? '')

  while (index > 0 && classify(text[index - 1] ?? '\n') === kind) index -= 1

  return index
}

/** `b`: the start of the word before the cursor, or of the current word when the cursor is inside it. */
export const wordBack = backBy(classOf)

/** `B`: the same for WORDs. */
export const bigWordBack = backBy(bigClassOf)

const endBy =
  (classify: Classify): Motion =>
  (text, pos) => {
  let index = pos + 1

  while (index < text.length && (classify(text[index] ?? '') === 'blank' || text[index] === '\n')) index += 1

  if (index >= text.length) return Math.max(pos, text.length - 1)

  const kind = classify(text[index] ?? '')

  while (index + 1 < text.length && classify(text[index + 1] ?? '\n') === kind) index += 1

  return index
}

/** `e`: the last character of the next word (of this word, when the cursor is not on its last character). */
export const wordEnd = endBy(classOf)

/** `E`: the same for WORDs. */
export const bigWordEnd = endBy(bigClassOf)

const endBackBy =
  (classify: Classify): Motion =>
  (text, pos) => {
  let index = pos
  const kind = classify(text[index] ?? '\n')

  if (kind === 'word' || kind === 'punctuation') {
    while (index > 0 && classify(text[index - 1] ?? '\n') === kind) index -= 1
  }

  index -= 1

  while (index > 0) {
    if (isEmptyLine(text, index)) return index

    const char = classify(text[index] ?? '\n')

    if (char !== 'blank' && char !== 'break') return index

    index -= 1
  }

  return Math.max(index, 0)
}

/** `ge`: the last character of the word before the cursor's. */
export const wordEndBack = endBackBy(classOf)

/** `gE`: the same for WORDs. */
export const bigWordEndBack = endBackBy(bigClassOf)

const runEndBy =
  (classify: Classify): Motion =>
  (text, pos) => {
  const kind = classify(text[pos] ?? '\n')

  if (kind === 'blank' || kind === 'break') return pos

  let index = pos

  while (index + 1 < text.length && classify(text[index + 1] ?? '\n') === kind) index += 1

  return index
}

/** The last character of the word or punctuation run under `pos`; `pos` itself on blanks. */
export const runEnd = runEndBy(classOf)

/** The last character of the WORD under `pos`. */
export const bigRunEnd = runEndBy(bigClassOf)

/** `0`: the start of the line. */
export const lineHome: Motion = (text, pos) => lineStart(text, pos)

/** `^`: the first character on the line that is not a blank. */
export const lineFirst: Motion = (text, pos) => firstNonBlank(text, pos)

/** `$`: the last character of the line. */
export const lineLast: Motion = (text, pos) => {
  const end = lineEnd(text, pos)

  return end > lineStart(text, pos) ? previousChar(text, end) : end
}

/** `j` on logical lines: the same column one line down, or the last character of a shorter line. */
export const lineDown: Motion = (text, pos) => {
  const end = lineEnd(text, pos)

  if (end >= text.length) return pos

  return columnOn(text, end + 1, pos - lineStart(text, pos))
}

/** `k` on logical lines: the same column one line up, or the last character of a shorter line. */
export const lineUp: Motion = (text, pos) => {
  const start = lineStart(text, pos)

  if (start === 0) return pos

  return columnOn(text, lineStart(text, start - 1), pos - start)
}

/** `j` and `k` in linewise visual mode: `delta` logical lines away, at `column` or the last character of a shorter line. */
export function lineBy(text: string, pos: number, delta: number, column: number): number {
  const last = lineNumber(text, text.length)
  const target = Math.min(Math.max(lineNumber(text, pos) + delta, 0), last)

  return columnOn(text, lineStartOf(text, target), column)
}

function columnOn(text: string, start: number, column: number): number {
  const end = lineEnd(text, start)

  // a column inside a surrogate pair moves back to the pair's first unit
  return end === start ? start : previousChar(text, Math.min(start + column, end - 1) + 1)
}

/** `gg` with an optional line number (zero means the first line): the first non-blank of that line. */
export function fileStart(text: string, line: number): number {
  return firstNonBlank(text, lineStartOf(text, Math.max(line, 1) - 1))
}

/** `G` with an optional line number (zero means the last line): the first non-blank of that line. */
export function fileEnd(text: string, line: number): number {
  const target = line === 0 ? lineNumber(text, text.length) : line - 1

  return firstNonBlank(text, lineStartOf(text, target))
}

/**
Where `f`, `F`, `t` or `T` lands: the `count`th match of the character on the line of `pos`, or null when the line has fewer.
Repeating `t` or `T` with `;` or `,` skips a match right next to the cursor, so the cursor keeps progressing.
*/
export function findTarget(text: string, pos: number, find: Find, count: number, repeating: boolean): number | null {
  const forward = find.kind === 'f' || find.kind === 't'
  const till = find.kind === 't' || find.kind === 'T'
  const start = lineStart(text, pos)
  const end = lineEnd(text, pos)
  let found = pos
  let skipAdjacent = repeating && till && count === 1

  for (let step = 0; step < count; step += 1) {
    let match = forward ? text.indexOf(find.char, found + charLength(text, found)) : found <= start ? -1 : text.lastIndexOf(find.char, found - 1)

    if (skipAdjacent) {
      const adjacent = forward ? match === found + charLength(text, found) : match + find.char.length === found

      if (match !== -1 && adjacent) match = forward ? text.indexOf(find.char, match + find.char.length) : match <= start ? -1 : text.lastIndexOf(find.char, match - 1)

      skipAdjacent = false
    }

    if (match === -1 || match < start || match >= end) return null

    found = match
  }

  switch (find.kind) {
    case 'f':
    case 'F':
      return found
    case 't':
      return previousChar(text, found)
    case 'T':
      return found + find.char.length
  }
}

const PAIRS: ReadonlyMap<string, readonly [string, string, 1 | -1]> = new Map([
  ['(', ['(', ')', 1]],
  ['[', ['[', ']', 1]],
  ['{', ['{', '}', 1]],
  [')', [')', '(', -1]],
  [']', [']', '[', -1]],
  ['}', ['}', '{', -1]],
])

/** `%`: the partner of the first bracket at or after the cursor on its line, across lines; null when there is none. */
export function matchPair(text: string, pos: number): number | null {
  const end = lineEnd(text, pos)
  let from = pos

  while (from < end && !PAIRS.has(text[from] ?? '')) from += 1

  const pair = PAIRS.get(text[from] ?? '')

  if (pair === undefined) return null

  const [self, partner, direction] = pair
  let depth = 0

  for (let index = from + direction; index >= 0 && index < text.length; index += direction) {
    if (text[index] === self) depth += 1

    if (text[index] !== partner) continue

    if (depth === 0) return index

    depth -= 1
  }

  return null
}

/** A search as `n` and `N` repeat it. */
export interface Search {
  readonly query: string
  readonly backward: boolean
  /** `*` and `#` match whole words only. */
  readonly word: boolean
}

/**
Where a search lands: the `count`th match after (or before) `pos`, wrapping around the end of the text; null when there is none.
A query without capitals ignores case (Vim's `smartcase`).
*/
export function searchTarget(text: string, pos: number, search: Search, backward: boolean, count: number): number | null {
  const ignoreCase = search.query === search.query.toLowerCase() && text.toLowerCase().length === text.length
  const hay = ignoreCase ? text.toLowerCase() : text
  const query = ignoreCase ? search.query.toLowerCase() : search.query
  const isWordAt = (index: number): boolean => WORD_CHAR.test(hay[index] ?? ' ')
  const fits = (index: number): boolean => !search.word || (!isWordAt(index - 1) && !isWordAt(index + query.length))

  const next = (from: number): number => {
    for (let index = hay.indexOf(query, from); index !== -1; index = hay.indexOf(query, index + 1)) {
      if (fits(index)) return index
    }

    return -1
  }

  const previous = (from: number): number => {
    for (let index = from < 0 ? -1 : hay.lastIndexOf(query, from); index !== -1; index = index === 0 ? -1 : hay.lastIndexOf(query, index - 1)) {
      if (fits(index)) return index
    }

    return -1
  }

  let at = pos

  if (query === '') return null

  for (let step = 0; step < count; step += 1) {
    const found = backward ? (previous(at - 1) === -1 ? previous(hay.length) : previous(at - 1)) : next(at + 1) === -1 ? next(0) : next(at + 1)

    if (found === -1) return null

    at = found
  }

  return at
}
