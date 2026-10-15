import type { TextRange } from '../text/focus.ts'
import { lineEnd, lineStart } from './lines.ts'
import { classOf } from './motions.ts'

/** What a text object covers: characters, or whole lines (`ip`, and `i{` when the braces sit on their own lines). */
export interface TextObject {
  readonly range: TextRange
  readonly linewise: boolean
}

/** A stretch of text that is either all blank or all not: a word between spaces, a sentence between the blanks after it. */
interface Run {
  readonly start: number
  readonly end: number
  readonly blank: boolean
}

const BRACKETS: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['(', ['(', ')']],
  [')', ['(', ')']],
  ['b', ['(', ')']],
  ['[', ['[', ']']],
  [']', ['[', ']']],
  ['{', ['{', '}']],
  ['}', ['{', '}']],
  ['B', ['{', '}']],
  ['<', ['<', '>']],
  ['>', ['<', '>']],
])

const QUOTES: ReadonlySet<string> = new Set(['"', "'", '`'])

/** Keys whose object grows from the cursor (`vawaw` takes one more word); the others grow outwards (`vi(i(` takes the next pair of brackets). */
const STRETCHING: ReadonlySet<string> = new Set(['w', 'W', 's', 'p'])

/** `.`, `!` or `?`, any closing brackets or quotes, then a blank: the end of a sentence. */
const SENTENCE_END = /[.!?][)\]"'’”]*(?=\s|$)/gu

const TAG = /<(\/?)([A-Za-z][\w:.-]*)[^<>]*?(\/?)>/g

const collapsed = (pos: number): TextRange => ({ start: pos, end: pos })

/** True when a larger selection takes the object from the cursor on rather than from the next pair around it. */
export function isStretching(key: string): boolean {
  return STRETCHING.has(key)
}

/** True for a key that names a text object: `w` `W` `s` `p`, a quote, a bracket, `b` `B` or `t`. */
export function isObjectKey(key: string): boolean {
  return STRETCHING.has(key) || BRACKETS.has(key) || QUOTES.has(key) || key === 't'
}

/** The text object `i` + key (`around` false) or `a` + key names around `pos`, `count` times over; null when there is none. */
export function textObject(text: string, pos: number, key: string, around: boolean, count: number): TextObject | null {
  const pair = BRACKETS.get(key)

  if (pair !== undefined) return bracketObject(text, pos, pair[0], pair[1], around, count)

  if (QUOTES.has(key)) return quoteObject(text, pos, key, around, count)

  switch (key) {
    case 'w':
      return wordObject(text, pos, around, count, (char) => classOf(char))
    case 'W':
      return wordObject(text, pos, around, count, (char) => (classOf(char) === 'blank' ? 'blank' : 'word'))
    case 's':
      return sentenceObject(text, pos, around, count)
    case 'p':
      return paragraphObject(text, pos, around, count)
    case 't':
      return tagObject(text, pos, around, count)
    default:
      return null
  }
}

/**
`i` takes `count` runs from the one under the cursor, blanks counting as runs.
`a` takes each run with the blanks behind it; when the last one has none, the blanks in front of the first instead
(unless they are the line's indent). On a blank, `a` takes the blanks and the run behind them.
*/
function overRuns(runs: readonly Run[], index: number, around: boolean, count: number, lineStartsAt: number): TextRange {
  const first = runs[index]

  if (first === undefined) return collapsed(lineStartsAt)

  if (!around) return { start: first.start, end: (runs[Math.min(index + count, runs.length) - 1] ?? first).end }

  let next = index
  let end = first.end
  let trailing = false

  for (let step = 0; step < count && next < runs.length; step += 1) {
    if (first.blank && runs[next]?.blank === true) {
      end = runs[next]?.end ?? end
      next += 1
    }

    const word = runs[next]

    if (word === undefined || word.blank) break

    end = word.end
    next += 1

    if (first.blank) continue

    const blank = runs[next]

    trailing = blank?.blank === true

    if (blank !== undefined && trailing) {
      end = blank.end
      next += 1
    }
  }

  const before = runs[index - 1]
  const start = !first.blank && !trailing && before?.blank === true && before.start > lineStartsAt ? before.start : first.start

  return { start, end }
}

/** `iw` `aw` `iW` `aW`: words on the cursor's line, split by `kind` (letters and punctuation for `w`, anything but blanks for `W`). */
function wordObject(text: string, pos: number, around: boolean, count: number, kind: (char: string) => string): TextObject {
  const start = lineStart(text, pos)
  const end = lineEnd(text, pos)
  const runs: Run[] = []

  for (let index = start; index < end; ) {
    const current = kind(text[index] ?? '')
    let stop = index + 1

    while (stop < end && kind(text[stop] ?? '') === current) stop += 1

    runs.push({ start: index, end: stop, blank: current === 'blank' })
    index = stop
  }

  const index = Math.max(0, runs.findIndex((run) => pos < run.end) === -1 ? runs.length - 1 : runs.findIndex((run) => pos < run.end))

  return { range: overRuns(runs, index, around, count, start), linewise: false }
}

function isBlankLine(line: string): boolean {
  return line.trim() === ''
}

/** The lines of a text with where each starts, so a paragraph can be counted in lines and turned back into offsets. */
function linesOf(text: string) {
  const lines = text.split('\n')
  const starts: number[] = []
  let offset = 0

  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }

  return { lines, starts }
}

/** `is` `as`: sentences in the paragraph around the cursor, each ending at `.`, `!` or `?` and a blank; the blanks between count as runs. */
function sentenceObject(text: string, pos: number, around: boolean, count: number): TextObject {
  const { lines, starts } = linesOf(text)
  const line = Math.max(0, starts.findLastIndex((start) => start <= pos))
  let first = line
  let last = line

  while (first > 0 && !isBlankLine(lines[first - 1] ?? '')) first -= 1

  while (last < lines.length - 1 && !isBlankLine(lines[last + 1] ?? '')) last += 1

  const from = starts[first] ?? 0
  const to = (starts[last] ?? 0) + (lines[last]?.length ?? 0)
  const runs: Run[] = []
  let index = from

  while (index < to) {
    const blankEnd = index + (/^\s*/u.exec(text.slice(index, to))?.[0].length ?? 0)

    if (blankEnd > index) {
      runs.push({ start: index, end: blankEnd, blank: true })
      index = blankEnd

      continue
    }

    SENTENCE_END.lastIndex = 0
    const ending = SENTENCE_END.exec(text.slice(index, to))
    const end = ending === null ? to : index + ending.index + ending[0].length

    runs.push({ start: index, end, blank: false })
    index = end
  }

  const found = runs.findIndex((run) => pos < run.end)

  return { range: overRuns(runs, found === -1 ? runs.length - 1 : found, around, count, from), linewise: false }
}

/**
`ip` `ap`: whole lines. A paragraph is a run of lines that are not blank, and a run of blank lines counts as one too.
`ap` adds the blank lines behind each paragraph, or the ones in front when there are none behind.
*/
function paragraphObject(text: string, pos: number, around: boolean, count: number): TextObject {
  const { lines, starts } = linesOf(text)
  const runs: Run[] = []

  for (let line = 0; line < lines.length; ) {
    const blank = isBlankLine(lines[line] ?? '')
    let stop = line + 1

    while (stop < lines.length && isBlankLine(lines[stop] ?? '') === blank) stop += 1

    runs.push({ start: line, end: stop, blank })
    line = stop
  }

  const current = Math.max(0, starts.findLastIndex((start) => start <= pos))
  const index = runs.findIndex((run) => current < run.end)
  const span = overRuns(runs, index, around, count, -1)
  const lastLine = span.end - 1

  return { range: { start: starts[span.start] ?? 0, end: (starts[lastLine] ?? 0) + (lines[lastLine]?.length ?? 0) }, linewise: true }
}

/** Positions of the quote characters on the cursor's line that are not escaped with a backslash. */
function quotesOnLine(text: string, pos: number, quote: string): number[] {
  const found: number[] = []

  for (let index = lineStart(text, pos); index < lineEnd(text, pos); index += 1) {
    if (text[index] === quote && text[index - 1] !== '\\') found.push(index)
  }

  return found
}

/** Blanks (not line breaks) from `pos` in `direction`; returns where they stop. */
function skipBlanks(text: string, pos: number, direction: 1 | -1): number {
  let index = pos

  while (classOf(text[direction === 1 ? index : index - 1] ?? '\n') === 'blank') index += direction

  return index
}

/**
`i"` `a"` and the same for `'` and a backtick, on the cursor's line.
Quotes pair up from the start of the line; outside every pair the first pair after the cursor counts.
`a` takes the blanks behind the closing quote, or in front of the opening one when there are none behind. `2i"` keeps the quotes but not the blanks.
*/
function quoteObject(text: string, pos: number, quote: string, around: boolean, count: number): TextObject | null {
  const quotes = quotesOnLine(text, pos, quote)
  let pair: number | null = null

  for (let index = 0; index + 1 < quotes.length && pair === null; index += 2) {
    if ((quotes[index + 1] ?? -1) >= pos) pair = index
  }

  const open = pair === null ? undefined : quotes[pair]
  const close = pair === null ? undefined : quotes[pair + 1]

  if (open === undefined || close === undefined) return null

  if (!around) return { range: count > 1 ? { start: open, end: close + 1 } : { start: open + 1, end: close }, linewise: false }

  const after = skipBlanks(text, close + 1, 1)

  return { range: after > close + 1 ? { start: open, end: after } : { start: skipBlanks(text, open, -1), end: close + 1 }, linewise: false }
}

/** The `count`th bracket that opens around `pos` and is not closed before it; a bracket under the cursor is one of its own pair. */
function enclosingOpen(text: string, pos: number, open: string, close: string, count: number): number | null {
  let depth = 0
  let remaining = count

  for (let index = text[pos] === close ? pos - 1 : pos; index >= 0; index -= 1) {
    if (text[index] === close) depth += 1

    if (text[index] !== open) continue

    if (depth > 0) {
      depth -= 1

      continue
    }

    remaining -= 1

    if (remaining === 0) return index
  }

  return null
}

function matchingClose(text: string, openAt: number, open: string, close: string): number | null {
  let depth = 0

  for (let index = openAt + 1; index < text.length; index += 1) {
    if (text[index] === open) depth += 1

    if (text[index] !== close) continue

    if (depth === 0) return index

    depth -= 1
  }

  return null
}

/**
`i(` `a(` and the other brackets, across lines; a count reaches further out (`2i(`).
Outside every pair, the next pair on the cursor's line counts, so `ci(` works from in front of the brackets.
When both brackets sit at the edges of their own lines, `i` takes the whole lines between them, as `di{` in Vim does.
*/
function bracketObject(text: string, pos: number, open: string, close: string, around: boolean, count: number): TextObject | null {
  let openAt = enclosingOpen(text, pos, open, close, count)
  let closeAt = openAt === null ? null : matchingClose(text, openAt, open, close)

  if (openAt === null || closeAt === null) {
    const ahead = text.indexOf(open, pos)

    openAt = ahead !== -1 && ahead < lineEnd(text, pos) ? ahead : null
    closeAt = openAt === null ? null : matchingClose(text, openAt, open, close)
  }

  if (openAt === null || closeAt === null) return null

  if (around) return { range: { start: openAt, end: closeAt + 1 }, linewise: false }

  const closeLine = lineStart(text, closeAt)

  if (text[openAt + 1] === '\n' && isBlankLine(text.slice(closeLine, closeAt))) {
    return closeLine - 1 > openAt + 1 ? { range: { start: openAt + 2, end: closeLine - 1 }, linewise: true } : { range: collapsed(openAt + 1), linewise: false }
  }

  return { range: { start: openAt + 1, end: closeAt }, linewise: false }
}

interface TagPair {
  readonly openStart: number
  readonly openEnd: number
  readonly closeStart: number
  readonly closeEnd: number
}

/** Every opening tag with its closing tag; self-closing tags and tags without a partner are left out. */
function tagPairs(text: string): TagPair[] {
  const pairs: TagPair[] = []
  const stack: { readonly name: string; readonly start: number; readonly end: number }[] = []

  for (const match of text.matchAll(TAG)) {
    const [whole, slash, name = '', selfClosing] = match
    const start = match.index
    const end = start + whole.length

    if (selfClosing === '/') continue

    if (slash !== '/') {
      stack.push({ name, start, end })

      continue
    }

    const at = stack.findLastIndex((tag) => tag.name === name)

    if (at === -1) continue

    const opening = stack[at]

    stack.length = at

    if (opening !== undefined) pairs.push({ openStart: opening.start, openEnd: opening.end, closeStart: start, closeEnd: end })
  }

  return pairs
}

/** `it` `at`: the contents of the `count`th HTML tag pair around the cursor, or the pair with its tags. */
function tagObject(text: string, pos: number, around: boolean, count: number): TextObject | null {
  const enclosing = tagPairs(text)
    .filter((pair) => pair.openStart <= pos && pos < pair.closeEnd)
    .sort((a, b) => b.openStart - a.openStart)

  const pair = enclosing[count - 1]

  if (pair === undefined) return null

  return { range: around ? { start: pair.openStart, end: pair.closeEnd } : { start: pair.openEnd, end: pair.closeStart }, linewise: false }
}
