import { describe, expect, it } from 'vitest'

import { countText, formatDuration } from './counts.ts'

describe('countText', () => {
  it('counts nothing in an empty text', () => {
    expect(countText('')).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      sentences: 0,
      paragraphs: 0,
      readingSeconds: 0,
      speakingSeconds: 0,
    })
  })

  it('counts words, keeping contractions, hyphens and digits together', () => {
    expect(countText("Don't over-think the 3.5 plan").words).toBe(6)
  })

  it('ignores markdown punctuation that is not a word', () => {
    expect(countText('# Title\n\n- **bold** item\n---').words).toBe(3)
  })

  it('counts characters with and without whitespace', () => {
    const counts = countText('ab cd\nef')

    expect(counts.characters).toBe(8)
    expect(counts.charactersNoSpaces).toBe(6)
  })

  it('counts sentences and paragraphs', () => {
    const counts = countText('One. Two! Three?\n\nFour...\nstill four\n\n\nFive.')

    expect(counts.sentences).toBe(5)
    expect(counts.paragraphs).toBe(3)
  })

  it('derives reading and speaking time from word counts', () => {
    const text = Array.from({ length: 220 }, () => 'word').join(' ')
    const counts = countText(text)

    expect(counts.readingSeconds).toBe(60)
    expect(counts.speakingSeconds).toBe(88)
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(40)).toBe('40 sec')
    expect(formatDuration(180)).toBe('3 min')
    expect(formatDuration(3900)).toBe('1 h 5 min')
    expect(formatDuration(7200)).toBe('2 h')
  })
})
