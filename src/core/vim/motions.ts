import { charLength, firstNonBlank, lineEnd, lineNumber, lineStart, lineStartOf, previousChar } from './lines.ts'

/**
A motion maps a position to the position it lands on.
Targets are raw: `l` may land on the line break and `w` on the end of the text, because an operator needs that end.
The caller clamps them (`clampNormal`) when a cursor has to rest there.
*/
export type Motion = (text: string, pos: number) => number

const WORD_CHAR = /[\p{L}\p{N}_]/u

type CharClass = 'word' | 'punctuation' | 'blank' | 'break'

function classOf(char: string): CharClass {
  if (char === '\n') return 'break'

  if (char === ' ' || char === '\t' || char === '\r') return 'blank'

  return WORD_CHAR.test(char) ? 'word' : 'punctuation'
}

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

/** `w`: the start of the next word; a run of punctuation is a word, and so is an empty line. */
export const wordForward: Motion = (text, pos) => {
  let index = pos
  const first = text[index]

  if (first === undefined) return text.length

  const kind = classOf(first)

  if (kind === 'word' || kind === 'punctuation') {
    while (index < text.length && classOf(text[index] ?? '\n') === kind) index += 1
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

/** `b`: the start of the word before the cursor, or of the current word when the cursor is inside it. */
export const wordBack: Motion = (text, pos) => {
  let index = pos - 1

  while (index > 0) {
    const char = text[index] ?? ''

    if (isEmptyLine(text, index)) return index

    if (classOf(char) !== 'blank' && char !== '\n') break

    index -= 1
  }

  if (index <= 0) return 0

  const kind = classOf(text[index] ?? '')

  while (index > 0 && classOf(text[index - 1] ?? '\n') === kind) index -= 1

  return index
}

/** `e`: the last character of the next word (of this word, when the cursor is not on its last character). */
export const wordEnd: Motion = (text, pos) => {
  let index = pos + 1

  while (index < text.length && (classOf(text[index] ?? '') === 'blank' || text[index] === '\n')) index += 1

  if (index >= text.length) return Math.max(pos, text.length - 1)

  const kind = classOf(text[index] ?? '')

  while (index + 1 < text.length && classOf(text[index + 1] ?? '\n') === kind) index += 1

  return index
}

/** The last character of the word or punctuation run under `pos`; `pos` itself on blanks. */
export const runEnd: Motion = (text, pos) => {
  const kind = classOf(text[pos] ?? '\n')

  if (kind === 'blank' || kind === 'break') return pos

  let index = pos

  while (index + 1 < text.length && classOf(text[index + 1] ?? '\n') === kind) index += 1

  return index
}

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
