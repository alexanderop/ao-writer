import { describe, expect, it } from 'vitest'

import { findAction, formatChord, matchesChord, parseChord, shortcutLabel, SHORTCUTS } from './shortcuts.ts'
import type { KeyLike } from './shortcuts.ts'

function press(code: string, key: string, mods: Partial<KeyLike> = {}): KeyLike {
  return { code, key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }
}

describe('matchesChord', () => {
  it('maps Mod to Cmd on a Mac and Ctrl elsewhere', () => {
    const chord = parseChord('Mod+D')

    expect(matchesChord(chord, press('KeyD', 'd', { metaKey: true }), true)).toBe(true)
    expect(matchesChord(chord, press('KeyD', 'd', { ctrlKey: true }), true)).toBe(false)
    expect(matchesChord(chord, press('KeyD', 'd', { ctrlKey: true }), false)).toBe(true)
    expect(matchesChord(chord, press('KeyD', 'd', { metaKey: true }), false)).toBe(false)
  })

  it('does not confuse Cmd+D, Cmd+Shift+D and Cmd+Alt+D', () => {
    expect(findAction(press('KeyD', 'd', { metaKey: true }), true)).toBe('focus')
    expect(findAction(press('KeyD', 'D', { metaKey: true, shiftKey: true }), true)).toBe('syntax')
    expect(findAction(press('KeyD', '∂', { metaKey: true, altKey: true }), true)).toBe('style')
  })

  it('matches punctuation by key so other keyboard layouts work', () => {
    expect(findAction(press('BracketRight', '+', { ctrlKey: true }), false)).toBe('biggerText')
    expect(findAction(press('Equal', '=', { metaKey: true }), true)).toBe('biggerText')
    expect(findAction(press('Slash', '-', { metaKey: true }), true)).toBe('smallerText')
    expect(findAction(press('Digit0', '0', { metaKey: true }), true)).toBe('normalText')
  })

  it('uses Cmd+Ctrl on a Mac and Ctrl+Alt elsewhere for theme and library', () => {
    expect(findAction(press('KeyN', 'n', { metaKey: true, ctrlKey: true }), true)).toBe('theme')
    expect(findAction(press('KeyN', 'n', { ctrlKey: true, altKey: true }), false)).toBe('theme')
    expect(findAction(press('KeyS', 's', { metaKey: true, ctrlKey: true }), true)).toBe('library')
    expect(findAction(press('KeyS', 's', { ctrlKey: true, altKey: true }), false)).toBe('library')
  })

  it('offers heading alternatives for browsers that reserve Cmd+1..6', () => {
    expect(findAction(press('Digit2', '2', { metaKey: true }), true)).toBe('h2')
    expect(findAction(press('Digit2', '™', { metaKey: true, altKey: true }), true)).toBe('h2')
  })

  it('keeps Cmd+Shift+I for Illustrate and leaves Cmd+I to italic', () => {
    expect(findAction(press('KeyI', 'I', { metaKey: true, shiftKey: true }), true)).toBe('illustrate')
    expect(findAction(press('KeyI', 'i', { metaKey: true }), true)).toBe('italic')
    expect(findAction(press('KeyI', 'ˆ', { ctrlKey: true, altKey: true }), false)).toBe('illustrate')
  })

  it('opens the idea coach with Cmd+Alt+P', () => {
    expect(findAction(press('KeyP', 'π', { metaKey: true, altKey: true }), true)).toBe('plan')
    expect(findAction(press('KeyP', 'p', { ctrlKey: true, altKey: true }), false)).toBe('plan')
  })

  it('fixes spelling and grammar with Cmd+Alt+F', () => {
    expect(findAction(press('KeyF', 'ƒ', { metaKey: true, altKey: true }), true)).toBe('fix')
  })

  it('maps blockquote to Cmd+Shift+period', () => {
    expect(findAction(press('Period', '>', { metaKey: true, shiftKey: true }), true)).toBe('quote')
  })

  it('ignores plain typing', () => {
    expect(findAction(press('KeyD', 'd'), true)).toBeNull()
    expect(findAction(press('KeyB', 'b', { shiftKey: true }), false)).toBeNull()
  })
})

describe('shortcut table', () => {
  it('has no two actions on one chord', () => {
    for (const isMac of [true, false]) {
      const seen = new Set<string>()

      for (const shortcut of SHORTCUTS) {
        for (const spec of isMac ? shortcut.mac : shortcut.other) {
          expect(seen.has(spec), `${spec} used twice`).toBe(false)
          seen.add(spec)
        }
      }
    }
  })

  it('formats chords per platform', () => {
    expect(shortcutLabel('syntax', true)).toBe('⇧⌘D')
    expect(shortcutLabel('syntax', false)).toBe('Ctrl+Shift+D')
    expect(shortcutLabel('theme', true)).toBe('⌃⌘N')
    expect(shortcutLabel('theme', false)).toBe('Ctrl+Alt+N')
    expect(formatChord(parseChord('Mod+Alt+D'), true)).toBe('⌥⌘D')
  })
})
