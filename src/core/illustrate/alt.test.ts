import { describe, expect, it } from 'vitest'

import { cleanAlt } from './alt.ts'

describe('cleanAlt', () => {
  it('keeps a plain sentence', () => {
    expect(cleanAlt('A fox in a scarf reads a newspaper on a frosty hill.')).toBe('A fox in a scarf reads a newspaper on a frosty hill.')
  })

  it('takes the last non-empty line of the reply', () => {
    expect(cleanAlt('Image saved to ./out.png.\n\nA paper boat floating on calm water.\n\n')).toBe('A paper boat floating on calm water.')
  })

  it('strips quotes and backticks around the sentence', () => {
    expect(cleanAlt('"A fox reading."')).toBe('A fox reading.')
    expect(cleanAlt('`A fox reading.`')).toBe('A fox reading.')
    expect(cleanAlt('“A fox reading.”')).toBe('A fox reading.')
  })

  it('removes square brackets and collapses whitespace', () => {
    expect(cleanAlt('A fox [in ink]   reading\tthe  paper.')).toBe('A fox in ink reading the paper.')
  })

  it('caps long text at a word boundary within 125 characters', () => {
    const long = 'A fox in a long green scarf sits on a frosty hill at dawn reading a newspaper while small birds gather around its feet and the sun rises.'
    const alt = cleanAlt(long)

    expect(alt).toBe('A fox in a long green scarf sits on a frosty hill at dawn reading a newspaper while small birds gather around its feet and')
    expect(alt?.length).toBeLessThanOrEqual(125)
  })

  it('drops a comma left dangling by the cap', () => {
    const long = `${'word '.repeat(24)}end, and more`

    expect(cleanAlt(long)).toBe(`${'word '.repeat(24)}end`)
  })

  it('is null for an empty reply or one of only quotes', () => {
    expect(cleanAlt('')).toBeNull()
    expect(cleanAlt('  \n \n')).toBeNull()
    expect(cleanAlt('""')).toBeNull()
    expect(cleanAlt('[]')).toBeNull()
  })
})
