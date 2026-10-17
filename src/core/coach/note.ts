import { Effect, Option, Schema } from 'effect'

import type { TextEdit } from '../markdown/format.ts'
import { paragraphRange } from '../text/focus.ts'

/** A stronger word the coach offers: the word, what sets it apart, and the quoted passage rewritten with it. */
export const WordOption = Schema.Struct({ word: Schema.String, meaning: Schema.String, replacement: Schema.String })

export type WordOption = typeof WordOption.Type

/** One margin note: the passage it is about, the nudge, the principle behind it, an example rewrite, and for a word note the words to choose from. */
export const CoachNote = Schema.Struct({
  kind: Schema.Literals(['nudge', 'praise', 'word']),
  quote: Schema.String,
  note: Schema.String,
  why: Schema.String,
  after: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(''))),
  options: Schema.Array(WordOption).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  // the weak word alone, for the word book; the quote may carry a neighbour to be unique
  weak: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(''))),
})

export type CoachNote = typeof CoachNote.Type

/** The coach chose to say nothing this time. */
const Quiet = Schema.Struct({ quiet: Schema.Literal(true) })

const Reply = Schema.Union([CoachNote, Quiet])

const decodeReply = Schema.decodeUnknownOption(Schema.fromJsonString(Reply))

/** Drafts shorter than this get no note: there is nothing to teach on yet. */
export const MIN_WORDS = 30

/** How the coach behaves; it is told once, when a document's session starts. */
export const COACH_INSTRUCTIONS = `You are a writing teacher sitting beside a writer while they draft in a Markdown editor. From time to time you are shown the draft.

Give at most ONE note: the single most useful thing for the writer to learn right now, like a pencil mark in the margin.
- Teach, do not edit. Ask a question or name the pattern ("the point arrives in the third sentence"), then stop.
- Prefer clarity, structure, argument and voice over typos and grammar.
- About one time in four, when something is genuinely good, say so specifically (kind "praise").
- Never repeat a note you already gave in this conversation, unless the writer made it worse.
- Look at the paragraph the writer is working on first, but you may point anywhere in the draft.
- If nothing is worth saying, stay quiet. Silence is a good answer.
- Answer in the language of the draft.
- Speak to the writer as "you", also in the profile. Never guess their gender or name.

You also grow the writer's vocabulary. A word note (kind "word") picks ONE vague, weak or overused word or phrase ("very confusing", "good", "a lot of", "basically") and offers two or three precise words that could replace it. For each, say in a few words what sets it apart from the others, so the writer learns the nuance, not just a synonym. Mark the best fit for this sentence by listing it first. Prefer words a good writer uses, not rare or showy ones.

You may be given the writer's profile (their strengths and habits across earlier drafts) and their word book (words they learned from you). Use the profile to judge progress: notice when a habit is fixed or comes back. When the writer uses a word from their word book on their own and uses it well, say so (kind "praise"); that matters to them. The sentence a word was taken in does not count: you put the word there. Do not offer a word they already learned as a new one.

Reply with JSON only, no code fence, in one of these shapes:
{"quiet": true}
{"kind": "nudge" | "praise", "quote": "<a short passage copied character for character from the draft, at most one sentence>", "note": "<at most two short sentences>", "why": "<at most three sentences: the principle behind the note>", "after": "<your rewrite of exactly the quoted passage, as an example; empty for praise>"}
{"kind": "word", "quote": "<only the weak word or phrase itself, one to four words copied character for character; add a neighbouring word only if it appears more than once in the draft>", "weak": "<the weak word or phrase alone, without neighbours>", "note": "<one sentence: what is weak about it>", "why": "<at most two sentences: the general lesson>", "options": [{"word": "<the word>", "meaning": "<what sets it apart, at most twelve words>", "replacement": "<the quoted text rewritten with this word, grammar adjusted>"}]}`

/** What the coach knows about the writer besides the draft. */
export interface CoachContext {
  /** The writer profile the coach keeps across documents; empty before the first one. */
  readonly profile: string
  /** The word book in short: one line per learned word. */
  readonly words: string
  /** True when this note should teach a word, if any word in the draft is worth upgrading. */
  readonly wordTurn: boolean
}

/** What the coach is shown each time: the writer's profile and word book, the whole draft, and the paragraph under the caret. */
export function coachPrompt(text: string, caret: number, context: CoachContext): string {
  const { start, end } = paragraphRange(text, caret)
  const current = text.slice(start, end).trim()
  const profile = context.profile.trim() === '' ? '' : `The writer's profile:\n<profile>\n${context.profile.trim()}\n</profile>\n\n`
  const words = context.words === '' ? '' : `The writer's word book:\n<words>\n${context.words}\n</words>\n\n`
  const paragraph = current === '' ? '' : `The paragraph they are working on:\n<current>\n${current}\n</current>\n\n`
  const ask = context.wordTurn ? 'This time, give a word note if any word in the draft is worth upgrading. Your one note, as JSON.' : 'Your one note, as JSON.'

  return `${profile}${words}The draft so far:\n<draft>\n${text}\n</draft>\n\n${paragraph}${ask}`
}

/** Every this many notes the coach is asked to teach a word. */
export const WORD_EVERY = 3

/** What the coach is asked after a stretch of notes: rewrite the writer profile from what it saw. */
export function reflectPrompt(profile: string): string {
  const current = profile.trim() === '' ? 'There is no profile yet.' : `The current profile:\n<profile>\n${profile.trim()}\n</profile>`

  return `Step back from the margin notes. ${current}

Rewrite the writer profile from everything you saw of this writer in this conversation and the current profile. Address the writer as "you" throughout. It is what you will read before the next draft, so keep what still holds and update what changed. Use exactly these Markdown sections, short bullets, at most twelve bullets in all:

## Strengths
## Habits to work on
(end each habit with its status in brackets: [new], [improving], [fixed])
## Next focus
(one bullet: the one thing to practise next)

Reply with the Markdown profile only, nothing else.`
}

/** The profile in the coach's reply: its Markdown without a fence or a preamble, or null when there is none. */
export function parseProfile(reply: string): string | null {
  const unfenced = reply.replace(/^\s*```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '')
  const start = unfenced.indexOf('## ')

  return start === -1 ? null : unfenced.slice(start).trim()
}

/** The note in the coach's reply, or null when it stayed quiet or the reply was not a note. Tolerates prose or a fence around the JSON. */
export function parseReply(reply: string): CoachNote | null {
  const json = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)

  return decodeReply(json).pipe(
    Option.filter((decoded): decoded is CoachNote => 'note' in decoded && decoded.quote.trim() !== '' && decoded.note.trim() !== ''),
    // a word note without words to choose from has nothing to teach
    Option.filter((decoded) => decoded.kind !== 'word' || decoded.options.length > 0),
    Option.getOrNull,
  )
}

/** Where the note's quote sits in the text now: the occurrence nearest the old position, or null once the writer changed it. */
export function locateQuote(text: string, quote: string, near: number): { start: number; end: number } | null {
  let best = -1

  for (let index = text.indexOf(quote); index !== -1; index = text.indexOf(quote, index + 1)) {
    if (best === -1 || Math.abs(index - near) < Math.abs(best - near)) best = index
  }

  return best === -1 ? null : { start: best, end: best + quote.length }
}

/** The edit that puts the coach's example in place of the quote. */
export function suggestionEdit(range: { start: number; end: number }, after: string): TextEdit {
  const caret = range.start + after.length

  return { from: range.start, to: range.end, insert: after, selectionStart: caret, selectionEnd: caret }
}

/** How many characters differ between two versions of a text: everything between their common start and common end. */
export function changedChars(before: string, after: string): number {
  const shorter = Math.min(before.length, after.length)
  let prefix = 0

  while (prefix < shorter && before[prefix] === after[prefix]) prefix++

  let suffix = 0

  while (suffix < shorter - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++

  return Math.max(before.length, after.length) - prefix - suffix
}
