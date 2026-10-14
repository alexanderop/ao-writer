import { describe, expect, it } from 'vitest'

import { clampNormal, firstNonBlank, lineEnd, lineNumber, lineStart, lineStartOf } from './lines.ts'
import { fileEnd, fileStart, left, lineDown, lineFirst, lineHome, lineLast, lineUp, repeat, right, runEnd, wordBack, wordEnd, wordForward } from './motions.ts'

/** Splits `text` at the `|` marker and returns the text without it and the marker's index. */
function at(marked: string) {
  const pos = marked.indexOf('|')

  return { text: marked.replace('|', ''), pos }
}

/** Runs a motion from the `|` marker and returns the text with the marker moved to where it landed. */
function land(marked: string, motion: (text: string, pos: number) => number): string {
  const { text, pos } = at(marked)
  const target = motion(text, pos)

  return `${text.slice(0, target)}|${text.slice(target)}`
}

describe('line helpers', () => {
  it('finds line edges, including on the first line and in an empty document', () => {
    expect(lineStart('', 0)).toBe(0)
    expect(lineEnd('', 0)).toBe(0)
    expect(lineStart('\nab', 0)).toBe(0)
    expect(lineStart('ab\ncd', 4)).toBe(3)
    expect(lineEnd('ab\ncd', 1)).toBe(2)
    expect(lineEnd('ab\ncd', 4)).toBe(5)
  })

  it('numbers and locates lines', () => {
    expect(lineNumber('a\nb\nc', 4)).toBe(2)
    expect(lineStartOf('a\nbb\nc', 1)).toBe(2)
    expect(lineStartOf('a\nbb\nc', 99)).toBe(5)
  })

  it('finds the first non-blank, or the last character of a blank line', () => {
    expect(firstNonBlank('  \tfoo', 0)).toBe(3)
    expect(firstNonBlank('foo\n   ', 5)).toBe(6)
    expect(firstNonBlank('', 0)).toBe(0)
  })

  it('keeps the normal-mode cursor on a character', () => {
    expect(clampNormal('abc', 3)).toBe(2)
    expect(clampNormal('abc\ndef', 3)).toBe(2)
    expect(clampNormal('abc\n', 4)).toBe(4)
    expect(clampNormal('abc\n\ndef', 4)).toBe(4)
    expect(clampNormal('', 5)).toBe(0)
    expect(clampNormal('abc', -3)).toBe(0)
    expect(clampNormal('a😀', 2)).toBe(1)
  })
})

describe('h and l', () => {
  it('move one character and stop at the line edges', () => {
    expect(land('a|bc', left)).toBe('|abc')
    expect(land('|abc', left)).toBe('|abc')
    expect(land('ab\n|cd', left)).toBe('ab\n|cd')
    expect(land('a|bc', right)).toBe('ab|c')
    expect(land('ab|c', right)).toBe('abc|')
    expect(land('abc|\nd', right)).toBe('abc|\nd')
  })

  it('treat an emoji as one character', () => {
    expect(land('|😀a', right)).toBe('😀|a')
    expect(land('😀|a', left)).toBe('|😀a')
  })

  it('stay put in an empty document', () => {
    expect(land('|', left)).toBe('|')
    expect(land('|', right)).toBe('|')
  })

  it('repeat for a count and stop early', () => {
    expect(repeat(right, 'abcdef', 1, 3)).toBe(4)
    expect(repeat(right, 'abc', 0, 10)).toBe(3)
  })
})

describe('w', () => {
  it('jumps to the start of the next word', () => {
    expect(land('|foo bar', wordForward)).toBe('foo |bar')
    expect(land('f|oo   bar', wordForward)).toBe('foo   |bar')
    expect(land('foo |   bar', wordForward)).toBe('foo    |bar')
  })

  it('treats a run of punctuation as its own word', () => {
    expect(land('|foo.bar', wordForward)).toBe('foo|.bar')
    expect(land('foo|.bar', wordForward)).toBe('foo.|bar')
    expect(land('|foo, bar', wordForward)).toBe('foo|, bar')
    expect(land('foo|, bar', wordForward)).toBe('foo, |bar')
    expect(land('|...x', wordForward)).toBe('...|x')
  })

  it('crosses line breaks and stops on empty lines', () => {
    expect(land('foo|\nbar', wordForward)).toBe('foo\n|bar')
    expect(land('|foo\n  bar', wordForward)).toBe('foo\n  |bar')
    expect(land('|foo\n\nbar', wordForward)).toBe('foo\n|\nbar')
    expect(land('foo\n|\nbar', wordForward)).toBe('foo\n\n|bar')
  })

  it('goes to the end of the text from the last word', () => {
    expect(land('foo |bar', wordForward)).toBe('foo bar|')
    expect(land('|', wordForward)).toBe('|')
    expect(land('foo bar|', wordForward)).toBe('foo bar|')
  })

  it('counts digits and underscores as word characters', () => {
    expect(land('|foo_1 bar', wordForward)).toBe('foo_1 |bar')
    expect(land('|über ok', wordForward)).toBe('über |ok')
  })
})

describe('b', () => {
  it('jumps to the start of the current or the previous word', () => {
    expect(land('foo ba|r', wordBack)).toBe('foo |bar')
    expect(land('foo |bar', wordBack)).toBe('|foo bar')
    expect(land('foo   |bar', wordBack)).toBe('|foo   bar')
  })

  it('stops at punctuation runs', () => {
    expect(land('foo.|bar', wordBack)).toBe('foo|.bar')
    expect(land('foo|.bar', wordBack)).toBe('|foo.bar')
    expect(land('foo, |bar', wordBack)).toBe('foo|, bar')
  })

  it('crosses line breaks and stops on empty lines', () => {
    expect(land('foo\n|bar', wordBack)).toBe('|foo\nbar')
    expect(land('foo\n\n|bar', wordBack)).toBe('foo\n|\nbar')
    expect(land('foo\n|\nbar', wordBack)).toBe('|foo\n\nbar')
  })

  it('stays at the start of the text', () => {
    expect(land('|foo', wordBack)).toBe('|foo')
    expect(land('|', wordBack)).toBe('|')
    expect(land(' |x', wordBack)).toBe('| x')
  })
})

describe('e', () => {
  it('jumps to the end of the current or the next word', () => {
    expect(land('|foo bar', wordEnd)).toBe('fo|o bar')
    expect(land('fo|o bar', wordEnd)).toBe('foo ba|r')
    expect(land('foo| bar', wordEnd)).toBe('foo ba|r')
  })

  it('treats punctuation as its own word', () => {
    expect(land('|foo.bar', wordEnd)).toBe('fo|o.bar')
    expect(land('fo|o.bar', wordEnd)).toBe('foo|.bar')
    expect(land('foo|.bar', wordEnd)).toBe('foo.ba|r')
    expect(land('|a, b', wordEnd)).toBe('a|, b')
  })

  it('skips line breaks and empty lines', () => {
    expect(land('fo|o\n\nbar', wordEnd)).toBe('foo\n\nba|r')
    expect(land('foo|\n  bar', wordEnd)).toBe('foo\n  ba|r')
  })

  it('stays on the last character at the end of the text', () => {
    expect(land('foo ba|r', wordEnd)).toBe('foo ba|r')
    expect(land('|', wordEnd)).toBe('|')
    expect(land('|a', wordEnd)).toBe('|a')
  })

  it('finds the end of the run under the cursor', () => {
    expect(land('f|oo bar', runEnd)).toBe('fo|o bar')
    expect(land('foo| bar', runEnd)).toBe('foo| bar')
    expect(land('fo|o.', runEnd)).toBe('fo|o.')
  })
})

describe('line motions', () => {
  it('0 goes to the start of the line', () => {
    expect(land('ab\ncd|e', lineHome)).toBe('ab\n|cde')
    expect(land('|', lineHome)).toBe('|')
  })

  it('^ goes to the first non-blank', () => {
    expect(land('ab\n   c|d', lineFirst)).toBe('ab\n   |cd')
    expect(land('  |  ', lineFirst)).toBe('   | ')
  })

  it('$ goes to the last character, or stays on an empty line', () => {
    expect(land('|ab\ncd', lineLast)).toBe('a|b\ncd')
    expect(land('ab\n|\ncd', lineLast)).toBe('ab\n|\ncd')
    expect(land('|', lineLast)).toBe('|')
    expect(land('|a😀', lineLast)).toBe('a|😀')
  })
})

describe('j and k on logical lines', () => {
  it('keep the column and clamp it to a shorter line', () => {
    expect(land('ab|cd\nxy\nlonger', lineDown)).toBe('abcd\nx|y\nlonger')
    expect(land('abcd\nx|y\nlonger', lineDown)).toBe('abcd\nxy\nl|onger')
    expect(land('abcd\nxy\nlon|ger', lineUp)).toBe('abcd\nx|y\nlonger')
  })

  it('land on the line break of an empty line', () => {
    expect(land('a|b\n\ncd', lineDown)).toBe('ab\n|\ncd')
  })

  it('stay on the first and the last line', () => {
    expect(land('a|b\ncd', lineUp)).toBe('a|b\ncd')
    expect(land('ab\nc|d', lineDown)).toBe('ab\nc|d')
    expect(land('|', lineDown)).toBe('|')
  })
})

describe('gg and G', () => {
  const text = 'one\n  two\nthree'

  it('go to the first non-blank of the first or the last line', () => {
    expect(fileStart(text, 0)).toBe(0)
    expect(fileEnd(text, 0)).toBe(text.indexOf('three'))
  })

  it('take a line number, clamped to the text', () => {
    expect(fileStart(text, 2)).toBe(text.indexOf('two'))
    expect(fileEnd(text, 2)).toBe(text.indexOf('two'))
    expect(fileEnd(text, 99)).toBe(text.indexOf('three'))
    expect(fileStart(text, 99)).toBe(text.indexOf('three'))
  })

  it('work on an empty document', () => {
    expect(fileStart('', 0)).toBe(0)
    expect(fileEnd('', 0)).toBe(0)
  })
})
