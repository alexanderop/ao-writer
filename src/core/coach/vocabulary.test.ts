import { describe, expect, it } from 'vitest'

import { addWord, formatVocabulary, parseVocabulary, wordsForCoach } from './vocabulary.ts'
import type { LearnedWord } from './vocabulary.ts'

const opaque: LearnedWord = {
  word: 'opaque',
  meaning: 'hard to understand because the workings are hidden',
  insteadOf: 'very confusing',
  sentence: 'Global state makes Vue apps opaque.',
  learned: '2026-10-15',
}

const baffling: LearnedWord = { word: 'baffling', meaning: 'leaves you with no idea where to start', insteadOf: 'confusing', sentence: 'The error was baffling.', learned: '2026-10-14' }

describe('word book', () => {
  it('reads back what it writes', () => {
    expect(parseVocabulary(formatVocabulary([opaque, baffling]))).toEqual([opaque, baffling])
  })

  it('reads an empty or foreign file as no words', () => {
    expect(parseVocabulary('')).toEqual([])
    expect(parseVocabulary('# Notes\n\nsome text')).toEqual([])
  })

  it('keeps a sentence with line breaks on one line', () => {
    const [entry] = parseVocabulary(formatVocabulary([{ ...opaque, sentence: 'Two\nlines.' }]))

    expect(entry?.sentence).toBe('Two lines.')
  })

  it('puts a new word first and replaces a word learned again', () => {
    expect(addWord([baffling], opaque).map((entry) => entry.word)).toEqual(['opaque', 'baffling'])
    expect(addWord([opaque, baffling], { ...opaque, word: 'Opaque', learned: '2026-10-16' })).toEqual([{ ...opaque, word: 'Opaque', learned: '2026-10-16' }, baffling])
  })

  it('gives the coach one line per word', () => {
    expect(wordsForCoach([opaque])).toBe('- opaque (instead of "very confusing"): hard to understand because the workings are hidden. Taken from you in: "Global state makes Vue apps opaque."')
    expect(wordsForCoach([])).toBe('')
  })
})
