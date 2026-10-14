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

  it('does not split on decimals or on abbreviations that continue in lower case', () => {
    const doc = 'Dr. Smith paid 3.14 euros, e.g. for tea. Then he left.'

    expect(sliceOf(doc, sentenceRange(doc, 30))).toBe('Smith paid 3.14 euros, e.g. for tea.')
    expect(sliceOf(doc, sentenceRange(doc, 48))).toBe('Then he left.')
  })

  it('keeps e.g. and U.S. inside their sentence', () => {
    const doc = 'See e.g. the manual. She lives in the U.S. now. Fine.'

    expect(sliceOf(doc, sentenceRange(doc, 8))).toBe('See e.g. the manual.')
    expect(sliceOf(doc, sentenceRange(doc, 35))).toBe('She lives in the U.S. now.')
    expect(sliceOf(doc, sentenceRange(doc, doc.length))).toBe('Fine.')
  })

  it('follows the ICU rules for a title or initial before a capital: the sentence ends there', () => {
    const doc = 'Dr. Smith left.'

    expect(sliceOf(doc, sentenceRange(doc, 1))).toBe('Dr.')
    expect(sliceOf(doc, sentenceRange(doc, 8))).toBe('Smith left.')
  })

  it('splits on question and exclamation marks, also when combined', () => {
    const doc = 'Really?! Yes! Wait... what? Done.'

    expect(sliceOf(doc, sentenceRange(doc, 2))).toBe('Really?!')
    expect(sliceOf(doc, sentenceRange(doc, 11))).toBe('Yes!')
    expect(sliceOf(doc, sentenceRange(doc, 25))).toBe('Wait... what?')
    expect(sliceOf(doc, sentenceRange(doc, doc.length))).toBe('Done.')
  })

  it('keeps an ellipsis followed by lower case inside its sentence', () => {
    const doc = 'Wait... what is that? Nothing.'

    expect(sliceOf(doc, sentenceRange(doc, 3))).toBe('Wait... what is that?')
  })

  it('keeps closing quotes and brackets with the sentence', () => {
    const doc = 'He said "stop." Then (quietly) he left. (Really.) Done.'

    expect(sliceOf(doc, sentenceRange(doc, 3))).toBe('He said "stop."')
    expect(sliceOf(doc, sentenceRange(doc, 20))).toBe('Then (quietly) he left.')
    expect(sliceOf(doc, sentenceRange(doc, 42))).toBe('(Really.)')
  })

  it('segments German text with the German locale, decimals and clock times included', () => {
    const doc = 'Das kostet 3,50 Euro, d. h. wenig. Er kam um 3.30 Uhr. Dann ging er.'

    expect(sliceOf(doc, sentenceRange(doc, 5, 'de'))).toBe('Das kostet 3,50 Euro, d. h. wenig.')
    expect(sliceOf(doc, sentenceRange(doc, 45, 'de'))).toBe('Er kam um 3.30 Uhr.')
    expect(sliceOf(doc, sentenceRange(doc, doc.length, 'de'))).toBe('Dann ging er.')
  })

  it('ends a German sentence after z. when a capital B. follows: ICU has no abbreviation list for it', () => {
    const doc = 'Das ist z. B. gut.'

    expect(sliceOf(doc, sentenceRange(doc, 2, 'de'))).toBe('Das ist z.')
    expect(sliceOf(doc, sentenceRange(doc, 12, 'de'))).toBe('B. gut.')
  })

  it('treats a list marker as part of the item, not as a sentence of its own', () => {
    const doc = '1. First item. More words here.\n- Bullet one. Bullet two.'

    expect(sliceOf(doc, sentenceRange(doc, 1))).toBe('1. First item.')
    expect(sliceOf(doc, sentenceRange(doc, 20))).toBe('More words here.')
    expect(sliceOf(doc, sentenceRange(doc, 34))).toBe('- Bullet one.')
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
  it('passes the locale on to the sentence rules', () => {
    const text = 'Das ist d. h. gut. Ja.'

    expect(sliceOf(text, focusRange(text, 2, 'sentence', 'de'))).toBe('Das ist d. h. gut.')
  })

  it('chooses by scope', () => {
    const text = 'One. Two.'

    expect(sliceOf(text, focusRange(text, 1, 'sentence'))).toBe('One.')
    expect(sliceOf(text, focusRange(text, 1, 'paragraph'))).toBe('One. Two.')
  })
})
