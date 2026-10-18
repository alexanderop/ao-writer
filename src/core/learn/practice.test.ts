import { describe, expect, it } from 'vitest'

import { correctAnswer, maskedSentence, practiceQueue, rememberWord, reviewCard } from './practice.ts'

const word = { word: 'requirement', german: 'Anforderung', sentence: 'This requirement matters.', explanation: 'require + ment' }

const now = Date.UTC(2026, 9, 18, 10)

const day = 86_400_000

function firstCard() {
  const card = rememberWord([], word, now)[0]

  if (card === undefined) throw new Error('Expected a saved card')

  return card
}

describe('personal practice book', () => {
  it('saves new words as due now without inventing a mistake', () => {
    expect(firstCard()).toMatchObject({ id: 'requirement', mistakes: [], occurrences: 0, due: now, streak: 0 })
  })

  it('remembers repeated misspellings as one word, and resets its schedule', () => {
    const known = reviewCard(firstCard(), true, now)
    const once = rememberWord([known], { ...word, word: ' Requirement ' }, now + 10, 'requement')
    const twice = rememberWord(once, word, now + 20, 'requement')

    expect(twice).toHaveLength(1)
    expect(twice[0]).toMatchObject({ mistakes: ['requement'], occurrences: 2, streak: 0, due: now + 20 })
  })

  it('does not reset a review when the same word is imported again', () => {
    const known = reviewCard(firstCard(), true, now)

    expect(rememberWord([known], word, now + 10)[0]).toMatchObject({ due: known.due, streak: 1 })
  })

  it('does not store empty entries', () => {
    expect(rememberWord([], { ...word, word: ' ' }, now)).toEqual([])
    expect(rememberWord([], { ...word, german: ' ' }, now)).toEqual([])
  })

  it('checks the complete spelling while tolerating case and outer whitespace', () => {
    expect(correctAnswer(word, ' Requirement ')).toBe(true)
    expect(correctAnswer(word, 'requement')).toBe(false)
    expect(correctAnswer(word, 'requirements')).toBe(false)
    expect(correctAnswer(word, 'require ment')).toBe(false)
  })

  it('hides every occurrence without treating the word as a regular expression', () => {
    expect(maskedSentence({ ...word, sentence: 'Requirement: this requirement matters.' })).toBe('___: this ___ matters.')
    expect(maskedSentence({ ...word, word: 'check-in', sentence: 'The check-in is open.' })).toBe('The ___ is open.')
    expect(maskedSentence({ ...word, word: 'a.b', sentence: 'a.b and axb' })).toBe('___ and axb')
  })
})

describe('review scheduling', () => {
  it('spaces successful recalls at 1, 3, 7, 14, then 30 days', () => {
    let card = firstCard()

    for (const interval of [1, 3, 7, 14, 30, 30]) {
      card = reviewCard(card, true, now)
      expect(card.due).toBe(now + interval * day)
    }
  })

  it('resets a forgotten or revealed word to tomorrow', () => {
    const known = reviewCard(reviewCard(firstCard(), true, now), true, now)

    expect(reviewCard(known, false, now)).toMatchObject({ streak: 0, due: now + day, lastReviewed: now })
  })

  it('excludes future cards, prioritises frequent mistakes and caps sessions at five', () => {
    const cards = Array.from({ length: 7 }, (_, index) => ({ ...firstCard(), id: String(index), occurrences: index }))
    const future = { ...firstCard(), id: 'future', due: now + day, occurrences: 100 }

    expect(practiceQueue([...cards, future], now).map((card) => card.id)).toEqual(['6', '5', '4', '3', '2'])
    expect(practiceQueue([future], now)).toEqual([])
  })
})
