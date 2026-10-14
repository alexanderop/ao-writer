/** A half-open character range [start, end) in a text. */
export interface TextRange {
  readonly start: number
  readonly end: number
}

/** What focus mode keeps lit around the caret. */
export type FocusScope = 'sentence' | 'paragraph'

const BLOCK_LINE = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|\||(?:-{3,}|\*{3,}|_{3,})\s*$)/

const TERMINATORS = '.!?'

const CLOSERS = '"\'”’)]*_~'

const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co', 'no', 'fig', 'approx', 'e.g', 'i.e', 'cf', 'al',
])

function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1
}

function lineEnd(text: string, pos: number): number {
  const index = text.indexOf('\n', pos)

  return index === -1 ? text.length : index
}

function isBlank(line: string): boolean {
  return line.trim() === ''
}

function isSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
}

/** Lines that stand on their own: headings, list items, quotes, fences, table rows and rules. */
function isBlockLine(line: string): boolean {
  return BLOCK_LINE.test(line)
}

/** The paragraph around the caret: the run of lines without a blank line (or a block line such as a list item) between them. */
export function paragraphRange(text: string, caret: number): TextRange {
  const position = Math.max(0, Math.min(caret, text.length))
  let start = lineStart(text, position)
  let end = lineEnd(text, position)
  const current = text.slice(start, end)

  if (isBlank(current)) return { start: position, end: position }

  if (isBlockLine(current)) return { start, end }

  while (start > 0) {
    const previousStart = lineStart(text, start - 1)
    const previous = text.slice(previousStart, start - 1)

    if (isBlank(previous) || isBlockLine(previous)) break

    start = previousStart
  }

  while (end < text.length) {
    const nextEnd = lineEnd(text, end + 1)
    const next = text.slice(end + 1, nextEnd)

    if (isBlank(next) || isBlockLine(next)) break

    end = nextEnd
  }

  return { start, end }
}

function skipSpace(text: string, from: number, limit: number): number {
  let index = from

  while (index < limit && isSpace(text[index])) index += 1

  return index
}

function trimEnd(text: string, from: number, limit: number): number {
  let index = limit

  while (index > from && isSpace(text[index - 1])) index -= 1

  return index
}

function precedingWord(text: string, dot: number, from: number): string {
  let begin = dot

  while (begin > from && !isSpace(text[begin - 1])) begin -= 1

  return text.slice(begin, dot).replace(/^[("'“‘*_]+/, '')
}

/** True when the period at `dot` ends an abbreviation or initial, so the sentence goes on. */
function isAbbreviation(text: string, dot: number, from: number, next: number, limit: number): boolean {
  const word = precedingWord(text, dot, from)

  if (ABBREVIATIONS.has(word.toLowerCase())) return true

  if (/^\p{Lu}$/u.test(word)) return true

  const following = next < limit ? text[next] : undefined

  return following !== undefined && /\p{Ll}/u.test(following)
}

/** The exclusive end of the sentence that starts at `from`, without its trailing whitespace. */
function sentenceEnd(text: string, from: number, limit: number): number {
  let index = from

  while (index < limit) {
    if (TERMINATORS.includes(text[index] ?? '')) {
      const runStart = index
      let end = index

      while (end < limit && TERMINATORS.includes(text[end] ?? '')) end += 1

      while (end < limit && CLOSERS.includes(text[end] ?? '')) end += 1

      if (end >= limit || isSpace(text[end])) {
        const single = text[runStart] === '.' && end - runStart === 1
        const next = skipSpace(text, end, limit)

        if (!single || !isAbbreviation(text, runStart, from, next, limit)) return end
      }

      index = end
    } else {
      index += 1
    }
  }

  return trimEnd(text, from, limit)
}

/**
The sentence around the caret. A caret in the whitespace after a finished sentence starts a new one, so the range is empty there.
*/
export function sentenceRange(text: string, caret: number): TextRange {
  const position = Math.max(0, Math.min(caret, text.length))
  const paragraph = paragraphRange(text, position)

  if (paragraph.start === paragraph.end) return paragraph

  let start = skipSpace(text, paragraph.start, paragraph.end)

  for (;;) {
    const end = sentenceEnd(text, start, paragraph.end)
    const next = skipSpace(text, end, paragraph.end)

    if (position < next || next >= paragraph.end) {
      return position <= end ? { start, end } : { start: position, end: position }
    }

    start = next
  }
}

/** The lit range for the given scope. */
export function focusRange(text: string, caret: number, scope: FocusScope): TextRange {
  return scope === 'sentence' ? sentenceRange(text, caret) : paragraphRange(text, caret)
}
