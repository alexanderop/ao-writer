import { describe, expect, it } from 'vitest'

import { changedChars, coachPrompt, locateQuote, parseProfile, parseReply, suggestionEdit } from './note.ts'

const note = { kind: 'nudge', quote: 'basically good', note: 'Cut the hedge.', why: 'Hedges weaken claims.', after: 'good', options: [], weak: '' }

const context = { profile: '', words: '', wordTurn: false }

describe('parseReply', () => {
  it('reads a bare JSON note', () => {
    expect(parseReply(JSON.stringify(note))).toEqual(note)
  })

  it('reads a note wrapped in a fence or prose', () => {
    expect(parseReply(`Here you go:\n\`\`\`json\n${JSON.stringify(note)}\n\`\`\``)).toEqual(note)
  })

  it('reads a word note with its options, and fills in what a word note leaves out', () => {
    const options = [{ word: 'opaque', meaning: 'workings hidden', replacement: 'opaque' }]
    const word = { kind: 'word', quote: 'very confusing', note: 'Weak intensifier.', why: 'One precise word beats two vague ones.', options, weak: 'very confusing' }

    expect(parseReply(JSON.stringify(word))).toEqual({ ...word, after: '' })
  })

  it('is null for a word note without words', () => {
    expect(parseReply(JSON.stringify({ kind: 'word', quote: 'very', note: 'Weak.', why: 'Because.', options: [] }))).toBeNull()
  })

  it('is null when the coach stays quiet', () => {
    expect(parseReply('{"quiet": true}')).toBeNull()
  })

  it('is null for anything that is not a note', () => {
    expect(parseReply('no json here')).toBeNull()
    expect(parseReply('{"kind": "nudge"}')).toBeNull()
    expect(parseReply(JSON.stringify({ ...note, quote: ' ' }))).toBeNull()
  })
})

describe('locateQuote', () => {
  const text = 'one two. one two. three'

  it('finds the occurrence nearest the old position', () => {
    expect(locateQuote(text, 'one two', 0)).toEqual({ start: 0, end: 7 })
    expect(locateQuote(text, 'one two', 12)).toEqual({ start: 9, end: 16 })
  })

  it('is null once the passage changed', () => {
    expect(locateQuote(text, 'four', 0)).toBeNull()
  })
})

describe('coachPrompt', () => {
  it('shows the draft and the paragraph under the caret', () => {
    const prompt = coachPrompt('First paragraph.\n\nSecond one here.', 20, context)

    expect(prompt).toContain('<draft>\nFirst paragraph.\n\nSecond one here.\n</draft>')
    expect(prompt).toContain('<current>\nSecond one here.\n</current>')
    expect(prompt).not.toContain('<profile>')
    expect(prompt).not.toContain('<words>')
    expect(prompt).not.toContain('word note')
  })

  it('adds the profile, the word book, and the word turn when there are any', () => {
    const prompt = coachPrompt('Text.', 0, { profile: '## Strengths\n- clear', words: '- opaque', wordTurn: true })

    expect(prompt).toContain('<profile>\n## Strengths\n- clear\n</profile>')
    expect(prompt).toContain('<words>\n- opaque\n</words>')
    expect(prompt).toContain('give a word note')
  })
})

describe('suggestionEdit', () => {
  it('replaces the quote and puts the caret after the example', () => {
    expect(suggestionEdit({ start: 4, end: 18 }, 'good')).toEqual({ from: 4, to: 18, insert: 'good', selectionStart: 8, selectionEnd: 8 })
  })
})

describe('changedChars', () => {
  it('counts the changed middle of a text', () => {
    expect(changedChars('abc', 'abc')).toBe(0)
    expect(changedChars('hello world', 'hello brave world')).toBe(6)
    expect(changedChars('hello world', 'hello')).toBe(6)
    expect(changedChars('cat', 'cut')).toBe(1)
    expect(changedChars('', 'new text')).toBe(8)
  })
})

describe('parseProfile', () => {
  it('keeps the Markdown from the first section on', () => {
    expect(parseProfile('Here it is:\n\n## Strengths\n- clear\n\n## Next focus\n- openings')).toBe('## Strengths\n- clear\n\n## Next focus\n- openings')
  })

  it('drops a fence around it', () => {
    expect(parseProfile('```markdown\n## Strengths\n- clear\n```')).toBe('## Strengths\n- clear')
  })

  it('is null without sections', () => {
    expect(parseProfile('I could not write a profile.')).toBeNull()
  })
})
