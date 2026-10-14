import { CLICHES, FILLERS, REDUNDANCIES } from './lists.ts'

/** The three groups of style problems the checker looks for. */
export type StyleKind = 'filler' | 'cliche' | 'redundancy'

/** One flagged word or phrase. `[start, end)` are offsets into the checked text. */
export interface StyleMatch {
  readonly start: number
  readonly end: number
  readonly kind: StyleKind
  readonly text: string
}

interface Phrase {
  readonly words: readonly string[]
  readonly kind: StyleKind
}

const ALL_KINDS: ReadonlySet<StyleKind> = new Set<StyleKind>(['filler', 'cliche', 'redundancy'])

const NON_ASCII_WORD_CHAR = /[\p{L}\p{N}\p{M}]/u

const CODE_APOSTROPHE = 39

const CODE_CURLY_APOSTROPHE = 8217

const CODE_HYPHEN = 45

/** Builds the first-word index once. Longer phrases come first so that matching can stop early. */
function buildIndex(): ReadonlyMap<string, readonly Phrase[]> {
  const index = new Map<string, Phrase[]>()
  const seen = new Set<string>()

  const groups: readonly (readonly [StyleKind, readonly string[]])[] = [
    ['filler', FILLERS],
    ['cliche', CLICHES],
    ['redundancy', REDUNDANCIES],
  ]

  for (const [kind, list] of groups) {
    for (const entry of list) {
      if (seen.has(entry)) {
        continue
      }

      seen.add(entry)

      const words = entry.split(' ')
      const first = words[0] ?? ''
      const bucket = index.get(first)

      if (bucket === undefined) {
        index.set(first, [{ words, kind }])
      } else {
        bucket.push({ words, kind })
      }
    }
  }

  for (const bucket of index.values()) {
    bucket.sort((a, b) => b.words.length - a.words.length)
  }

  return index
}

const PHRASE_INDEX: ReadonlyMap<string, readonly Phrase[]> = buildIndex()

function isWordCharAt(text: string, index: number): boolean {
  const code = text.charCodeAt(index)

  if (code < 128) {
    return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
  }

  return NON_ASCII_WORD_CHAR.test(text.charAt(index))
}

function isSpaceCode(code: number): boolean {
  return (
    (code >= 9 && code <= 13) ||
    code === 32 ||
    code === 160 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  )
}

interface Words {
  readonly starts: number[]
  readonly ends: number[]
  readonly keys: string[]
  /** `joined[i]` is true when word i follows word i - 1 across only whitespace or one hyphen. */
  readonly joined: boolean[]
}

/** Splits the text into words, keeping apostrophes that sit inside a word. */
function splitWords(text: string): Words {
  const words: Words = { starts: [], ends: [], keys: [], joined: [] }
  const length = text.length
  let previousEnd = -1
  let index = 0

  while (index < length) {
    if (!isWordCharAt(text, index)) {
      index += 1
      continue
    }

    let end = index + 1
    let curly = false

    while (end < length) {
      const code = text.charCodeAt(end)

      if (isWordCharAt(text, end)) {
        end += 1
      } else if (
        (code === CODE_APOSTROPHE || code === CODE_CURLY_APOSTROPHE) &&
        end + 1 < length &&
        isWordCharAt(text, end + 1)
      ) {
        curly = curly || code === CODE_CURLY_APOSTROPHE
        end += 2
      } else {
        break
      }
    }

    let joined = false

    if (previousEnd >= 0) {
      joined = index - previousEnd === 1 && text.charCodeAt(previousEnd) === CODE_HYPHEN

      if (!joined) {
        joined = true

        for (let gap = previousEnd; gap < index; gap += 1) {
          if (!isSpaceCode(text.charCodeAt(gap))) {
            joined = false
            break
          }
        }
      }
    }

    const lowered = text.slice(index, end).toLowerCase()

    words.starts.push(index)
    words.ends.push(end)
    words.keys.push(curly ? lowered.replace('’', "'") : lowered)
    words.joined.push(joined)

    previousEnd = end
    index = end
  }

  return words
}

interface Candidate {
  readonly firstWord: number
  readonly lastWord: number
  readonly start: number
  readonly end: number
  readonly kind: StyleKind
}

function matchesAt(words: Words, first: number, phrase: Phrase): boolean {
  const count = phrase.words.length

  if (first + count > words.keys.length) {
    return false
  }

  for (let offset = 0; offset < count; offset += 1) {
    if (words.keys[first + offset] !== phrase.words[offset]) {
      return false
    }

    if (offset > 0 && words.joined[first + offset] !== true) {
      return false
    }
  }

  return true
}

/**
 * Finds fillers, cliches and redundant phrases. Matching ignores case, respects word
 * boundaries and allows any whitespace (including a line break) between the words of a
 * phrase. Matches are sorted by position and never overlap: when two overlap the longer
 * one wins, and the earlier one wins a tie. Pass `kinds` to look for only some groups.
 */
export function checkStyle(text: string, kinds: ReadonlySet<StyleKind> = ALL_KINDS): readonly StyleMatch[] {
  if (text.length === 0 || kinds.size === 0) {
    return []
  }

  const words = splitWords(text)
  const candidates: Candidate[] = []

  for (let i = 0; i < words.keys.length; i += 1) {
    const bucket = PHRASE_INDEX.get(words.keys[i] ?? '')

    if (bucket === undefined) {
      continue
    }

    for (const phrase of bucket) {
      if (kinds.has(phrase.kind) && matchesAt(words, i, phrase)) {
        const lastWord = i + phrase.words.length - 1

        candidates.push({
          firstWord: i,
          lastWord,
          start: words.starts[i] ?? 0,
          end: words.ends[lastWord] ?? 0,
          kind: phrase.kind,
        })
      }
    }
  }

  if (candidates.length === 0) {
    return []
  }

  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)

  const taken = new Uint8Array(words.keys.length)
  const accepted: Candidate[] = []

  for (const candidate of candidates) {
    let free = true

    for (let word = candidate.firstWord; word <= candidate.lastWord; word += 1) {
      if (taken[word] === 1) {
        free = false
        break
      }
    }

    if (!free) {
      continue
    }

    for (let word = candidate.firstWord; word <= candidate.lastWord; word += 1) {
      taken[word] = 1
    }

    accepted.push(candidate)
  }

  accepted.sort((a, b) => a.start - b.start)

  return accepted.map((candidate) => ({
    start: candidate.start,
    end: candidate.end,
    kind: candidate.kind,
    text: text.slice(candidate.start, candidate.end),
  }))
}
