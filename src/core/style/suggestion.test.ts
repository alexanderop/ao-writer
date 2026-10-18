import { describe, expect, it } from 'vitest'

import { COACH_INSTRUCTIONS } from '../coach/note.ts'
import { checkStyle } from './check.ts'
import { parseStyleSuggestion, STYLE_INSTRUCTIONS, stylePrompt } from './suggestion.ts'

const text = 'This is really useful. It is really clear.'

const match = checkStyle(text)[1]!

describe('targeted style suggestions', () => {
  it('anchors a repeated phrase to the flagged occurrence', () => {
    const suggestion = parseStyleSuggestion(JSON.stringify({ quote: 'really ', after: '', note: 'Let the adjective carry the emphasis.' }), text, match)

    expect(suggestion).toEqual({ quote: 'really ', after: '', note: 'Let the adjective carry the emphasis.', start: 29, end: 36 })
  })

  it('rejects a quote about another occurrence or unrelated text', () => {
    expect(parseStyleSuggestion('{"quote":"really useful","after":"useful","note":"Cut the filler."}', text, match)).toBeNull()
    expect(parseStyleSuggestion('{"quote":"invented","after":"clear","note":"Be precise."}', text, match)).toBeNull()
  })

  it('rejects malformed replies and permits keeping justified wording', () => {
    expect(parseStyleSuggestion('not JSON', text, match)).toBeNull()
    expect(parseStyleSuggestion('{"quote":"really","after":42,"note":"Cut it."}', text, match)).toBeNull()
    expect(parseStyleSuggestion('{"quote":"really","after":"really","note":"The emphasis is deliberate."}', text, match)?.after).toBe('really')
  })

  it('shares the coach principles and includes the profile, vocabulary and exact occurrence', () => {
    const prompt = stylePrompt(text, match, { profile: 'Keep your conversational tone.', words: 'lucid: clear', wordTurn: false })

    expect(STYLE_INSTRUCTIONS.startsWith(COACH_INSTRUCTIONS)).toBe(true)
    expect(prompt).toContain('Keep your conversational tone.')
    expect(prompt).toContain('lucid: clear')
    expect(prompt).toContain(JSON.stringify(match))
  })
})
