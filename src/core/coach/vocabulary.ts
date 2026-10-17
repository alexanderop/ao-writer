/** A word the writer learned from the coach, and the sentence where they first used it. */
export interface LearnedWord {
  readonly word: string
  readonly meaning: string
  /** The weak word or phrase it replaced. */
  readonly insteadOf: string
  readonly sentence: string
  /** The day it was learned, as YYYY-MM-DD. */
  readonly learned: string
}

const HEADER = '# Word book\n\nWords you picked up from the coach. Newest first.\n'

const FIELD = /^- (meaning|instead of|learned|first used): (.*)$/

/** The word book as Markdown, newest word first; it is the file on disk, so it reads well on its own. */
export function formatVocabulary(words: readonly LearnedWord[]): string {
  const entries = words.map(
    (entry) => `## ${entry.word}\n\n- meaning: ${entry.meaning}\n- instead of: ${entry.insteadOf}\n- learned: ${entry.learned}\n- first used: ${entry.sentence.replace(/\s+/g, ' ')}\n`,
  )

  return [HEADER, ...entries].join('\n')
}

/** The words in a word book file; anything it does not recognise is skipped. */
export function parseVocabulary(markdown: string): LearnedWord[] {
  const words: LearnedWord[] = []

  for (const section of markdown.split(/^## /m).slice(1)) {
    const [title = '', ...lines] = section.split('\n')
    const fields = new Map<string, string>()

    for (const line of lines) {
      const match = FIELD.exec(line.trim())

      if (match?.[1] !== undefined && match[2] !== undefined) fields.set(match[1], match[2].trim())
    }

    const word = title.trim()

    if (word === '') continue

    words.push({
      word,
      meaning: fields.get('meaning') ?? '',
      insteadOf: fields.get('instead of') ?? '',
      learned: fields.get('learned') ?? '',
      sentence: fields.get('first used') ?? '',
    })
  }

  return words
}

/** The word book with one word added in front; learning a word again replaces its old entry. */
export function addWord(words: readonly LearnedWord[], entry: LearnedWord): LearnedWord[] {
  return [entry, ...words.filter((candidate) => candidate.word.toLowerCase() !== entry.word.toLowerCase())]
}

/** The word book as the coach reads it: one short line per word, with the sentence the coach itself put it in. */
export function wordsForCoach(words: readonly LearnedWord[]): string {
  return words.map((entry) => `- ${entry.word} (instead of "${entry.insteadOf}"): ${entry.meaning}. Taken from you in: "${entry.sentence}"`).join('\n')
}
