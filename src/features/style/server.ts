import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'

import { checkStyle } from '../../core/style/check.ts'
import { parseStyleSuggestion, STYLE_INSTRUCTIONS, stylePrompt } from '../../core/style/suggestion.ts'
import { wordsForCoach } from '../../core/coach/vocabulary.ts'

const Ask = Schema.Struct({ text: Schema.String, start: Schema.Number, end: Schema.Number, kind: Schema.Literals(['filler', 'cliche', 'redundancy']) })

/** A fresh session uses the same coach, teaching principles, profile and word book. */
export const askStyleSuggestion = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Ask))
  .handler(async ({ data }) => {
    const match = checkStyle(data.text, new Set([data.kind])).find((entry) => entry.start === data.start && entry.end === data.end)

    if (!match) throw new Error('This style flag has changed.')

    const { coachConnection } = await import('../coach/acp.ts')
    const { readProfile, readVocabulary } = await import('../coach/journal.ts')
    const context = { profile: await readProfile(), words: wordsForCoach(await readVocabulary()), wordTurn: false }
    const reply = await coachConnection().prompt(`style:${crypto.randomUUID()}`, STYLE_INSTRUCTIONS, stylePrompt(data.text, match, context))
    const suggestion = parseStyleSuggestion(reply, data.text, match)

    if (!suggestion) throw new Error('The coach did not return a suggestion for this passage.')

    return suggestion
  })
