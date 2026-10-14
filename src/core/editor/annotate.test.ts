import { describe, expect, it } from 'vitest'

import { codeBlockKey } from '../markdown/code.ts'
import { buildSegments } from './annotate.ts'
import type { AnnotateOptions, Segment } from './annotate.ts'

const OFF: AnnotateOptions = { syntax: null, style: null, focus: null, caret: null, code: new Map() }

const ALL_SYNTAX = { nouns: true, verbs: true, adjectives: true, adverbs: true, conjunctions: true }

const ALL_STYLE = { fillers: true, cliches: true, redundancies: true }

function classesAt(text: string, segments: readonly Segment[], needle: string): readonly string[] {
  const index = text.indexOf(needle)
  const segment = segments.find((candidate) => candidate.start <= index && index < candidate.end)

  return segment && segment.className !== '' ? segment.className.split(' ') : []
}

function assertCovers(text: string, segments: readonly Segment[]): void {
  let cursor = 0

  for (const segment of segments) {
    expect(segment.start).toBe(cursor)
    expect(segment.end).toBeGreaterThan(segment.start)
    cursor = segment.end
  }

  expect(cursor).toBe(text.length)
}

describe('buildSegments', () => {
  it('returns nothing for empty text', () => {
    expect(buildSegments('', OFF)).toEqual([])
  })

  it('covers the whole text without gaps, whatever layers are on', () => {
    const text = '# Title\n\nSome **bold** words, really very quickly.\n\n- item one\n'
    const options = { syntax: ALL_SYNTAX, style: ALL_STYLE, focus: { start: 9, end: 20 }, caret: 15, code: new Map() }

    assertCovers(text, buildSegments(text, options))
    assertCovers(text, buildSegments(text, OFF))
  })

  it('styles markdown without touching the text', () => {
    const text = '## Heading with **bold**'
    const segments = buildSegments(text, OFF)

    expect(classesAt(text, segments, '##')).toEqual(['md-mark'])
    expect(classesAt(text, segments, 'Heading')).toEqual(['md-h2'])
    expect(classesAt(text, segments, 'bold')).toEqual(['md-bold', 'md-h2'])
    expect(segments.map((segment) => text.slice(segment.start, segment.end)).join('')).toBe(text)
  })

  it('colours parts of speech and leaves markdown syntax alone', () => {
    const text = 'The quiet writer quickly writes and edits.'
    const segments = buildSegments(text, { ...OFF, syntax: ALL_SYNTAX })

    expect(classesAt(text, segments, 'quiet')).toContain('pos-adj')
    expect(classesAt(text, segments, 'writer')).toContain('pos-noun')
    expect(classesAt(text, segments, 'quickly')).toContain('pos-adv')
    expect(classesAt(text, segments, 'and')).toContain('pos-conj')
    expect(classesAt(text, segments, 'The')).toEqual([])
  })

  it('does not tag words inside code, urls or markers', () => {
    const text = '`quiet writer` and [writer](https://writer.example) **quiet**'
    const segments = buildSegments(text, { ...OFF, syntax: ALL_SYNTAX })

    expect(classesAt(text, segments, 'quiet writer')).not.toContain('pos-adj')
    expect(classesAt(text, segments, 'https')).not.toContain('pos-noun')
    expect(classesAt(text, segments, '**')).toEqual(['md-mark'])
  })

  it('switches single parts of speech off', () => {
    const text = 'The quiet writer writes.'
    const segments = buildSegments(text, { ...OFF, syntax: { ...ALL_SYNTAX, adjectives: false } })

    expect(classesAt(text, segments, 'quiet')).toEqual([])
    expect(classesAt(text, segments, 'writer')).toContain('pos-noun')
  })

  it('marks fillers, cliches and redundancies, and each kind can be switched off', () => {
    const text = 'It is really the end result at the end of the day.'
    const segments = buildSegments(text, { ...OFF, style: ALL_STYLE })

    expect(classesAt(text, segments, 'really')).toContain('style-filler')
    expect(classesAt(text, segments, 'end result')).toContain('style-redundancy')
    expect(classesAt(text, segments, 'at the end of the day')).toContain('style-cliche')

    const quiet = buildSegments(text, { ...OFF, style: { ...ALL_STYLE, fillers: false } })

    expect(classesAt(text, quiet, 'really')).toEqual([])
  })

  it('dims everything outside the focus range', () => {
    const text = 'One. Two. Three.'
    const segments = buildSegments(text, { ...OFF, focus: { start: 5, end: 9 } })

    expect(classesAt(text, segments, 'One')).toEqual(['dim'])
    expect(classesAt(text, segments, 'Two')).toEqual([])
    expect(classesAt(text, segments, 'Three')).toEqual(['dim'])
  })

  it('dims all text when the focus range is empty', () => {
    const text = 'One. Two.'
    const segments = buildSegments(text, { ...OFF, focus: { start: 9, end: 9 } })

    expect(segments.every((segment) => segment.className === 'dim')).toBe(true)
  })

  it('forces a segment boundary at the caret', () => {
    const text = 'plain text without styling'
    const segments = buildSegments(text, { ...OFF, caret: 10 })

    expect(segments.map((segment) => [segment.start, segment.end])).toEqual([
      [0, 10],
      [10, text.length],
    ])
  })

  it('merges neighbours with the same classes when there is no caret split', () => {
    expect(buildSegments('plain text', OFF)).toEqual([{ start: 0, end: 10, className: '' }])
  })

  describe('given syntax colours for a fenced block', () => {
    const text = 'Some quick prose.\n\n```ts\nconst a = 1\n```\n'

    const tokens = [
      { start: 0, end: 5, light: '#ab5959', dark: '#f47067' },
      { start: 5, end: 6, light: null, dark: null },
      { start: 6, end: 7, light: '#b07d48', dark: '#6cb6ff' },
    ]

    const code = new Map([[codeBlockKey({ lang: 'ts', code: 'const a = 1' }), tokens]])

    it('colours the tokens inside the fence and leaves the rest alone', () => {
      const segments = buildSegments(text, { ...OFF, code })
      const keyword = segments.find((segment) => text.slice(segment.start, segment.end) === 'const')
      const prose = segments.find((segment) => segment.start === 0)

      expect(keyword?.className).toBe('code-coloured code-tok md-code')
      expect(keyword?.tone).toEqual({ light: '#ab5959', dark: '#f47067' })
      expect(prose?.tone).toBeUndefined()
      assertCovers(text, segments)
    })

    it('keeps the plain code styling while the block has no tokens', () => {
      const segments = buildSegments(text, OFF)

      expect(segments.some((segment) => segment.tone !== undefined)).toBe(false)
      expect(classesAt(text, segments, 'const')).toEqual(['md-code'])
    })

    it('does not tag parts of speech inside code, even with the syntax highlight on', () => {
      const segments = buildSegments(text, { ...OFF, syntax: ALL_SYNTAX, code })

      expect(classesAt(text, segments, 'const')).toEqual(['code-coloured', 'code-tok', 'md-code'])
      expect(classesAt(text, segments, 'prose')).toEqual(['pos-noun'])
    })

    it('does not colour a block whose code changed', () => {
      const segments = buildSegments(text.replace('const a = 1', 'const a = 2'), { ...OFF, code })

      expect(segments.some((segment) => segment.tone !== undefined)).toBe(false)
    })
  })
})
