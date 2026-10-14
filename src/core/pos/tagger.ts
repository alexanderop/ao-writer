import {
  BARE_INFINITIVE_TRIGGERS,
  BE_FORMS,
  CONTRACTION_PRONOUNS,
  HAVE_FORMS,
  LEXICON,
  LINKING_FORMS,
  POSSESSIVES,
  SUBJECT_PRONOUNS,
} from './lexicon.ts'

/** Coarse part-of-speech categories. Auxiliaries and modals count as verbs. */
export type PosTag = 'noun' | 'verb' | 'adj' | 'adv' | 'conj' | 'det' | 'prep' | 'pron' | 'num' | 'other'

/** One word of the input. `[start, end)` are offsets into the original string. */
export interface TaggedToken {
  readonly start: number
  readonly end: number
  readonly text: string
  readonly tag: PosTag
}

const NOUN: readonly PosTag[] = ['noun']

const VERB: readonly PosTag[] = ['verb']

const ADJ: readonly PosTag[] = ['adj']

const ADV: readonly PosTag[] = ['adv']

const PRON: readonly PosTag[] = ['pron']

const NUM: readonly PosTag[] = ['num']

const ADJ_ADV: readonly PosTag[] = ['adj', 'adv']

const NOUN_VERB: readonly PosTag[] = ['noun', 'verb']

const VERB_NOUN: readonly PosTag[] = ['verb', 'noun']

const ED_FORM: readonly PosTag[] = ['verb', 'adj']

const ING_FORM: readonly PosTag[] = ['verb', 'noun', 'adj']

const NOUN_SUFFIXES: readonly string[] = [
  'tion',
  'sion',
  'ment',
  'ness',
  'ity',
  'ism',
  'ist',
  'ance',
  'ence',
  'ship',
  'hood',
  'er',
  'or',
  'ure',
  'age',
  'dom',
  'ology',
  'ics',
  'ian',
]

const ADJ_SUFFIXES: readonly string[] = [
  'ous',
  'ful',
  'ive',
  'able',
  'ible',
  'al',
  'ic',
  'less',
  'ish',
  'ary',
  'ent',
  'ant',
]

const VERB_SUFFIXES: readonly string[] = ['ize', 'ify']

const LETTER_OR_MARK = /[\p{L}\p{M}]/u

const CODE_DOT = 46

const CODE_COMMA = 44

const CODE_HYPHEN = 45

const CODE_APOSTROPHE = 39

const CODE_CURLY_APOSTROPHE = 8217

const CODE_NEWLINE = 10

const CODE_BANG = 33

const CODE_QUESTION = 63

const CODE_ELLIPSIS = 8230

function isDigitCode(code: number): boolean {
  return code >= 48 && code <= 57
}

function isLetterAt(text: string, index: number): boolean {
  const code = text.charCodeAt(index)

  if (code < 128) {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
  }

  return LETTER_OR_MARK.test(text.charAt(index))
}

function tagsOf(word: string): readonly PosTag[] | undefined {
  return LEXICON.get(word)
}

/**
 * Finds a lexicon base form for a word with its ending removed. Tries the stem as
 * is, with a restored "e", with a doubled consonant removed and with "i" turned back
 * into "y". Returns the tags of the first base that carries `tag`.
 */
function baseTagsFor(stem: string, tag: PosTag): readonly PosTag[] | undefined {
  if (stem.length < 2) {
    return undefined
  }

  const direct = tagsOf(stem)

  if (direct?.includes(tag)) {
    return direct
  }

  const withE = tagsOf(`${stem}e`)

  if (withE?.includes(tag)) {
    return withE
  }

  const last = stem.length - 1

  if (stem.charAt(last) === stem.charAt(last - 1)) {
    const undoubled = tagsOf(stem.slice(0, last))

    if (undoubled?.includes(tag)) {
      return undoubled
    }
  }

  if (stem.charAt(last) === 'i') {
    const withY = tagsOf(`${stem.slice(0, last)}y`)

    if (withY?.includes(tag)) {
      return withY
    }
  }

  return undefined
}

/** Candidate tags for the plural of a noun or the third person form of a verb. */
function pluralOrThirdPerson(word: string): readonly PosTag[] | undefined {
  const bases: string[] = []

  if (word.endsWith('ies')) {
    bases.push(`${word.slice(0, -3)}y`)
  }

  if (word.endsWith('es')) {
    bases.push(word.slice(0, -2))
  }

  bases.push(word.slice(0, -1))

  for (const base of bases) {
    const tags = tagsOf(base)

    if (tags === undefined) {
      continue
    }

    const nounIndex = tags.indexOf('noun')
    const verbIndex = tags.indexOf('verb')

    if (nounIndex >= 0 && verbIndex >= 0) {
      return nounIndex < verbIndex ? NOUN_VERB : VERB_NOUN
    }

    if (nounIndex >= 0) {
      return NOUN
    }

    if (verbIndex >= 0) {
      return VERB
    }
  }

  return undefined
}

/** Derives tags for a regular inflected form of a lexicon word, or undefined. */
function inflect(word: string): readonly PosTag[] | undefined {
  const length = word.length

  if (length < 4) {
    return undefined
  }

  if (length >= 5 && word.endsWith('ing') && baseTagsFor(word.slice(0, -3), 'verb') !== undefined) {
    return ING_FORM
  }

  if (word.endsWith('ed') && baseTagsFor(word.slice(0, -2), 'verb') !== undefined) {
    return ED_FORM
  }

  if (length >= 5 && word.endsWith('est') && baseTagsFor(word.slice(0, -3), 'adj') !== undefined) {
    return ADJ
  }

  if (word.endsWith('er')) {
    const base = baseTagsFor(word.slice(0, -2), 'adj')

    if (base !== undefined) {
      return base.includes('adv') ? ADJ_ADV : ADJ
    }
  }

  if (word.endsWith('s') && !word.endsWith('ss')) {
    return pluralOrThirdPerson(word)
  }

  return undefined
}

/** Guesses tags for a word the lexicon and inflection rules know nothing about. */
function guessFromSuffix(word: string): readonly PosTag[] {
  const length = word.length

  if (length > 3 && word.endsWith('ly')) {
    return ADV
  }

  if (length > 4 && word.endsWith('ing')) {
    return ING_FORM
  }

  if (length > 3 && word.endsWith('ed')) {
    return ED_FORM
  }

  for (const suffix of NOUN_SUFFIXES) {
    if (length > suffix.length + 1 && word.endsWith(suffix)) {
      return NOUN
    }
  }

  for (const suffix of ADJ_SUFFIXES) {
    if (length > suffix.length + 1 && word.endsWith(suffix)) {
      return ADJ
    }
  }

  for (const suffix of VERB_SUFFIXES) {
    if (length > suffix.length + 1 && word.endsWith(suffix)) {
      return VERB
    }
  }

  return NOUN
}

/** Contractions: "don't" is a verb, "I'm" and "it's" are pronouns, "Anna's" is a noun. */
function contraction(word: string): readonly PosTag[] {
  if (word.endsWith("n't")) {
    return VERB
  }

  const split = word.lastIndexOf("'")
  const stem = word.slice(0, split)
  const ending = word.slice(split + 1)

  if (ending !== 's' && ending !== 're' && ending !== 've' && ending !== 'll' && ending !== 'd' && ending !== 'm') {
    return NOUN
  }

  if (stem === 'let') {
    return VERB
  }

  return CONTRACTION_PRONOUNS.has(stem) ? PRON : NOUN
}

/** Compounds such as "well-known" or "mother-in-law". */
function hyphenated(word: string): readonly PosTag[] {
  const parts = word.split('-')
  const first = parts[0] ?? ''
  const last = parts[parts.length - 1] ?? ''
  const firstTag = tagsOf(first)?.[0]

  if (isDigitCode(first.charCodeAt(0)) || firstTag === 'num') {
    return ADJ
  }

  if (last.endsWith('ed') || last.endsWith('ing') || last.endsWith('en') || last.endsWith('wn')) {
    return ADJ
  }

  if (firstTag === 'adv' || firstTag === 'adj') {
    return ADJ
  }

  return tagsOf(last) ?? inflect(last) ?? guessFromSuffix(last)
}

function candidatesFor(word: string, lower: string, capitalised: boolean, atSentenceStart: boolean): readonly PosTag[] {
  if (isDigitCode(lower.charCodeAt(0))) {
    return NUM
  }

  const direct = tagsOf(lower)

  if (direct !== undefined) {
    return direct
  }

  if (lower.includes("'")) {
    return contraction(lower)
  }

  if (lower.includes('-')) {
    return hyphenated(lower)
  }

  const inflected = inflect(lower)

  if (inflected !== undefined) {
    return inflected
  }

  if (capitalised && !atSentenceStart && word.length > 0) {
    return NOUN
  }

  return guessFromSuffix(lower)
}

interface Scanned {
  readonly starts: number[]
  readonly ends: number[]
  readonly lowers: string[]
  readonly candidates: (readonly PosTag[])[]
  readonly sentenceStarts: boolean[]
  readonly capitals: boolean[]
}

/** Splits the text into word tokens and attaches lexical candidates to each. */
function scan(text: string): Scanned {
  const scanned: Scanned = {
    starts: [],
    ends: [],
    lowers: [],
    candidates: [],
    sentenceStarts: [],
    capitals: [],
  }

  const length = text.length
  let atSentenceStart = true
  let index = 0

  while (index < length) {
    const code = text.charCodeAt(index)
    const startsWord = isLetterAt(text, index)

    if (!startsWord && !isDigitCode(code)) {
      if (
        code === CODE_DOT ||
        code === CODE_BANG ||
        code === CODE_QUESTION ||
        code === CODE_NEWLINE ||
        code === CODE_ELLIPSIS
      ) {
        atSentenceStart = true
      }

      index += 1
      continue
    }

    let end = index + 1
    let curly = false

    if (startsWord) {
      while (end < length) {
        const next = text.charCodeAt(end)

        if (isLetterAt(text, end) || isDigitCode(next)) {
          end += 1
        } else if (
          (next === CODE_APOSTROPHE || next === CODE_CURLY_APOSTROPHE || next === CODE_HYPHEN) &&
          end + 1 < length &&
          (isLetterAt(text, end + 1) || (next === CODE_HYPHEN && isDigitCode(text.charCodeAt(end + 1))))
        ) {
          curly = curly || next === CODE_CURLY_APOSTROPHE
          end += 2
        } else {
          break
        }
      }
    } else {
      while (end < length) {
        const next = text.charCodeAt(end)

        if (isDigitCode(next) || isLetterAt(text, end)) {
          end += 1
        } else if ((next === CODE_DOT || next === CODE_COMMA) && end + 1 < length && isDigitCode(text.charCodeAt(end + 1))) {
          end += 2
        } else {
          break
        }
      }
    }

    const word = text.slice(index, end)
    const lowered = word.toLowerCase()
    const lower = curly ? lowered.replace('’', "'") : lowered
    const capitalised = word.charAt(0) !== lowered.charAt(0)

    scanned.starts.push(index)
    scanned.ends.push(end)
    scanned.lowers.push(lower)
    scanned.sentenceStarts.push(atSentenceStart)
    scanned.capitals.push(capitalised)
    scanned.candidates.push(candidatesFor(word, lower, capitalised, atSentenceStart))

    atSentenceStart = false
    index = end
  }

  return scanned
}

function hasNounLikeHead(candidates: readonly PosTag[] | undefined): boolean {
  return candidates !== undefined && candidates[0] === 'noun' && !candidates.includes('verb')
}

/** Picks one tag per token using the neighbouring words. Runs in a single left-to-right pass. */
function resolve(scanned: Scanned): PosTag[] {
  const count = scanned.starts.length
  const tags: PosTag[] = []
  let prevTag: PosTag | undefined
  let prevWord = ''
  let contentTag: PosTag | undefined
  let contentWord = ''

  for (let i = 0; i < count; i += 1) {
    const candidates = scanned.candidates[i] ?? NOUN

    if (scanned.sentenceStarts[i]) {
      prevTag = undefined
      prevWord = ''
      contentTag = undefined
      contentWord = ''
    }

    let chosen: PosTag = candidates[0] ?? 'noun'

    if (candidates.length > 1) {
      const hasNext = i + 1 < count && scanned.sentenceStarts[i + 1] !== true
      const nextCandidates = hasNext ? scanned.candidates[i + 1] : undefined
      const nextWord = hasNext ? (scanned.lowers[i + 1] ?? '') : ''
      const nextFirst = nextCandidates?.[0]
      const capitalMid = scanned.capitals[i] === true && scanned.sentenceStarts[i] !== true

      const atStart = prevTag === undefined

      const prevNP =
        prevTag === 'det' || prevTag === 'num' || (prevTag === 'pron' && POSSESSIVES.has(prevWord))

      const prevAdj = prevTag === 'adj'
      const prevPrep = prevTag === 'prep' && prevWord !== 'to'
      const afterBare = BARE_INFINITIVE_TRIGGERS.has(contentWord)
      const subjectBefore = contentTag === 'pron' && SUBJECT_PRONOUNS.has(contentWord)
      const nounBefore = contentTag === 'noun'
      const auxBefore = contentTag === 'verb' && (BE_FORMS.has(contentWord) || HAVE_FORMS.has(contentWord))
      const beBefore = contentTag === 'verb' && (BE_FORMS.has(contentWord) || LINKING_FORMS.has(contentWord))

      const nextIsAux =
        nextWord !== '' &&
        (BE_FORMS.has(nextWord) || HAVE_FORMS.has(nextWord) || BARE_INFINITIVE_TRIGGERS.has(nextWord))

      const nextNoun = nextFirst === 'noun'

      const nextNounPhrase =
        nextFirst === 'det' ||
        nextFirst === 'noun' ||
        nextFirst === 'adj' ||
        nextFirst === 'num' ||
        nextFirst === 'pron'

      const nextStartsPhrase = nextNounPhrase || nextCandidates?.includes('noun') === true
      const detLike = hasNounLikeHead(nextCandidates) || nextFirst === 'adj' || nextFirst === 'num'
      const hasAdj = candidates.includes('adj')
      const isIng = (scanned.lowers[i] ?? '').endsWith('ing')

      let bestScore = Number.NEGATIVE_INFINITY

      for (let k = 0; k < candidates.length; k += 1) {
        const tag = candidates[k] ?? 'noun'
        let score = -k

        switch (tag) {
          case 'noun':
            if (prevNP) {
              score += 3
            } else if (prevAdj) {
              score += 0.8
            } else if (prevPrep) {
              score += 1
            }

            if (afterBare && !prevNP && !prevAdj) score -= 3

            if (subjectBefore && !prevNP) score -= 1.5

            if (capitalMid) score += 1.5

            if (atStart && nextIsAux) score += 2.5

            if (hasAdj && nextNoun) score -= 1
            break

          case 'verb':
            if (afterBare) {
              score += 3
            } else if (subjectBefore) {
              score += 2
            } else if (nounBefore) {
              score += nextNoun ? 0 : 1.6
            } else if (auxBefore) {
              score += 1.5
            }

            if (prevNP) {
              score -= 3
            } else if (prevAdj) {
              score -= 1.5
            } else if (prevPrep && !isIng) {
              score -= 1.5
            }

            if (atStart) {
              if (nextIsAux) {
                score -= 3
              } else if (
                nextFirst === 'det' ||
                nextFirst === 'pron' ||
                nextFirst === 'adv' ||
                nextFirst === 'verb'
              ) {
                score += 2.5
              }
            }

            if (!prevNP && (nextFirst === 'det' || nextFirst === 'num' || POSSESSIVES.has(nextWord))) {
              score += 1
            }

            break

          case 'adj':
            if (nextNoun) {
              score += 2.5
            } else if (nextFirst === 'adj') {
              score += 1.5
            } else if (beBefore) {
              score += 1
            }

            break

          case 'adv':
            if (nextFirst === 'adj' || nextFirst === 'adv') score += 2

            if (contentTag === 'verb' && !beBefore && !nextNounPhrase) score += 2

            if (candidates.includes('prep') && !nextStartsPhrase) score += 2

            if (atStart && nextIsAux && candidates.includes('conj')) score += 2.5
            break

          case 'prep':
            if (nextStartsPhrase) score += 2
            break

          case 'conj':
            if (SUBJECT_PRONOUNS.has(nextWord)) {
              score += 2
            } else if (candidates[0] === 'adv' && nextFirst === 'det') {
              score += 1.5
            }

            break

          case 'det':
            if (detLike) score += 2.5
            break

          case 'pron':
            if (candidates.includes('det')) {
              if (!detLike) score += 2
            } else if (BE_FORMS.has(nextWord)) {
              score += 3
            } else if (candidates.includes('num') && (prevAdj || prevNP) && !nextNoun) {
              score += 2
            }

            break

          default:
            break
        }

        if (score > bestScore) {
          bestScore = score
          chosen = tag
        }
      }
    }

    tags.push(chosen)
    prevTag = chosen
    prevWord = scanned.lowers[i] ?? ''

    if (chosen !== 'adv') {
      contentTag = chosen
      contentWord = prevWord
    }
  }

  return tags
}

/**
 * Splits `text` into word tokens and tags each one with a coarse part of speech.
 * Whitespace and punctuation produce no tokens. Runs in time linear in the text length.
 */
export function tagText(text: string): readonly TaggedToken[] {
  const scanned = scan(text)
  const tags = resolve(scanned)
  const tokens: TaggedToken[] = []

  for (let i = 0; i < tags.length; i += 1) {
    const start = scanned.starts[i] ?? 0
    const end = scanned.ends[i] ?? start

    tokens.push({ start, end, text: text.slice(start, end), tag: tags[i] ?? 'noun' })
  }

  return tokens
}
