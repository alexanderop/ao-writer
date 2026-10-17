import { describe, expect, it } from 'vitest'

import { cardShows, elapsedLabel, findPictures, isLive } from './cards.ts'
import type { IllustrationJob } from './cards.ts'

describe('findPictures', () => {
  it('finds the generated pictures with their offsets and ignores other images', () => {
    const text = 'Hi\n\n![Drawing…](images/ab12cd34.webp)\n\n![logo](logo.png)\n\n![a boat](images/x-9.webp)'
    const first = text.indexOf('![Drawing')
    const last = text.indexOf('![a boat')

    expect(findPictures(text)).toEqual([
      { id: 'ab12cd34', start: first, end: first + '![Drawing…](images/ab12cd34.webp)'.length },
      { id: 'x-9', start: last, end: text.length },
    ])
  })

  it('skips an image that has no destination yet', () => {
    expect(findPictures('![a boat]()')).toEqual([])
  })
})

describe('elapsedLabel', () => {
  it('counts whole seconds, then minutes', () => {
    expect(elapsedLabel(0)).toBe('0s')
    expect(elapsedLabel(12_999)).toBe('12s')
    expect(elapsedLabel(60_000)).toBe('1m 00s')
    expect(elapsedLabel(125_000)).toBe('2m 05s')
  })
})

const drawing: IllustrationJob = { state: 'drawing', id: 'a', prompt: 'p', startedAt: 0 }

const done: IllustrationJob = { state: 'done', id: 'a', prompt: 'p', startedAt: 0, finishedAt: 40_000 }

describe('cardShows', () => {
  it('shows every card in the margin', () => {
    expect(cardShows(undefined, 99_999, true, false)).toBe(true)
  })

  it('shows an overlay while drawing and for a few seconds after, not later', () => {
    expect(cardShows(drawing, 10_000, false, false)).toBe(true)
    expect(cardShows(done, 45_999, false, false)).toBe(true)
    expect(cardShows(done, 46_000, false, false)).toBe(false)
    expect(cardShows(undefined, 46_000, false, false)).toBe(false)
  })

  it('shows an overlay when the caret is on the line', () => {
    expect(cardShows(undefined, 46_000, false, true)).toBe(true)
  })
})

describe('isLive', () => {
  it('keeps the clock for a drawing job and for a short while after it ends', () => {
    expect(isLive(drawing, 1_000_000)).toBe(true)
    expect(isLive(done, 45_000)).toBe(true)
    expect(isLive(done, 46_000)).toBe(false)
  })
})
