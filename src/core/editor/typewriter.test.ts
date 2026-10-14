import { describe, expect, it } from 'vitest'

import { SCROLL_MS, centredScrollTop, easeOut, shouldScroll, tweenValue } from './typewriter.ts'

describe('shouldScroll', () => {
  it('leaves a caret line within 3% of the viewport height from the middle alone', () => {
    expect(shouldScroll(0, 800)).toBe(false)
    expect(shouldScroll(24, 800)).toBe(false)
    expect(shouldScroll(-24, 800)).toBe(false)
  })

  it('scrolls once the line is further out, above or below', () => {
    expect(shouldScroll(24.5, 800)).toBe(true)
    expect(shouldScroll(-30, 800)).toBe(true)
  })

  it('scales the dead zone with the viewport', () => {
    expect(shouldScroll(20, 400)).toBe(true)
    expect(shouldScroll(20, 1000)).toBe(false)
  })
})

describe('centredScrollTop', () => {
  it('moves by the offset', () => {
    expect(centredScrollTop(300, 45, 1000)).toBe(345)
    expect(centredScrollTop(300, -45, 1000)).toBe(255)
  })

  it('stays inside the scrollable range', () => {
    expect(centredScrollTop(10, -45, 1000)).toBe(0)
    expect(centredScrollTop(990, 45, 1000)).toBe(1000)
  })
})

describe('easeOut', () => {
  it('runs from 0 to 1 and is fastest at the start', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
    expect(easeOut(0.1) - easeOut(0)).toBeGreaterThan(easeOut(1) - easeOut(0.9))
  })
})

describe('tweenValue', () => {
  it('starts at from and ends at to after 150 ms', () => {
    expect(SCROLL_MS).toBe(150)
    expect(tweenValue(100, 200, 0)).toBe(100)
    expect(tweenValue(100, 200, SCROLL_MS)).toBe(200)
  })

  it('stays put before the start and after the end', () => {
    expect(tweenValue(100, 200, -20)).toBe(100)
    expect(tweenValue(100, 200, 900)).toBe(200)
  })

  it('works downwards and moves monotonically', () => {
    const values = [0, 30, 60, 90, 120, 150].map((elapsed) => tweenValue(500, 200, elapsed))

    expect(values[0]).toBe(500)
    expect(values.at(-1)).toBe(200)
    expect(values).toEqual([...values].sort((a, b) => b - a))
  })
})
