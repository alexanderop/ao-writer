/** Words per minute used for reading time. */
const READING_WPM = 220

/** Words per minute used for speaking time. */
const SPEAKING_WPM = 150

/** Everything the status bar can show about a piece of text. */
export interface TextCounts {
  readonly words: number
  readonly characters: number
  readonly charactersNoSpaces: number
  readonly sentences: number
  readonly paragraphs: number
  readonly readingSeconds: number
  readonly speakingSeconds: number
}

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

const SENTENCE_END = /[.!?]+(?=\s|$)/g

const NON_SPACE = /\S/g

function countMatches(text: string, pattern: RegExp): number {
  let count = 0

  for (const _match of text.matchAll(pattern)) count += 1

  return count
}

function countParagraphs(text: string): number {
  let count = 0
  let inside = false

  for (const line of text.split('\n')) {
    const blank = line.trim() === ''

    if (!blank && !inside) count += 1

    inside = !blank
  }

  return count
}

/** Counts words, characters, sentences, paragraphs and the derived reading and speaking times. */
export function countText(text: string): TextCounts {
  const words = countMatches(text, WORD)

  return {
    words,
    characters: text.length,
    charactersNoSpaces: countMatches(text, NON_SPACE),
    sentences: countMatches(text, SENTENCE_END),
    paragraphs: countParagraphs(text),
    readingSeconds: Math.round((words / READING_WPM) * 60),
    speakingSeconds: Math.round((words / SPEAKING_WPM) * 60),
  }
}

/** Formats a duration the way the counter shows it: "0 min", "40 sec", "3 min", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 min'

  if (seconds < 60) return `${seconds} sec`

  const minutes = Math.round(seconds / 60)

  if (minutes < 60) return `${minutes} min`

  const rest = minutes % 60

  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`
}
