import { markdownRanges } from '../markdown/highlight.ts'
import { tagText } from '../pos/tagger.ts'
import type { PosTag, TaggedToken } from '../pos/tagger.ts'
import { checkStyle } from '../style/check.ts'
import type { StyleKind } from '../style/check.ts'
import type { TextRange } from '../text/focus.ts'

/** Which parts of speech the syntax highlight colours. */
export interface SyntaxOptions {
  readonly nouns: boolean
  readonly verbs: boolean
  readonly adjectives: boolean
  readonly adverbs: boolean
  readonly conjunctions: boolean
}

/** Which style problems the style check underlines. */
export interface StyleOptions {
  readonly fillers: boolean
  readonly cliches: boolean
  readonly redundancies: boolean
}

/** What to layer over the Markdown styling. A null layer is off. */
export interface AnnotateOptions {
  readonly syntax: SyntaxOptions | null
  readonly style: StyleOptions | null
  /** The lit range of focus mode; everything outside it gets the dim class. */
  readonly focus: TextRange | null
  /** The caret, so the overlay can place its measuring marker; it only forces a segment boundary. */
  readonly caret: number | null
}

/** A run of text with one set of classes. Segments are contiguous and cover the whole text. */
export interface Segment {
  readonly start: number
  readonly end: number
  readonly className: string
}

interface Mark {
  readonly pos: number
  readonly delta: 1 | -1
  readonly className: string
}

const POS_CLASS: ReadonlyMap<PosTag, { readonly className: string; readonly option: keyof SyntaxOptions }> = new Map([
  ['noun', { className: 'pos-noun', option: 'nouns' }],
  ['verb', { className: 'pos-verb', option: 'verbs' }],
  ['adj', { className: 'pos-adj', option: 'adjectives' }],
  ['adv', { className: 'pos-adv', option: 'adverbs' }],
  ['conj', { className: 'pos-conj', option: 'conjunctions' }],
])

const STYLE_OPTION: ReadonlyMap<StyleKind, keyof StyleOptions> = new Map([
  ['filler', 'fillers'],
  ['cliche', 'cliches'],
  ['redundancy', 'redundancies'],
])

const LINE_CACHE_LIMIT = 4000

const lineCache = new Map<string, readonly TaggedToken[]>()

function taggedLine(line: string): readonly TaggedToken[] {
  const cached = lineCache.get(line)

  if (cached) return cached

  if (lineCache.size >= LINE_CACHE_LIMIT) lineCache.clear()

  const tokens = tagText(line)

  lineCache.set(line, tokens)

  return tokens
}

/** Blanks every non-prose character (markdown syntax, code, urls) with a space, keeping offsets and newlines. */
function prose(text: string, masks: readonly TextRange[]): string {
  if (masks.length === 0) return text

  const units = text.split('')

  for (const mask of masks) {
    for (let index = mask.start; index < Math.min(mask.end, units.length); index += 1) {
      if (units[index] !== '\n') units[index] = ' '
    }
  }

  return units.join('')
}

function addRange(marks: Mark[], start: number, end: number, className: string): void {
  if (end <= start) return

  marks.push({ pos: start, delta: 1, className }, { pos: end, delta: -1, className })
}

function addPartsOfSpeech(marks: Mark[], plain: string, options: SyntaxOptions): void {
  let offset = 0

  for (const line of plain.split('\n')) {
    if (line.trim() !== '') {
      for (const token of taggedLine(line)) {
        const entry = POS_CLASS.get(token.tag)

        if (entry && options[entry.option]) addRange(marks, offset + token.start, offset + token.end, entry.className)
      }
    }

    offset += line.length + 1
  }
}

function addStyle(marks: Mark[], text: string, options: StyleOptions): void {
  const kinds = new Set<StyleKind>()

  for (const [kind, option] of STYLE_OPTION) {
    if (options[option]) kinds.add(kind)
  }

  if (kinds.size === 0) return

  for (const match of checkStyle(text, kinds)) addRange(marks, match.start, match.end, `style-${match.kind}`)
}

function sweep(length: number, marks: Mark[], caret: number | null): readonly Segment[] {
  marks.sort((a, b) => a.pos - b.pos)

  const active = new Map<string, number>()
  const segments: Segment[] = []
  let cursor = 0
  let index = 0

  while (cursor < length) {
    for (let mark = marks[index]; mark !== undefined && mark.pos <= cursor; mark = marks[index]) {
      const count = (active.get(mark.className) ?? 0) + mark.delta

      if (count <= 0) active.delete(mark.className)
      else active.set(mark.className, count)

      index += 1
    }

    let next = Math.min(marks[index]?.pos ?? length, length)

    if (caret !== null && caret > cursor && caret < next) next = caret

    const className = [...active.keys()].sort().join(' ')
    const last = segments.at(-1)

    if (last && last.className === className && cursor !== caret) {
      segments[segments.length - 1] = { start: last.start, end: next, className }
    } else {
      segments.push({ start: cursor, end: next, className })
    }

    cursor = next
  }

  return segments
}

/** Layers Markdown styling, parts of speech, style problems and the focus dimming into one list of classed segments. */
export function buildSegments(text: string, options: AnnotateOptions): readonly Segment[] {
  if (text.length === 0) return []

  const marks: Mark[] = []
  const masks: TextRange[] = []

  for (const range of markdownRanges(text)) {
    addRange(marks, range.start, range.end, range.className)

    if (range.mask) masks.push(range)
  }

  if (options.syntax) addPartsOfSpeech(marks, prose(text, masks), options.syntax)

  if (options.style) addStyle(marks, text, options.style)

  if (options.focus) {
    addRange(marks, 0, options.focus.start, 'dim')
    addRange(marks, options.focus.end, text.length, 'dim')
  }

  return sweep(text.length, marks, options.caret)
}
