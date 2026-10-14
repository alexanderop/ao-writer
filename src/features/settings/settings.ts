import { Schema } from 'effect'

import type { StyleOptions, SyntaxOptions } from '../../core/editor/annotate.ts'

/** The serif-free typefaces iA released under the OFL. */
const TYPEFACES = ['duo', 'mono', 'quattro'] as const

/** What the status bar counter shows; a click moves to the next. */
const COUNTER_MODES = ['words', 'characters', 'reading', 'speaking'] as const

/** Everything the writer can switch, saved in the browser. */
export const Settings = Schema.Struct({
  theme: Schema.Literals(['light', 'dark']),
  typeface: Schema.Literals(TYPEFACES),
  fontSize: Schema.Number,
  sidebar: Schema.Boolean,
  counter: Schema.Literals(COUNTER_MODES),
  lastDocument: Schema.NullOr(Schema.String),
  focus: Schema.Boolean,
  focusScope: Schema.Literals(['sentence', 'paragraph']),
  typewriter: Schema.Boolean,
  syntax: Schema.Boolean,
  nouns: Schema.Boolean,
  verbs: Schema.Boolean,
  adjectives: Schema.Boolean,
  adverbs: Schema.Boolean,
  conjunctions: Schema.Boolean,
  style: Schema.Boolean,
  fillers: Schema.Boolean,
  cliches: Schema.Boolean,
  redundancies: Schema.Boolean,
  preview: Schema.Boolean,
  previewLayout: Schema.Literals(['split', 'full']),
})

export type Settings = typeof Settings.Type

/** The text size step for "bigger" and "smaller", and its bounds. */
export const FONT_SIZE = { default: 18, min: 12, max: 36, step: 2 } as const

/** What a first-time visitor gets; the theme follows the system. */
export function defaultSettings(prefersDark: boolean): Settings {
  return {
    theme: prefersDark ? 'dark' : 'light',
    typeface: 'duo',
    fontSize: FONT_SIZE.default,
    sidebar: false,
    counter: 'words',
    lastDocument: null,
    focus: false,
    focusScope: 'sentence',
    typewriter: false,
    syntax: false,
    nouns: true,
    verbs: true,
    adjectives: true,
    adverbs: true,
    conjunctions: true,
    style: false,
    fillers: true,
    cliches: true,
    redundancies: true,
    preview: false,
    previewLayout: 'split',
  }
}

/** The text size one step bigger or smaller, or the default. */
export function resizedFont(current: number, direction: 'bigger' | 'smaller' | 'normal'): number {
  if (direction === 'normal') return FONT_SIZE.default

  const next = direction === 'bigger' ? current + FONT_SIZE.step : current - FONT_SIZE.step

  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, next))
}

/** The next counter in the click cycle. */
export function nextCounter(current: Settings['counter']): Settings['counter'] {
  const index = COUNTER_MODES.indexOf(current)

  return COUNTER_MODES[(index + 1) % COUNTER_MODES.length] ?? 'words'
}

/** The syntax layer for the editor, or null when it is off. */
export function syntaxOptions(settings: Settings): SyntaxOptions | null {
  if (!settings.syntax) return null

  return {
    nouns: settings.nouns,
    verbs: settings.verbs,
    adjectives: settings.adjectives,
    adverbs: settings.adverbs,
    conjunctions: settings.conjunctions,
  }
}

/** The style layer for the editor, or null when it is off. */
export function styleOptions(settings: Settings): StyleOptions | null {
  if (!settings.style) return null

  return { fillers: settings.fillers, cliches: settings.cliches, redundancies: settings.redundancies }
}
