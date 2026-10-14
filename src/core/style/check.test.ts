import { describe, expect, it } from 'vitest'

import { checkStyle } from './check.ts'
import type { StyleKind } from './check.ts'
import { CLICHES, FILLERS, REDUNDANCIES } from './lists.ts'

const kindsOf = (text: string): readonly StyleKind[] => checkStyle(text).map((match) => match.kind)

const textsOf = (text: string): readonly string[] => checkStyle(text).map((match) => match.text)

describe('checkStyle detection', () => {
  it('finds a filler word', () => {
    const matches = checkStyle('This is really good.')

    expect(matches).toHaveLength(1)
    expect(matches[0]?.kind).toBe('filler')
    expect(matches[0]?.text).toBe('really')
  })

  it('finds a multi-word filler', () => {
    expect(textsOf('It was kind of strange.')).toEqual(['kind of'])
    expect(kindsOf('It was kind of strange.')).toEqual(['filler'])
  })

  it('finds a cliche', () => {
    expect(textsOf('At the end of the day, we shipped.')).toEqual(['At the end of the day'])
    expect(kindsOf('At the end of the day, we shipped.')).toEqual(['cliche'])
  })

  it('finds a redundancy', () => {
    expect(textsOf('We reviewed the past history of the project.')).toEqual(['past history'])
    expect(kindsOf('We reviewed the past history of the project.')).toEqual(['redundancy'])
  })

  it('treats "in order to" as a redundancy and not a filler', () => {
    expect(kindsOf('We left early in order to catch the train.')).toEqual(['redundancy'])
  })

  it('finds several matches of different kinds in one text', () => {
    const text = 'Basically, the end result was a game changer.'

    expect(kindsOf(text)).toEqual(['filler', 'redundancy', 'cliche'])
    expect(textsOf(text)).toEqual(['Basically', 'end result', 'game changer'])
  })

  it('returns nothing for clean text', () => {
    expect(checkStyle('The editor reads each sentence twice.')).toEqual([])
  })

  it('returns an empty list for empty text', () => {
    expect(checkStyle('')).toEqual([])
  })
})

describe('checkStyle offsets', () => {
  it('slices back to the matched text', () => {
    const text = 'It was, quite honestly, a free gift and a low-hanging fruit.\nAt the end\nof the day, fine.'
    const matches = checkStyle(text)

    expect(matches.length).toBeGreaterThanOrEqual(4)

    for (const match of matches) {
      expect(text.slice(match.start, match.end)).toBe(match.text)
    }
  })

  it('reports exact positions', () => {
    const matches = checkStyle('Is it really so?')

    expect(matches).toEqual([{ start: 6, end: 12, kind: 'filler', text: 'really' }])
  })

  it('returns matches sorted by start without overlaps', () => {
    const text = 'Really, the bottom line: just a free gift, honestly, in a nutshell, past history.'
    const matches = checkStyle(text)
    let previousEnd = 0

    for (const match of matches) {
      expect(match.start).toBeGreaterThanOrEqual(previousEnd)
      expect(match.end).toBeGreaterThan(match.start)
      previousEnd = match.end
    }

    expect(matches.length).toBeGreaterThanOrEqual(6)
  })
})

describe('checkStyle matching rules', () => {
  it('ignores case', () => {
    expect(textsOf('REALLY? Really. rEaLLy.')).toEqual(['REALLY', 'Really', 'rEaLLy'])
    expect(textsOf('AT THE END OF THE DAY')).toEqual(['AT THE END OF THE DAY'])
  })

  it('respects word boundaries', () => {
    expect(checkStyle('Justice served, justify it, adjust the unjust verdict.')).toEqual([])
    expect(checkStyle('reallyfun and surelynot')).toEqual([])
    expect(checkStyle('A kindof sortof odd word.')).toEqual([])
  })

  it('matches words next to punctuation', () => {
    expect(textsOf('(really) "just" -- perhaps, truly!')).toEqual(['really', 'just', 'perhaps', 'truly'])
  })

  it('matches a phrase across a line break', () => {
    const text = 'We were at the end\nof the day tired.'

    expect(textsOf(text)).toEqual(['at the end\nof the day'])
  })

  it('matches a phrase across any whitespace run', () => {
    expect(textsOf('a   free \t gift')).toEqual(['free \t gift'])
    expect(textsOf('a free\n\n gift')).toEqual(['free\n\n gift'])
  })

  it('does not join words separated by punctuation', () => {
    expect(checkStyle('free, gift')).toEqual([])
    expect(checkStyle('past. History')).toEqual([])
  })

  it('accepts a hyphen between the words of a phrase', () => {
    expect(textsOf('a low-hanging fruit')).toEqual(['low-hanging fruit'])
  })

  it('keeps apostrophes inside words', () => {
    expect(textsOf("It isn't really what I mean, you know.")).toEqual(['really', 'I mean', 'you know'])
    expect(checkStyle("It's just\u2019s")).toEqual([])
  })

  it('works with non-ASCII neighbours', () => {
    expect(textsOf('Das ist wirklich really gut, äjust.')).toEqual(['really'])
  })
})

describe('checkStyle overlap resolution', () => {
  it('prefers the longest match', () => {
    const matches = checkStyle('This is very unique indeed.')

    expect(matches).toHaveLength(1)
    expect(matches[0]?.text).toBe('very unique')
    expect(matches[0]?.kind).toBe('redundancy')
  })

  it('prefers a long phrase over a filler inside it', () => {
    expect(textsOf('It was a little bit odd.')).toEqual(['a little bit'])
    expect(textsOf('Sort of like a dream.')).toEqual(['Sort of like'])
  })

  it('keeps the earlier match when two overlap and tie in length', () => {
    const matches = checkStyle('the end result just in fact')

    expect(matches.map((match) => match.text)).toEqual(['end result', 'just', 'in fact'])
  })

  it('lets a longer later phrase beat a shorter earlier one', () => {
    const matches = checkStyle('We said it, in order to, in a nutshell.')

    expect(matches.map((match) => match.text)).toEqual(['in order to', 'in a nutshell'])
  })
})

describe('checkStyle kinds filter', () => {
  const text = 'Really, the end result at the end of the day.'

  it('returns every kind by default', () => {
    expect(new Set(kindsOf(text))).toEqual(new Set<StyleKind>(['filler', 'cliche', 'redundancy']))
  })

  it('restricts the result to the given kinds', () => {
    expect(checkStyle(text, new Set<StyleKind>(['cliche'])).map((match) => match.text)).toEqual([
      'at the end of the day',
    ])
    expect(checkStyle(text, new Set<StyleKind>(['filler', 'redundancy'])).map((match) => match.text)).toEqual([
      'Really',
      'end result',
    ])
  })

  it('returns nothing for an empty set', () => {
    expect(checkStyle(text, new Set<StyleKind>())).toEqual([])
  })

  it('does not let a filtered-out kind block an overlapping match', () => {
    const matches = checkStyle('very unique', new Set<StyleKind>(['filler']))

    expect(matches.map((match) => match.text)).toEqual(['very'])
  })
})

describe('style lists', () => {
  const lists = [
    ['FILLERS', FILLERS],
    ['CLICHES', CLICHES],
    ['REDUNDANCIES', REDUNDANCIES],
  ] as const

  for (const [name, list] of lists) {
    it(`${name} has 30 to 60 entries`, () => {
      expect(list.length).toBeGreaterThanOrEqual(30)
      expect(list.length).toBeLessThanOrEqual(60)
    })

    it(`${name} has no duplicates and only clean lower-case entries`, () => {
      expect(new Set(list).size).toBe(list.length)

      for (const entry of list) {
        expect(entry).toBe(entry.toLowerCase())
        expect(entry).toBe(entry.trim())
        expect(entry).not.toMatch(/\s{2,}/)
      }
    })
  }

  it('shares no entry between lists', () => {
    const all = [...FILLERS, ...CLICHES, ...REDUNDANCIES]

    expect(new Set(all).size).toBe(all.length)
  })

  it('detects every entry of every list as its own kind when written alone', () => {
    const groups: readonly (readonly [StyleKind, readonly string[]])[] = [
      ['filler', FILLERS],
      ['cliche', CLICHES],
      ['redundancy', REDUNDANCIES],
    ]

    for (const [kind, list] of groups) {
      for (const entry of list) {
        const matches = checkStyle(`Before ${entry}. After.`)
        const hit = matches.find((match) => match.text.toLowerCase() === entry)

        expect(hit?.kind, `entry "${entry}"`).toBe(kind)
      }
    }
  })
})

describe('checkStyle performance', () => {
  it('handles a long document quickly', () => {
    const paragraph = 'It was really a game changer, and at the end of the day the free gift was just fine.\n\n'
    const text = paragraph.repeat(5000)
    const started = performance.now()
    const matches = checkStyle(text)
    const elapsed = performance.now() - started

    expect(matches.length).toBe(5000 * 5)
    expect(elapsed).toBeLessThan(1000)
  })
})
