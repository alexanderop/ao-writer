import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import { defaultSettings, FONT_SIZE, nextCounter, resizedFont, Settings, styleOptions, syntaxOptions } from './settings.ts'

describe('settings', () => {
  it('follows the system theme on first use', () => {
    expect(defaultSettings(true).theme).toBe('dark')
    expect(defaultSettings(false).theme).toBe('light')
  })

  it('starts with Vim keys off, and reads settings saved before they existed', () => {
    const { vim, ...saved } = defaultSettings(false)

    expect(vim).toBe(false)
    expect(Schema.decodeUnknownSync(Settings)(saved).vim).toBe(false)
    expect(Schema.decodeUnknownSync(Settings)({ ...saved, vim: true }).vim).toBe(true)
  })

  it('steps the text size within bounds', () => {
    expect(resizedFont(18, 'bigger')).toBe(20)
    expect(resizedFont(18, 'smaller')).toBe(16)
    expect(resizedFont(FONT_SIZE.max, 'bigger')).toBe(FONT_SIZE.max)
    expect(resizedFont(FONT_SIZE.min, 'smaller')).toBe(FONT_SIZE.min)
    expect(resizedFont(30, 'normal')).toBe(FONT_SIZE.default)
  })

  it('cycles the counter through all modes and back', () => {
    expect(nextCounter('words')).toBe('characters')
    expect(nextCounter('characters')).toBe('reading')
    expect(nextCounter('reading')).toBe('speaking')
    expect(nextCounter('speaking')).toBe('words')
  })

  it('hands the editor a layer only when its switch is on', () => {
    const settings = defaultSettings(false)

    expect(syntaxOptions(settings)).toBeNull()
    expect(styleOptions(settings)).toBeNull()
    expect(syntaxOptions({ ...settings, syntax: true, verbs: false })?.verbs).toBe(false)
    expect(styleOptions({ ...settings, style: true })?.fillers).toBe(true)
  })
})
