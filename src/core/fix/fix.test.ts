import { describe, expect, it } from 'vitest'

import { applyFixes, fixEdit, fixPrompt, parseFixes } from './fix.ts'

describe('parseFixes', () => {
  it('reads fixes, wrapped in prose or a fence', () => {
    const fixes = [{ wrong: 'teh app', right: 'the app' }]

    expect(parseFixes(`Here:\n\`\`\`json\n${JSON.stringify({ fixes })}\n\`\`\``)).toEqual(fixes)
  })

  it('drops empty, unchanged and rewrite-sized fixes', () => {
    const long = 'x'.repeat(121)
    const reply = JSON.stringify({ fixes: [{ wrong: '', right: 'a' }, { wrong: 'same', right: 'same' }, { wrong: long, right: 'short' }, { wrong: 'its', right: 'it’s' }] })

    expect(parseFixes(reply)).toEqual([{ wrong: 'its', right: 'it’s' }])
  })

  it('is an empty list when there is nothing to fix, and null for anything else', () => {
    expect(parseFixes('{"fixes": []}')).toEqual([])
    expect(parseFixes('no json')).toBeNull()
  })
})

describe('applyFixes', () => {
  it('fixes every place the passage occurs and counts them', () => {
    expect(applyFixes('teh cat and teh dog', [{ wrong: 'teh', right: 'the' }])).toEqual({ text: 'the cat and the dog', count: 2 })
  })

  it('leaves code blocks, inline code and link targets alone', () => {
    const text = 'teh\n\n```js\nconst teh = 1\n```\n\nUse `teh` or [teh](https://teh.dev/teh).'

    expect(applyFixes(text, [{ wrong: 'teh', right: 'the' }]).text).toBe('the\n\n```js\nconst teh = 1\n```\n\nUse `teh` or [the](https://teh.dev/teh).')
  })

  it('skips a passage that is not in the text', () => {
    expect(applyFixes('fine', [{ wrong: 'missing', right: 'x' }])).toEqual({ text: 'fine', count: 0 })
  })

  it('does not apply two fixes to the same characters', () => {
    expect(applyFixes('i has went', [{ wrong: 'i has', right: 'I have' }, { wrong: 'has went', right: 'have gone' }]).text).toBe('I have went')
  })
})

describe('fixEdit', () => {
  it('covers only the changed span', () => {
    expect(fixEdit('a teh b', 'a the b', 0)).toMatchObject({ from: 3, to: 5, insert: 'he' })
  })

  it('moves a caret after the change by how much the text grew', () => {
    expect(fixEdit('dont stop', 'don’t stop', 9).selectionStart).toBe(10)
    expect(fixEdit('dont stop', 'don’t stop', 1).selectionStart).toBe(1)
  })
})

it('puts the draft in the prompt', () => {
  expect(fixPrompt('Hi')).toContain('<draft>\nHi\n</draft>')
})
