import { Schema } from 'effect'

/** A German cue for one English word, with enough context to disambiguate it. */
export const PracticeWord = Schema.Struct({
  word: Schema.NonEmptyString,
  german: Schema.NonEmptyString,
  sentence: Schema.String,
  explanation: Schema.String,
})

export interface PracticeWord extends Schema.Schema.Type<typeof PracticeWord> {}

const Card = Schema.Struct({
  ...PracticeWord.fields,
  id: Schema.String,
  mistakes: Schema.Array(Schema.String),
  occurrences: Schema.Number,
  streak: Schema.Number,
  due: Schema.Number,
  lastReviewed: Schema.NullOr(Schema.Number),
})

export interface Card extends Schema.Schema.Type<typeof Card> {}

export const Learning = Schema.Struct({ rememberCorrections: Schema.Boolean, cards: Schema.Array(Card) })

export interface Learning extends Schema.Schema.Type<typeof Learning> {}

export const emptyLearning: Learning = { rememberCorrections: false, cards: [] }

export function wordKey(word: string): string {
  return word.trim().normalize('NFC').toLocaleLowerCase('en')
}

/** Repeated mistakes keep their history and become due again; imports never reset progress. */
export function rememberWord(cards: readonly Card[], entry: PracticeWord, now: number, mistake = ''): readonly Card[] {
  const id = wordKey(entry.word)

  if (id === '' || entry.german.trim() === '') return cards
  const previous = cards.find((card) => card.id === id)
  const repeated = mistake.trim() !== ''

  const card: Card = {
    ...entry, word: entry.word.trim(), german: entry.german.trim(), id,
    mistakes: [...new Set([...(previous?.mistakes ?? []), ...(repeated ? [mistake.trim()] : [])])],
    occurrences: (previous?.occurrences ?? 0) + (repeated ? 1 : 0),
    streak: repeated ? 0 : previous?.streak ?? 0,
    due: repeated ? now : previous?.due ?? now,
    lastReviewed: previous?.lastReviewed ?? null,
  }

  return [card, ...cards.filter((candidate) => candidate.id !== id)]
}

/** Only the target spelling is accepted. Capitalisation and surrounding whitespace are ignored. */
export function correctAnswer(card: PracticeWord, answer: string): boolean {
  return wordKey(answer) === wordKey(card.word)
}

const DAY = 86_400_000

const INTERVALS = [1, 3, 7, 14, 30]

/** A revealed answer or a failed first attempt cannot advance the review interval. */
export function reviewCard(card: Card, recalled: boolean, now: number): Card {
  const streak = recalled ? card.streak + 1 : 0
  const days = recalled ? INTERVALS[Math.min(streak - 1, INTERVALS.length - 1)] ?? 1 : 1

  return { ...card, streak, lastReviewed: now, due: now + days * DAY }
}

/** Most often misspelled words take priority among overdue cards. */
export function practiceQueue(cards: readonly Card[], now: number): readonly Card[] {
  return cards.filter((card) => card.due <= now)
    .toSorted((a, b) => b.occurrences - a.occurrences || a.due - b.due)
    .slice(0, 5)
}

/** Hide every occurrence of the answer, including punctuation-adjacent occurrences. */
export function maskedSentence(entry: PracticeWord): string {
  if (entry.word.trim() === '') return ''
  const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return entry.sentence.replace(new RegExp(escaped, 'gi'), '___')
}
