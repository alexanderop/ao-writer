import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'

import { COACH_INSTRUCTIONS, coachPrompt, parseProfile, parseReply, reflectPrompt } from '../../core/coach/note.ts'
import { wordsForCoach } from '../../core/coach/vocabulary.ts'

/*
The coach's server functions. They run on the local dev server, which talks to Claude Code over ACP on the writer's own
subscription and keeps the journal in Markdown files; the static GitHub Pages build has no server, so there every call
fails and the coach stays away.
*/

const Ask = Schema.Struct({ documentId: Schema.String, text: Schema.String, caret: Schema.Number, wordTurn: Schema.Boolean })

/** Asks the coach for one note on the draft, with the writer's profile and word book beside it. */
export const askCoach = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Ask))
  .handler(async ({ data }) => {
    const { coachConnection } = await import('./acp.ts')
    const { readProfile, readVocabulary } = await import('./journal.ts')
    const context = { profile: await readProfile(), words: wordsForCoach(await readVocabulary()), wordTurn: data.wordTurn }
    const reply = await coachConnection(COACH_INSTRUCTIONS).prompt(data.documentId, coachPrompt(data.text, data.caret, context))

    return { note: parseReply(reply) }
  })

const Reflect = Schema.Struct({ documentId: Schema.String })

/** Has the coach rewrite the writer profile from what it saw in this document; a document it never saw changes nothing. */
export const reflectCoach = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Reflect))
  .handler(async ({ data }) => {
    const { coachConnection } = await import('./acp.ts')
    const { readProfile, writeProfile } = await import('./journal.ts')
    const connection = coachConnection(COACH_INSTRUCTIONS)

    if (!connection.knows(data.documentId)) return { profile: null }

    const profile = parseProfile(await connection.prompt(data.documentId, reflectPrompt(await readProfile())))

    if (profile !== null) await writeProfile(profile)

    return { profile }
  })

const Learn = Schema.Struct({ word: Schema.String, meaning: Schema.String, insteadOf: Schema.String, sentence: Schema.String, learned: Schema.String })

/** Puts a word the writer took from a word note into their word book. */
export const learnWord = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Learn))
  .handler(async ({ data }) => {
    const journal = await import('./journal.ts')

    return { words: await journal.learnWord(data) }
  })

/** The journal as the sidebar shows it: the profile, the word book, and where both live on disk. */
export const readJournal = createServerFn({ method: 'GET' }).handler(async () => {
  const { journalDirectory, readProfile, readVocabulary } = await import('./journal.ts')

  return { profile: await readProfile(), words: await readVocabulary(), directory: journalDirectory }
})
