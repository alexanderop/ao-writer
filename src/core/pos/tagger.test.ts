import { describe, expect, it } from 'vitest'

import { tagText } from './tagger.ts'
import type { PosTag } from './tagger.ts'

/**
 * Hand-labelled sentences. Each word is written as `word/tag`; everything else
 * (punctuation, spacing) is plain text. The labels follow the coarse tagset:
 * auxiliaries and modals are verbs, "not" and wh-adverbs are adverbs, possessive
 * determiners ("my", "her") are pronouns, and "to" is always a preposition.
 */
const LABELLED: readonly string[] = [
  'The/det quiet/adj editor/noun reads/verb every/det sentence/noun twice/adv.',
  'She/pron wrote/verb a/det short/adj story/noun about/prep a/det lonely/adj lighthouse/noun.',
  'Do/verb you/pron want/verb to/prep write/verb something/pron new/adj this/det morning/noun?',
  "I/pron don't/verb know/verb why/adv the/det draft/noun feels/verb so/adv slow/adj.",
  "It's/pron a/det beautiful/adj day/noun, but/conj I'm/pron too/adv tired/adj to/prep walk/verb.",
  'The/det report/noun was/verb written/verb by/prep a/det tired/adj intern/noun.',
  'Her/pron new/adj desk/noun is/verb bigger/adj than/conj mine/pron.',
  'Nobody/pron has/verb ever/adv finished/verb the/det longest/adj chapter/noun without/prep a/det break/noun.',
  'Maria/noun opened/verb her/pron laptop/noun and/conj started/verb to/prep type/verb. The/det words/noun came/verb slowly/adv, but/conj then/adv they/pron flowed/verb quickly/adv.',
  'We/pron sold/verb 42/num copies/noun in/prep three/num weeks/noun and/conj earned/verb 1,000/num dollars/noun.',
  'Although/conj it/pron rained/verb all/det night/noun, the/det garden/noun looks/verb fresh/adj and/conj green/adj.',
  'Why/adv did/verb the/det old/adj clock/noun stop/verb at/prep midnight/noun?',
  'You/pron should/verb never/adv edit/verb while/conj you/pron are/verb writing/verb.',
  'Good/adj writing/noun needs/verb patience/noun, courage/noun, and/conj strong/adj coffee/noun.',
  "They/pron couldn't/verb find/verb the/det missing/adj page/noun anywhere/adv.",
  'The/det small/adj brown/adj dog/noun jumped/verb over/prep the/det lazy/adj fox/noun.',
  'John/noun and/conj Priya/noun walked/verb to/prep the/det station/noun together/adv.',
  'Reading/noun is/verb my/pron favorite/adj way/noun to/prep relax/verb.',
  'I/pron think/verb that/det idea/noun is/verb really/adv interesting/adj, but/conj it/pron needs/verb a/det clearer/adj focus/noun.',
  'Who/pron wrote/verb the/det first/adj draft/noun of/prep this/det essay/noun?',
  'Stop/verb talking/verb and/conj listen/verb carefully/adv!',
  'Her/pron brothers/noun often/adv visit/verb the/det farm/noun on/prep weekends/noun.',
  'A/det tiny/adj bird/noun sings/verb outside/prep my/pron window/noun every/det morning/noun.',
  'The/det weather/noun was/verb colder/adj yesterday/adv, and/conj the/det wind/noun blew/verb harder/adv.',
  'Can/verb we/pron finish/verb this/det chapter/noun before/prep dinner/noun?',
  'She/pron has/verb been/verb writing/verb since/prep dawn/noun, so/conj her/pron hands/noun are/verb sore/adj.',
  'Honestly/adv, the/det best/adj sentences/noun are/verb usually/adv the/det simplest/adj ones/noun.',
  'He/pron quickly/adv closed/verb the/det heavy/adj door/noun and/conj left/verb the/det empty/adj room/noun.',
  "Anna's/noun notebook/noun lies/verb on/prep the/det table/noun.",
  'This/pron is/verb not/adv the/det end/noun!',
  'There/pron is/verb a/det small/adj cafe/noun near/prep the/det river/noun.',
  'If/conj the/det ending/noun feels/verb weak/adj, rewrite/verb it/pron tomorrow/adv.',
  'Most/det readers/noun skim/verb long/adj paragraphs/noun without/prep much/det attention/noun.',
  'The/det Quiet/adj Art/noun of/prep Editing/noun',
  'Most/det people/noun think/verb writing/noun is/verb easy/adj, but/conj it\'s/pron actually/adv hard/adj work/noun.',
  'You/pron can/verb write/verb better/adv when/conj you/pron stop/verb judging/verb every/det word/noun.',
  'The/det lighthouse/noun keeper/noun climbed/verb the/det narrow/adj stairs/noun every/det evening/noun.',
  'What/pron makes/verb a/det draft/noun good/adj is/verb honest/adj feedback/noun.',
  'Two/num of/prep the/det authors/noun refused/verb to/prep change/verb their/pron titles/noun.',
  'I/pron wanted/verb to/prep call/verb you/pron, but/conj my/pron phone/noun died/verb.',
  'Her/pron voice/noun was/verb soft/adj and/conj steady/adj, almost/adv like/prep a/det whisper/noun.',
  'Nothing/pron beats/verb a/det blank/adj page/noun on/prep a/det quiet/adj morning/noun.',
  'The/det students/noun were/verb reading/verb silently/adv in/prep the/det library/noun.',
  'Remember/verb to/prep save/verb your/pron work/noun often/adv.',
  'This/det essay/noun argues/verb that/conj clear/adj prose/noun is/verb a/det moral/adj duty/noun.',
  'He/pron gave/verb me/pron a/det small/adj gift/noun and/conj a/det warm/adj smile/noun.',
  'It/pron was/verb late/adj, so/conj we/pron went/verb home/adv.',
  'Fresh/adj snow/noun covered/verb the/det quiet/adj street/noun.',
  'The/det best/adj way/noun to/prep learn/verb is/verb to/prep practice/verb daily/adv.',
  'Writing/noun is/verb mostly/adv about/prep rewriting/noun, and/conj rewriting/noun takes/verb time/noun.',
  'The/det old/adj man/noun sat/verb on/prep a/det bench/noun and/conj fed/verb the/det pigeons/noun.',
  'Please/other send/verb me/pron the/det latest/adj version/noun before/prep Friday/noun.',
  'A/det good/adj sentence/noun carries/verb one/num idea/noun and/conj nothing/pron else/adv.',
  'We/pron were/verb walking/verb home/adv when/conj it/pron suddenly/adv started/verb to/prep rain/verb.',
  'Short/adj words/noun are/verb usually/adv better/adj than/conj long/adj ones/noun.',
  'Which/det tool/noun do/verb you/pron use/verb for/prep your/pron daily/adj notes/noun?',
  'The/det cat/noun slept/verb under/prep the/det warm/adj lamp/noun all/det afternoon/noun.',
  'I/pron have/verb never/adv seen/verb such/det a/det quiet/adj town/noun.',
  'Don\'t/verb worry/verb, the/det deadline/noun is/verb not/adv until/prep next/adj month/noun.',
  'She/pron smiled/verb, picked/verb up/adv her/pron coffee/noun, and/conj began/verb to/prep read/verb.',
  'Every/det chapter/noun ends/verb with/prep a/det small/adj surprise/noun that/pron keeps/verb readers/noun curious/adj.',
  'The/det committee/noun will/verb announce/verb its/pron decision/noun tomorrow/adv.',
  'Our/pron new/adj app/noun feels/verb faster/adj and/conj simpler/adj than/conj the/det old/adj one/noun.',
  'They/pron argued/verb for/prep hours/noun about/prep a/det single/adj comma/noun.',
  'He/pron has/verb two/num brothers/noun and/conj three/num sisters/noun.',
  'If/conj you/pron cut/verb every/det adverb/noun, the/det prose/noun gets/verb tighter/adj.',
  'Birds/noun sing/verb loudly/adv before/prep sunrise/noun.',
]

const TAG_PATTERN = /\/(noun|verb|adj|adv|conj|det|prep|pron|num|other)/g

interface Labelled {
  readonly text: string
  readonly expected: readonly PosTag[]
}

function parseLabelled(annotated: string): Labelled {
  const expected: PosTag[] = []

  for (const match of annotated.matchAll(TAG_PATTERN)) {
    // SAFETY: the capture group is restricted to PosTag names by TAG_PATTERN.
    expected.push(match[1] as PosTag)
  }

  return { text: annotated.replace(TAG_PATTERN, ''), expected }
}

describe('tagText accuracy on hand-labelled sentences', () => {
  it('reaches at least 85 percent token accuracy', () => {
    let total = 0
    let correct = 0
    const report: string[] = []

    for (const annotated of LABELLED) {
      const { text, expected } = parseLabelled(annotated)
      const tokens = tagText(text)

      expect(tokens.map((token) => token.text).length, `token count for: ${text}`).toBe(expected.length)

      const misses: string[] = []

      tokens.forEach((token, index) => {
        total += 1

        if (token.tag === expected[index]) {
          correct += 1
        } else {
          misses.push(`${token.text} (expected ${expected[index]}, got ${token.tag})`)
        }
      })

      if (misses.length > 0) {
        report.push(`${text}\n    ${misses.join('\n    ')}`)
      }
    }

    const accuracy = correct / total

    expect(
      accuracy,
      `accuracy ${(accuracy * 100).toFixed(1)}% (${correct}/${total}). Mismatches:\n${report.join('\n')}`,
    ).toBeGreaterThanOrEqual(0.85)
  })

  it('has enough labelled sentences', () => {
    expect(LABELLED.length).toBeGreaterThanOrEqual(18)
  })
})

describe('tagText structure', () => {
  it('returns an empty list for an empty string', () => {
    expect(tagText('')).toEqual([])
  })

  it('returns an empty list for punctuation and whitespace only', () => {
    expect(tagText('  \n\n -- ... ?! \t ')).toEqual([])
  })

  it('reports offsets that slice back to the token text', () => {
    const text = 'The quiet editor, well-known for "short" sentences, doesn’t rush.'
    const tokens = tagText(text)

    expect(tokens.length).toBeGreaterThan(5)

    for (const token of tokens) {
      expect(text.slice(token.start, token.end)).toBe(token.text)
    }
  })

  it('never produces tokens for punctuation or whitespace', () => {
    const tokens = tagText('Hello,   world! (Really?) -- yes; no: maybe...')

    expect(tokens.map((token) => token.text)).toEqual(['Hello', 'world', 'Really', 'yes', 'no', 'maybe'])
  })

  it('keeps correct offsets across paragraphs', () => {
    const text = 'First paragraph here.\n\nSecond one follows.\nThird line'
    const tokens = tagText(text)

    expect(tokens.map((token) => token.text)).toEqual([
      'First',
      'paragraph',
      'here',
      'Second',
      'one',
      'follows',
      'Third',
      'line',
    ])

    for (const token of tokens) {
      expect(text.slice(token.start, token.end)).toBe(token.text)
    }

    expect(tokens[3]?.start).toBe(text.indexOf('Second'))
  })

  it('keeps hyphens and apostrophes inside one token', () => {
    const tokens = tagText("a well-known writer isn't done")

    expect(tokens.map((token) => token.text)).toEqual(['a', 'well-known', 'writer', "isn't", 'done'])
  })

  it('handles text where Markdown syntax was blanked to spaces', () => {
    const tokens = tagText('  Title here\n    quiet editor  ')

    expect(tokens.map((token) => token.text)).toEqual(['Title', 'here', 'quiet', 'editor'])
  })

  it('returns tokens in ascending, non-overlapping order', () => {
    const tokens = tagText('One two three, four five. Six seven! Eight?')
    let previousEnd = 0

    for (const token of tokens) {
      expect(token.start).toBeGreaterThanOrEqual(previousEnd)
      expect(token.end).toBeGreaterThan(token.start)
      previousEnd = token.end
    }
  })
})

describe('tagText contractions', () => {
  const tagOf = (text: string): PosTag | undefined => tagText(text)[0]?.tag

  it('tags negative contractions as verbs', () => {
    expect(tagOf("don't")).toBe('verb')
    expect(tagOf("can't")).toBe('verb')
    expect(tagOf("isn't")).toBe('verb')
    expect(tagOf("won't")).toBe('verb')
  })

  it('tags pronoun contractions as pronouns', () => {
    expect(tagOf("I'm")).toBe('pron')
    expect(tagOf("they're")).toBe('pron')
    expect(tagOf("we've")).toBe('pron')
  })

  it('accepts the typographic apostrophe', () => {
    const tokens = tagText('doesn’t')

    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.tag).toBe('verb')
  })
})

describe('tagText numbers', () => {
  it('tags digits and decimals as num', () => {
    const tokens = tagText('42 3.5 1,000 2024')

    expect(tokens.map((token) => token.tag)).toEqual(['num', 'num', 'num', 'num'])
    expect(tokens.map((token) => token.text)).toEqual(['42', '3.5', '1,000', '2024'])
  })

  it('does not swallow a sentence-final full stop into the number', () => {
    const tokens = tagText('We sold 42.')

    expect(tokens.map((token) => token.text)).toEqual(['We', 'sold', '42'])
  })

  it('tags spelled-out numbers as num', () => {
    expect(tagText('seven hundred')[0]?.tag).toBe('num')
  })
})

describe('tagText context rules', () => {
  const tagsOf = (text: string): readonly PosTag[] => tagText(text).map((token) => token.tag)

  it('reads an ambiguous word after a determiner as a noun', () => {
    expect(tagsOf('the walk')).toEqual(['det', 'noun'])
  })

  it('reads an ambiguous word after to as a verb', () => {
    expect(tagsOf('to walk')).toEqual(['prep', 'verb'])
  })

  it('treats a capitalised unknown mid-sentence word as a proper noun', () => {
    expect(tagsOf('we met Zorblat today')[2]).toBe('noun')
  })

  it('tags unknown words by suffix', () => {
    expect(tagsOf('the zorblation was quickly zorbed')).toEqual(['det', 'noun', 'verb', 'adv', 'verb'])
  })
})

describe('tagText performance', () => {
  it('handles a long document quickly', () => {
    const paragraph = 'The quiet editor reads every sentence twice, and she does not rush.\n\n'
    const text = paragraph.repeat(4000)
    const started = performance.now()
    const tokens = tagText(text)
    const elapsed = performance.now() - started

    expect(tokens.length).toBe(4000 * 12)
    expect(elapsed).toBeLessThan(1000)
  })
})
