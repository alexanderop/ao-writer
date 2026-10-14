import { describe, expect, it } from 'vitest'

import { focusRange, paragraphRange, sentenceRange } from './focus.ts'

function sliceOf(text: string, range: { start: number; end: number }): string {
  return text.slice(range.start, range.end)
}

describe('paragraphRange', () => {
  const text = 'First line\nsecond line\n\nNext paragraph here.\n\n- item one\n- item two'

  it('joins soft-wrapped lines', () => {
    expect(sliceOf(text, paragraphRange(text, 3))).toBe('First line\nsecond line')
    expect(sliceOf(text, paragraphRange(text, 15))).toBe('First line\nsecond line')
  })

  it('stops at blank lines', () => {
    expect(sliceOf(text, paragraphRange(text, 30))).toBe('Next paragraph here.')
  })

  it('treats each list item as its own block', () => {
    expect(sliceOf(text, paragraphRange(text, text.length))).toBe('- item two')
    expect(sliceOf(text, paragraphRange(text, text.indexOf('item one')))).toBe('- item one')
  })

  it('treats a heading as its own block', () => {
    const doc = '# Title\nbody text'

    expect(sliceOf(doc, paragraphRange(doc, 2))).toBe('# Title')
    expect(sliceOf(doc, paragraphRange(doc, 12))).toBe('body text')
  })

  it('is empty on a blank line', () => {
    expect(paragraphRange('a\n\nb', 2)).toEqual({ start: 2, end: 2 })
  })
})

describe('sentenceRange', () => {
  const text = 'It was late. The rain kept falling! Was it over? Yes.'

  it('finds the sentence under the caret', () => {
    expect(sliceOf(text, sentenceRange(text, 3))).toBe('It was late.')
    expect(sliceOf(text, sentenceRange(text, 20))).toBe('The rain kept falling!')
    expect(sliceOf(text, sentenceRange(text, 40))).toBe('Was it over?')
    expect(sliceOf(text, sentenceRange(text, text.length))).toBe('Yes.')
  })

  it('keeps the caret right after the full stop in the finished sentence', () => {
    expect(sliceOf(text, sentenceRange(text, 12))).toBe('It was late.')
  })

  it('moves to the next sentence at its first character', () => {
    expect(sliceOf(text, sentenceRange(text, 13))).toBe('The rain kept falling!')
  })

  it('is empty when the caret starts a new sentence after a space', () => {
    const typing = 'Hello there. '

    expect(sentenceRange(typing, typing.length)).toEqual({ start: typing.length, end: typing.length })
  })

  it('does not split on abbreviations, initials or decimals', () => {
    const doc = 'Dr. Smith paid 3.5 euros, e.g. for tea. Then J. K. Rowling left.'

    expect(sliceOf(doc, sentenceRange(doc, 5))).toBe('Dr. Smith paid 3.5 euros, e.g. for tea.')
    expect(sliceOf(doc, sentenceRange(doc, 50))).toBe('Then J. K. Rowling left.')
  })

  it('keeps closing quotes with the sentence', () => {
    const doc = 'She said "go." Then she left.'

    expect(sliceOf(doc, sentenceRange(doc, 3))).toBe('She said "go."')
  })

  it('handles a sentence without a terminator and soft line breaks', () => {
    const doc = 'A sentence that runs\nover two lines. And then one without'

    expect(sliceOf(doc, sentenceRange(doc, 5))).toBe('A sentence that runs\nover two lines.')
    expect(sliceOf(doc, sentenceRange(doc, doc.length))).toBe('And then one without')
  })

  it('stays inside the paragraph', () => {
    const doc = 'One two.\n\nThree four.'

    expect(sliceOf(doc, sentenceRange(doc, 12))).toBe('Three four.')
  })

  it('clamps out-of-range carets', () => {
    expect(sliceOf('Hi there.', sentenceRange('Hi there.', 99))).toBe('Hi there.')
    expect(sentenceRange('', 0)).toEqual({ start: 0, end: 0 })
  })
})

describe('focusRange', () => {
  it('chooses by scope', () => {
    const text = 'One. Two.'

    expect(sliceOf(text, focusRange(text, 1, 'sentence'))).toBe('One.')
    expect(sliceOf(text, focusRange(text, 1, 'paragraph'))).toBe('One. Two.')
  })
})
