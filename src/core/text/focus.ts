/** A half-open character range [start, end) in a text. */
export interface TextRange {
  readonly start: number
  readonly end: number
}

/** What focus mode keeps lit around the caret. */
export type FocusScope = 'sentence' | 'paragraph'

const BLOCK_LINE = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|\||(?:-{3,}|\*{3,}|_{3,})\s*$)/

/** The Markdown marker a block line starts with: heading hashes, a list bullet or number, or quote arrows. */
const LINE_MARKER = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|(?:>\s?)+)/

const segmenters = new Map<string, Intl.Segmenter>()

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

function segmenterFor(locale: string): Intl.Segmenter {
  const cached = segmenters.get(locale)

  if (cached !== undefined) return cached

  const created = new Intl.Segmenter(locale, { granularity: 'sentence' })

  segmenters.set(locale, created)

  return created
}

/**
The paragraph as the segmenter should see it, with the same length as the text: line breaks inside a paragraph are soft wraps, not sentence ends,
and a block line's marker (`1. `, `- `, `# `) is blanked so that it is not read as a sentence of its own.
*/
function segmenterInput(text: string, paragraph: TextRange): string {
  const block = text.slice(paragraph.start, paragraph.end)
  const marker = LINE_MARKER.exec(block)?.[0] ?? ''

  return (' '.repeat(marker.length) + block.slice(marker.length)).replace(/[\r\n]/g, ' ')
}

/**
The sentence around the caret, split by ICU's sentence rules for `locale`. A caret in the whitespace after a finished sentence starts a new one, so the range is empty there.
Only the caret's paragraph is segmented.
*/
export function sentenceRange(text: string, caret: number, locale = 'en'): TextRange {
  const position = Math.max(0, Math.min(caret, text.length))
  const paragraph = paragraphRange(text, position)

  if (paragraph.start === paragraph.end) return paragraph

  const first = skipSpace(text, paragraph.start, paragraph.end)
  let range: TextRange = { start: first, end: first }

  for (const { index, segment } of segmenterFor(locale).segment(segmenterInput(text, paragraph))) {
    const limit = paragraph.start + index + segment.length
    const start = Math.max(first, skipSpace(text, paragraph.start + index, limit))

    range = { start, end: trimEnd(text, start, limit) }

    // the segment keeps the whitespace after its sentence, so the next one begins where this one ends
    if (position < limit) break
  }

  return position <= range.end ? range : { start: position, end: position }
}

/** The lit range for the given scope. */
export function focusRange(text: string, caret: number, scope: FocusScope, locale = 'en'): TextRange {
  return scope === 'sentence' ? sentenceRange(text, caret, locale) : paragraphRange(text, caret)
}
