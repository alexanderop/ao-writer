import { describe, expect, it } from 'vitest'

import type { TextRange } from '../text/focus.ts'
import { cursorOf, handleKey, visualLineRange, visualRange } from './vim.ts'
import { initialVimState, modeLabel, VimResult } from './state.ts'
import type { Mode, RowMotion, VimKey, VimState } from './state.ts'

/** Rows that wrap every `width` characters, each character one unit wide; enough to test row moves without a browser. */
function wrappedRows(text: string, width: number): RowMotion {
  const starts: number[] = []

  for (let line = 0; line <= text.length; ) {
    const end = text.indexOf('\n', line) === -1 ? text.length : text.indexOf('\n', line)

    for (let row = line; row === line || row < end; row += width) starts.push(row)

    line = end + 1
  }

  const rowOf = (pos: number): number => starts.filter((start) => start <= pos).length - 1

  return (pos, direction, goalX) => {
    const row = rowOf(pos) + direction
    const start = starts[row]

    if (start === undefined) return null

    const x = goalX ?? pos - (starts[rowOf(pos)] ?? 0)
    const next = starts[row + 1] ?? text.length + 1
    const limit = Math.min(next - 1, text.indexOf('\n', start) === -1 ? text.length : text.indexOf('\n', start))

    return { pos: Math.min(start + x, Math.max(start, limit - (limit > start ? 1 : 0))), goalX: x }
  }
}

const KEY_TOKEN = /<[^>]+>|./gsu

function keyOf(token: string): VimKey {
  const named = token.startsWith('<') && token.length > 1 ? token.slice(1, -1) : null
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }

  if (named === 'Esc') return { ...base, key: 'Escape' }

  if (named?.startsWith('C-')) return { ...base, key: named.slice(2), ctrlKey: true }

  if (named === 'M-x') return { ...base, key: 'x', metaKey: true }

  return { ...base, key: named ?? token }
}

/** A document, a cursor and a Vim state, driven by key names such as `dw`, `<Esc>` and `<C-r>`. */
class Session {
  text: string
  selection: TextRange
  state: VimState = initialVimState
  passed: string[] = []
  yanked: string[] = []
  undone = 0
  redone = 0
  width = 1000

  constructor(marked: string) {
    const pos = marked.indexOf('|')

    this.text = marked.replace('|', '')
    this.selection = { start: pos, end: pos }
  }

  press(keys: string): this {
    for (const token of keys.match(KEY_TOKEN) ?? []) this.send(keyOf(token))

    return this
  }

  private send(key: VimKey): void {
    const result = handleKey(this.state, key, this.text, this.selection, wrappedRows(this.text, this.width))

    VimResult.$match(result, {
      Pass: () => {
        // a browser would type the character; mimic it so insert-mode tests can type
        if (this.state.mode === 'insert' && key.key.length === 1 && !key.ctrlKey) this.splice(this.selection.start, this.selection.end, key.key)
        else this.passed.push(key.key)
      },
      Stay: ({ state }) => {
        this.state = state
      },
      Move: ({ state, selection, yank }) => {
        this.state = state
        this.selection = selection

        if (yank !== null) this.yanked.push(yank)
      },
      Edit: ({ state, edit, yank }) => {
        this.state = state
        this.splice(edit.from, edit.to, edit.insert)
        this.selection = { start: edit.selectionStart, end: edit.selectionEnd }

        if (yank !== null) this.yanked.push(yank)
      },
      Undo: ({ state }) => {
        this.state = state
        this.undone += 1
      },
      Redo: ({ state }) => {
        this.state = state
        this.redone += 1
      },
    })
  }

  private splice(from: number, to: number, insert: string): void {
    this.text = this.text.slice(0, from) + insert + this.text.slice(to)
    this.selection = { start: from + insert.length, end: from + insert.length }
  }

  /** The document with `|` where the cursor is. */
  get view(): string {
    const cursor = cursorOf(this.state, this.text, this.selection)

    return `${this.text.slice(0, cursor)}|${this.text.slice(cursor)}`
  }

  get mode(): Mode {
    return this.state.mode
  }
}

/** Runs `keys` on `marked` and returns the resulting view. */
function view(marked: string, keys: string): string {
  return new Session(marked).press(keys).view
}

describe('normal mode keys', () => {
  it('never insert text', () => {
    const session = new Session('a|bc').press('qzQ1 !;')

    expect(session.text).toBe('abc')
    expect(session.mode).toBe('normal')
  })

  it('leave modifier chords and named keys to the browser', () => {
    const session = new Session('|abc').press('<M-x><C-b>')

    expect(session.passed).toEqual(['x', 'b'])
    expect(session.text).toBe('abc')
  })

  it('treat the arrow keys, Home and End like their Vim keys', () => {
    const session = new Session('|ab cd\nef')

    expect(session.press('<End>').view).toBe('ab c|d\nef')
    expect(session.press('<ArrowDown>').view).toBe('ab cd\ne|f')
    expect(session.press('<Home>').view).toBe('ab cd\n|ef')
    expect(session.press('<ArrowRight><ArrowUp>').view).toBe('a|b cd\nef')
  })

  it('swallow Enter and keep Tab for the browser', () => {
    const session = new Session('|ab').press('<Enter><Tab>')

    expect(session.text).toBe('ab')
    expect(session.passed).toEqual(['Tab'])
  })
})

describe('motions', () => {
  it('h l 0 ^ $ move on the line and stop on the last character', () => {
    expect(view('a|bc', 'h')).toBe('|abc')
    expect(view('|abc', 'hh')).toBe('|abc')
    expect(view('|abc', 'lll')).toBe('ab|c')
    expect(view('ab|c', '0')).toBe('|abc')
    expect(view('|  abc', '$')).toBe('  ab|c')
    expect(view('|  abc', '$^')).toBe('  |abc')
  })

  it('w b e move by words', () => {
    expect(view('|one two.three', 'w')).toBe('one |two.three')
    expect(view('|one two.three', 'ww')).toBe('one two|.three')
    expect(view('|one two.three', 'www')).toBe('one two.|three')
    expect(view('one two.|three', 'bb')).toBe('one |two.three')
    expect(view('|one two', 'e')).toBe('on|e two')
    expect(view('|one two', 'ee')).toBe('one tw|o')
  })

  it('w from the last word stays on the last character', () => {
    expect(view('one tw|o', 'w')).toBe('one tw|o')
  })

  it('apply counts', () => {
    expect(view('|a b c d e', '3w')).toBe('a b c |d e')
    expect(view('|abcdef', '3l')).toBe('abc|def')
    expect(view('a b c d |e', '2b')).toBe('a b |c d e')
    expect(view('|abcdef', '99l')).toBe('abcde|f')
    expect(view('|a b c d e', '10w')).toBe('a b c d |e')
  })

  it('gg and G go to the first and the last line, with a count for a line number', () => {
    const doc = '|one\ntwo\n  three'

    expect(view(doc, 'G')).toBe('one\ntwo\n  |three')
    expect(view(doc, 'Ggg')).toBe('|one\ntwo\n  three')
    expect(view(doc, '2G')).toBe('one\n|two\n  three')
    expect(view(doc, '3gg')).toBe('one\ntwo\n  |three')
  })

  it('a lone g waits and any other key cancels it', () => {
    const session = new Session('o|ne\ntwo').press('g')

    expect(session.state.pending).toBe('g')
    expect(session.press('x').view).toBe('o|ne\ntwo')
    expect(session.state.pending).toBe('')
  })

  it('stay in an empty document', () => {
    expect(view('|', 'hjklwbe0^$ggG')).toBe('|')
  })
})

describe('j and k by visual row', () => {
  function rows(marked: string, keys: string, width: number): string {
    const session = new Session(marked)

    session.width = width

    return session.press(keys).view
  }

  const wrapped = '|aaaaaaaaaabbbbbbbbbbcccccc'

  it('move one wrapped row, not one paragraph', () => {
    expect(rows(wrapped, 'j', 10)).toBe('aaaaaaaaaa|bbbbbbbbbbcccccc')
  })

  it('keep the column across rows of different length', () => {
    const doc = 'aaaaaaaaa|a\nbb\ncccccccccc'

    expect(rows(doc, 'j', 10)).toBe('aaaaaaaaaa\nb|b\ncccccccccc')
    expect(rows(doc, 'jj', 10)).toBe('aaaaaaaaaa\nbb\nccccccccc|c')
  })

  it('stay on the first and the last row', () => {
    expect(rows('|abc', 'k', 10)).toBe('|abc')
    expect(rows('ab|c', 'j', 10)).toBe('ab|c')
  })

  it('take a count', () => {
    expect(rows(wrapped, '2j', 10)).toBe('aaaaaaaaaabbbbbbbbbb|cccccc')
  })

  it('go back up with k', () => {
    expect(rows('aaaaaaaaaabbbbbbbbbb|cccccc', 'k', 10)).toBe('aaaaaaaaaa|bbbbbbbbbbcccccc')
    expect(rows('aaaaaaaaaabbbbbbb|bbbcccccc', 'k', 10)).toBe('aaaaaaa|aaabbbbbbbbbbcccccc')
  })

  it('forget the goal column after any other command', () => {
    const doc = 'aaaaaaaaa|a\nbb\ncccccccccc'
    const session = new Session(doc)

    session.press('j')
    expect(session.state.goalX).toBe(9)
    session.press('h')
    expect(session.state.goalX).toBeNull()
  })
})

describe('d', () => {
  it('dw deletes to the next word', () => {
    expect(view('|one two three', 'dw')).toBe('|two three')
    expect(view('one |two three', '2dw')).toBe('one| ')
    expect(view('|one two three', 'd2w')).toBe('|three')
    expect(view('|a b c d e f', '2d2w')).toBe('|e f')
  })

  it('dw on the last word of a line keeps the line break', () => {
    expect(view('one |two\nthree', 'dw')).toBe('one| \nthree')
    expect(view('|one\ntwo', 'dw')).toBe('|\ntwo')
  })

  it('dw on the last word of the text deletes to the end', () => {
    expect(view('one |two', 'dw')).toBe('one| ')
  })

  it('db and de', () => {
    expect(view('one tw|o', 'db')).toBe('one |o')
    expect(view('|one two', 'de')).toBe('| two')
    expect(view('one |two three', 'de')).toBe('one | three')
  })

  it('d$ d0 d^ delete to the line edges', () => {
    expect(view('one |two three\nx', 'd$')).toBe('one| \nx')
    expect(view('one |two', 'd0')).toBe('|two')
    expect(view('  one |two', 'd^')).toBe('  |two')
    expect(view('on|e\nx', 'D')).toBe('o|n\nx')
  })

  it('dh and dl delete a character', () => {
    expect(view('a|bc', 'dh')).toBe('|bc')
    expect(view('a|bc', 'dl')).toBe('a|c')
  })

  it('stays within the line for h and l', () => {
    expect(view('|abc\ndef', 'dh')).toBe('|abc\ndef')
    expect(view('abc|\ndef', 'dl')).toBe('a|b\ndef')
  })

  it('dd deletes the line and lands on the next one', () => {
    expect(view('one\n|two\nthree', 'dd')).toBe('one\n|three')
    expect(view('|one\ntwo', 'dd')).toBe('|two')
    expect(view('one\ntwo\n  th|ree\nfour', 'dd')).toBe('one\ntwo\n|four')
  })

  it('dd on the last line removes the line break before it and lands on the previous line', () => {
    const session = new Session('one\n  two\nthr|ee').press('dd')

    expect(session.text).toBe('one\n  two')
    expect(session.view).toBe('one\n  |two')
  })

  it('dd on a single line or an empty document leaves an empty document', () => {
    expect(new Session('o|ne').press('dd').text).toBe('')
    expect(new Session('|').press('dd').text).toBe('')
  })

  it('dd with a count deletes that many lines, as many as there are', () => {
    expect(new Session('|a\nb\nc\nd').press('2dd').text).toBe('c\nd')
    expect(new Session('a\n|b\nc\nd').press('5dd').text).toBe('a')
    expect(new Session('|a\nb\nc').press('d2d').text).toBe('c')
  })

  it('dj dk dG dgg delete whole lines', () => {
    expect(new Session('a\n|b\nc\nd').press('dj').text).toBe('a\nd')
    expect(new Session('a\nb\n|c\nd').press('dk').text).toBe('a\nd')
    expect(new Session('a\nb\n|c\nd').press('dG').text).toBe('a\nb')
    expect(new Session('a\nb\n|c\nd').press('dgg').text).toBe('d')
  })

  it('x deletes the character under the cursor and keeps the cursor on a character', () => {
    expect(view('a|bc', 'x')).toBe('a|c')
    expect(view('ab|c', 'x')).toBe('a|b')
    expect(view('|abcd', '3x')).toBe('|d')
    expect(view('|abcd', '9x')).toBe('|')
  })

  it('X deletes the character before the cursor, with a count', () => {
    expect(view('ab|c', 'X')).toBe('a|c')
    expect(view('abc|d', '3X')).toBe('|d')
    expect(view('abc|d', '9X')).toBe('|d')
    expect(new Session('abc|d').press('Xp').text).toBe('abdc')
  })

  it('X at the start of a line does nothing and does not join lines', () => {
    expect(view('|abc', 'X')).toBe('|abc')
    expect(new Session('a\n|bc').press('X').text).toBe('a\nbc')
    expect(new Session('a\n|\nb').press('X').text).toBe('a\n\nb')
  })

  it('x on an empty line does nothing', () => {
    expect(new Session('a\n|\nb').press('x').text).toBe('a\n\nb')
  })

  it('does not split an emoji', () => {
    expect(new Session('|😀a').press('x').text).toBe('a')
  })

  it('a motion that does not exist cancels the operator', () => {
    const session = new Session('|abc').press('dz')

    expect(session.text).toBe('abc')
    expect(session.state.pending).toBe('')
  })

  it('Escape cancels a pending operator and a count', () => {
    const session = new Session('|abc').press('3d<Esc>x')

    expect(session.text).toBe('bc')
  })
})

describe('c', () => {
  it('cw changes the word without taking the space after it', () => {
    const session = new Session('|one two').press('cw')

    expect(session.text).toBe(' two')
    expect(session.mode).toBe('insert')
    expect(session.press('1<Esc>').text).toBe('1 two')
  })

  it('cw on the last character of a word changes just that character', () => {
    expect(new Session('on|e two').press('cw').text).toBe('on two')
  })

  it('c2w and 2cw change two words', () => {
    expect(new Session('|a b c').press('c2w').text).toBe(' c')
    expect(new Session('|a b c').press('2cw').text).toBe(' c')
  })

  it('cw on a blank acts like dw', () => {
    expect(new Session('one| two').press('cw').text).toBe('onetwo')
  })

  it('ce c$ C change to the end', () => {
    expect(new Session('|one two').press('ce').text).toBe(' two')
    expect(new Session('one |two\nx').press('c$').text).toBe('one \nx')
    expect(new Session('one |two\nx').press('C').text).toBe('one \nx')
  })

  it('cc replaces the line and keeps its place', () => {
    const session = new Session('a\nb|b\nc').press('cc')

    expect(session.text).toBe('a\n\nc')
    expect(session.mode).toBe('insert')
    expect(session.press('X<Esc>').text).toBe('a\nX\nc')
  })

  it('cc with a count replaces several lines with one', () => {
    expect(new Session('|a\nb\nc').press('2cc').text).toBe('\nc')
  })

  it('s and S', () => {
    expect(new Session('a|bc').press('sX<Esc>').text).toBe('aXc')
    expect(new Session('a\n|bc\nd').press('SX<Esc>').text).toBe('a\nX\nd')
  })

  it('c with an empty range still enters insert mode', () => {
    expect(new Session('|abc\n').press('cb').mode).toBe('insert')
  })
})

describe('y and p', () => {
  it('yw then p pastes after the cursor', () => {
    const session = new Session('|one two').press('ywP')

    expect(session.text).toBe('one one two')
    expect(session.yanked).toEqual(['one '])
  })

  it('yw leaves the text alone and puts the cursor at the start of the range', () => {
    const session = new Session('one |two three').press('yb')

    expect(session.text).toBe('one two three')
    expect(session.view).toBe('|one two three')
  })

  it('yy then p pastes a line below', () => {
    const session = new Session('a\n|b\nc').press('yyp')

    expect(session.text).toBe('a\nb\nb\nc')
    expect(session.view).toBe('a\nb\n|b\nc')
  })

  it('yy then P pastes a line above', () => {
    const session = new Session('a\n|b\nc').press('yyP')

    expect(session.text).toBe('a\nb\nb\nc')
    expect(session.view).toBe('a\n|b\nb\nc')
  })

  it('p after yy on the last line adds a line at the end', () => {
    expect(new Session('a\n|b').press('yyp').text).toBe('a\nb\nb')
  })

  it('p after dd moves the line', () => {
    expect(new Session('|a\nb\nc').press('ddp').text).toBe('b\na\nc')
  })

  it('yy keeps the cursor where it was', () => {
    expect(view('a\nb|b\nc', 'yy')).toBe('a\nb|b\nc')
  })

  it('2yy yanks two lines and 3p pastes them three times', () => {
    const session = new Session('|a\nb\nc').press('2yy')

    expect(session.yanked).toEqual(['a\nb\n'])
    expect(session.press('2p').text).toBe('a\na\nb\na\nb\nb\nc')
  })

  it('p in the middle of a word puts the text after the cursor character', () => {
    const session = new Session('|abc').press('ylp')

    expect(session.text).toBe('aabc')
    expect(session.view).toBe('a|abc')
  })

  it('x then p swaps two characters', () => {
    expect(view('|abc', 'xp')).toBe('b|ac')
  })

  it('P pastes before the cursor and counts repeat the text', () => {
    expect(view('a|c', 'ylP')).toBe('a|cc')
    expect(new Session('|ab').press('yl3p').text).toBe('aaaab')
  })

  it('p with an empty register does nothing', () => {
    expect(new Session('|abc').press('pP').text).toBe('abc')
  })

  it('p on an empty line pastes at the line', () => {
    expect(new Session('|xy\n\nz').press('yljp').text).toBe('xy\nx\nz')
  })
})

describe('inserting', () => {
  it('i starts at the cursor, a after it', () => {
    expect(new Session('a|bc').press('iX<Esc>').text).toBe('aXbc')
    expect(new Session('a|bc').press('aX<Esc>').text).toBe('abXc')
  })

  it('a on an empty line stays on it', () => {
    expect(new Session('a\n|\nb').press('aX<Esc>').text).toBe('a\nX\nb')
  })

  it('I starts at the first non-blank and A at the end of the line', () => {
    expect(new Session('  a|bc\nx').press('IX<Esc>').text).toBe('  Xabc\nx')
    expect(new Session('a|bc\nx').press('AX<Esc>').text).toBe('abcX\nx')
    expect(new Session('  \nx').press('IX<Esc>').text).toBe('  X\nx')
  })

  it('o and O open a line below and above', () => {
    const below = new Session('a\n|b\nc').press('oX')

    expect(below.text).toBe('a\nb\nX\nc')
    expect(below.mode).toBe('insert')
    expect(new Session('a\n|b\nc').press('OX').text).toBe('a\nX\nb\nc')
    expect(new Session('a|b').press('oX').text).toBe('ab\nX')
  })

  it('typing passes through to the browser in insert mode', () => {
    const session = new Session('|').press('i')

    expect(session.mode).toBe('insert')
    expect(session.press('hi!').text).toBe('hi!')
  })

  it('Escape returns to normal mode and steps back onto the last character typed', () => {
    const session = new Session('ab|c').press('aXY<Esc>')

    expect(session.mode).toBe('normal')
    expect(session.view).toBe('abcX|Y')
    expect(session.press('l').view).toBe('abcX|Y')
  })

  it('Escape at the start of a line stays there', () => {
    expect(new Session('a\n|b').press('i<Esc>').view).toBe('a\n|b')
  })

  it('Ctrl+[ also leaves insert mode', () => {
    expect(new Session('|a').press('i<C-[>').mode).toBe('normal')
  })

  it('counts before i are ignored rather than inserted', () => {
    const session = new Session('|a').press('3i')

    expect(session.mode).toBe('insert')
    expect(session.text).toBe('a')
  })
})

describe('undo and redo', () => {
  it('u asks the editor to undo and Ctrl+R to redo', () => {
    const session = new Session('|abc').press('u<C-r>')

    expect(session.undone).toBe(1)
    expect(session.redone).toBe(1)
  })

  it('Ctrl+R is left to the browser in insert mode', () => {
    const session = new Session('|abc').press('i<C-r>')

    expect(session.redone).toBe(0)
    expect(session.passed).toEqual(['r'])
  })
})

describe('visual mode', () => {
  it('v selects the character under the cursor', () => {
    const session = new Session('a|bc').press('v')

    expect(session.mode).toBe('visual')
    expect(session.selection).toEqual({ start: 1, end: 2 })
  })

  it('motions extend the selection and keep the anchor', () => {
    const session = new Session('|one two three').press('vw')

    expect(session.selection).toEqual({ start: 0, end: 5 })
    expect(session.press('e').selection).toEqual({ start: 0, end: 7 })
    expect(session.press('0').selection).toEqual({ start: 0, end: 1 })
  })

  it('moving left of the anchor selects backwards', () => {
    const session = new Session('one t|wo').press('vhh')

    expect(session.selection).toEqual({ start: 3, end: 6 })
    expect(session.view).toBe('one| two')
  })

  it('d deletes the selection and returns to normal mode', () => {
    const session = new Session('|one two').press('vwd')

    expect(session.text).toBe('wo')
    expect(session.mode).toBe('normal')
  })

  it('x does the same as d', () => {
    expect(new Session('|abc').press('vlx').text).toBe('c')
  })

  it('y copies the selection and puts the cursor at its start', () => {
    const session = new Session('one |two').press('vey')

    expect(session.yanked).toEqual(['two'])
    expect(session.text).toBe('one two')
    expect(session.mode).toBe('normal')
    expect(session.view).toBe('one |two')
    expect(session.press('P').text).toBe('one twotwo')
  })

  it('c deletes the selection and starts inserting', () => {
    const session = new Session('|one two').press('vecX')

    expect(session.text).toBe('X two')
    expect(session.mode).toBe('insert')
  })

  it('Escape and a second v leave visual mode with the cursor where it was', () => {
    expect(new Session('|one two').press('vw<Esc>').view).toBe('one |two')
    expect(new Session('|one two').press('vwv').view).toBe('one |two')
    expect(new Session('|one two').press('vw<Esc>').mode).toBe('normal')
  })

  it('o swaps the ends of the selection', () => {
    const session = new Session('|one two').press('vwo')

    expect(session.view).toBe('|one two')
    expect(session.press('l').selection).toEqual({ start: 1, end: 5 })
  })

  it('gg and G select to the first and last line', () => {
    expect(new Session('a\n|b\nc').press('vG').selection).toEqual({ start: 2, end: 5 })
    expect(new Session('a\n|b\nc').press('vgg').selection).toEqual({ start: 0, end: 3 })
  })

  it('j and k select by row', () => {
    const session = new Session('|aaaaaaaaaabbbbbbbbbb')

    session.width = 10
    session.press('vj')

    expect(session.selection).toEqual({ start: 0, end: 11 })
  })

  it('swallows keys that would insert', () => {
    const session = new Session('|abc').press('vip')

    expect(session.text).toBe('abc')
    expect(session.mode).toBe('visual')
  })

  it('on an empty line the selection takes the line break', () => {
    expect(new Session('a\n|\nb').press('vd').text).toBe('a\nb')
  })

  it('computes the cursor from the selection and the anchor', () => {
    const state = { ...initialVimState, mode: 'visual' as const, visualAnchor: 4 }

    expect(cursorOf(state, 'one two', { start: 4, end: 7 })).toBe(6)
    expect(cursorOf(state, 'one two', { start: 1, end: 5 })).toBe(1)
    expect(visualRange('one two', 4, 1)).toEqual({ start: 1, end: 5 })
  })
})

describe('linewise visual mode', () => {
  it('V selects the whole line, including its line break', () => {
    const session = new Session('a\n|bc\nd').press('V')

    expect(session.mode).toBe('visual-line')
    expect(session.selection).toEqual({ start: 2, end: 5 })
    expect(modeLabel(session.mode)).toBe('VISUAL LINE')
  })

  it('V on the last line has no line break to take', () => {
    expect(new Session('a\n|bc').press('V').selection).toEqual({ start: 2, end: 4 })
  })

  it('V in an empty document selects nothing and still enters the mode', () => {
    const session = new Session('|').press('V')

    expect(session.mode).toBe('visual-line')
    expect(session.selection).toEqual({ start: 0, end: 0 })
  })

  it('Escape and a second V leave with the cursor in its column', () => {
    expect(new Session('a\nb|c\nd').press('V<Esc>').view).toBe('a\nb|c\nd')
    expect(new Session('a\nb|c\nd').press('VV').view).toBe('a\nb|c\nd')
    expect(new Session('a\nb|c\nd').press('VV').mode).toBe('normal')
    expect(new Session('a\nb|c\nd').press('Vj<Esc>').view).toBe('a\nbc\n|d')
  })

  it('j and k extend the selection by lines', () => {
    const down = new Session('a\n|bc\nd\ne').press('Vj')

    expect(down.selection).toEqual({ start: 2, end: 7 })
    expect(down.view).toBe('a\nbc\n|d\ne')
    expect(new Session('a\nb\n|c').press('Vk').selection).toEqual({ start: 2, end: 5 })
  })

  it('j and k stop at the first and the last line', () => {
    expect(new Session('a\n|bc\nd').press('Vjjj').selection).toEqual({ start: 2, end: 6 })
    expect(new Session('a\n|bc\nd').press('Vkkk').selection).toEqual({ start: 0, end: 5 })
  })

  it('j and k move by logical line, not by wrapped row', () => {
    const session = new Session('|aaaaaaaaaabbbbbbbbbb\nc')

    session.width = 10
    session.press('Vj')

    expect(session.selection).toEqual({ start: 0, end: 22 })
  })

  it('take a count and keep the column across short lines', () => {
    expect(new Session('|a\nb\nc\nd').press('V2j').selection).toEqual({ start: 0, end: 6 })
    expect(new Session('ab|cd\n\nabcd').press('Vjj').view).toBe('abcd\n\nab|cd')
  })

  it('gg and G extend to the first and the last line', () => {
    expect(new Session('a\n|b\nc').press('VG').selection).toEqual({ start: 2, end: 5 })
    expect(new Session('a\n|b\nc').press('Vgg').selection).toEqual({ start: 0, end: 4 })
    expect(new Session('a\nb\nc\n|d').press('V2G').selection).toEqual({ start: 2, end: 7 })
  })

  it('w b e h l 0 $ move the cursor and keep the selection on the line', () => {
    const session = new Session('|one two\nx').press('Vw')

    expect(session.selection).toEqual({ start: 0, end: 8 })
    expect(session.view).toBe('one |two\nx')
    expect(session.press('$').view).toBe('one tw|o\nx')
    expect(session.press('b').view).toBe('one |two\nx')
    expect(session.press('e').view).toBe('one tw|o\nx')
    expect(session.press('0').view).toBe('|one two\nx')
    expect(session.press('ll').view).toBe('on|e two\nx')
    expect(session.press('h').view).toBe('o|ne two\nx')
    expect(session.selection).toEqual({ start: 0, end: 8 })
  })

  it('swallows keys that would insert', () => {
    const session = new Session('|abc').press('Vip')

    expect(session.text).toBe('abc')
    expect(session.mode).toBe('visual-line')
  })

  describe('d and x', () => {
    it('delete the first line and land on the next', () => {
      const session = new Session('|a\nb\nc').press('Vd')

      expect(session.text).toBe('b\nc')
      expect(session.view).toBe('|b\nc')
      expect(session.mode).toBe('normal')
      expect(new Session('|a\nb\nc').press('Vx').text).toBe('b\nc')
    })

    it('delete the lines the selection covers, in either direction', () => {
      expect(new Session('|a\nb\nc').press('Vjd').text).toBe('c')
      expect(new Session('a\nb\n|c\nd').press('Vkd').view).toBe('a\n|d')
    })

    it('delete the last line together with the line break before it', () => {
      const session = new Session('a\n|b').press('Vd')

      expect(session.text).toBe('a')
      expect(session.view).toBe('|a')
    })

    it('empty a single-line document', () => {
      expect(new Session('a|bc').press('Vd').text).toBe('')
    })

    it('take empty lines inside the selection', () => {
      expect(new Session('a\n|\n\nb').press('Vjd').text).toBe('a\nb')
      expect(new Session('a\n|\nb').press('Vd').text).toBe('a\nb')
    })

    it('fill the register with the lines, so p brings them back', () => {
      expect(new Session('|a\nb\nc').press('Vjdp').text).toBe('c\na\nb')
    })
  })

  describe('y', () => {
    it('yanks the lines as a linewise register and returns to the top line', () => {
      const session = new Session('a\nb\n|c').press('Vky')

      expect(session.yanked).toEqual(['b\nc\n'])
      expect(session.text).toBe('a\nb\nc')
      expect(session.mode).toBe('normal')
      expect(session.view).toBe('a\n|b\nc')
    })

    it('keeps the column of the top end', () => {
      expect(new Session('a\nb|bb\ncc').press('Vjy').view).toBe('a\nb|bb\ncc')
      expect(new Session('a\nbbb\nc|c').press('Vky').view).toBe('a\nb|bb\ncc')
    })

    it('then p pastes the lines below the current line and P above it', () => {
      expect(new Session('a\nb\n|c').press('Vkyp').text).toBe('a\nb\nb\nc\nc')
      expect(new Session('a\nb\n|c').press('VkyP').text).toBe('a\nb\nc\nb\nc')
    })

    it('takes the last line without a trailing line break', () => {
      const session = new Session('a\n|c').press('Vyp')

      expect(session.yanked).toEqual(['c\n'])
      expect(session.text).toBe('a\nc\nc')
    })

    it('takes an empty line', () => {
      const session = new Session('a\n|\nb').press('Vyp')

      expect(session.yanked).toEqual(['\n'])
      expect(session.text).toBe('a\n\n\nb')
    })

    it('on a single-line document pastes a copy below', () => {
      expect(new Session('|abc').press('Vyp').text).toBe('abc\nabc')
    })
  })

  describe('c', () => {
    it('replaces the lines with one empty line and starts inserting', () => {
      const session = new Session('a\n|b\nc\nd').press('VjcX')

      expect(session.text).toBe('a\nX\nd')
      expect(session.mode).toBe('insert')
    })

    it('works on the last line and on a single-line document', () => {
      expect(new Session('a\n|b').press('VcX').text).toBe('a\nX')
      expect(new Session('a|bc').press('VcX').text).toBe('X')
      expect(new Session('a\n|\nb').press('VcX').text).toBe('a\nX\nb')
    })

    it('keeps the old lines in the register', () => {
      expect(new Session('a\n|b\nc').press('Vc<Esc>p').text).toBe('a\n\nb\nc')
    })
  })

  describe('o', () => {
    it('swaps the ends: the cursor moves to the other line', () => {
      const session = new Session('a\n|b\nc').press('Vjo')

      expect(session.selection).toEqual({ start: 2, end: 5 })
      expect(session.view).toBe('a\n|b\nc')
      expect(session.press('k').selection).toEqual({ start: 0, end: 5 })
    })
  })

  describe('switching with v', () => {
    it('v turns the selection into a charwise one around the same anchor and cursor', () => {
      const session = new Session('o|ne\ntwo').press('Vjv')

      expect(session.mode).toBe('visual')
      expect(session.selection).toEqual({ start: 1, end: 6 })
      expect(session.view).toBe('one\nt|wo')
    })

    it('V turns a charwise selection into whole lines', () => {
      const session = new Session('o|ne\ntwo').press('vjV')

      expect(session.mode).toBe('visual-line')
      expect(session.selection).toEqual({ start: 0, end: 7 })
      expect(session.view).toBe('one\nt|wo')
    })

    it('the same key again exits', () => {
      expect(new Session('o|ne').press('vV').mode).toBe('visual-line')
      expect(new Session('o|ne').press('vVV').mode).toBe('normal')
      expect(new Session('o|ne').press('Vv').mode).toBe('visual')
      expect(new Session('o|ne').press('Vvv').mode).toBe('normal')
    })

    it('keeps a backwards selection backwards', () => {
      const session = new Session('one\nt|wo').press('Vkv')

      expect(session.selection).toEqual({ start: 1, end: 6 })
      expect(session.view).toBe('o|ne\ntwo')
    })
  })

  it('computes the cursor from the state, not from the selection', () => {
    const state = { ...initialVimState, mode: 'visual-line' as const, visualAnchor: 0, visualCursor: 5 }

    expect(cursorOf(state, 'one\ntwo', { start: 0, end: 7 })).toBe(5)
    expect(visualLineRange('one\ntwo', 5, 1)).toEqual({ start: 0, end: 7 })
  })
})

describe('p and P in visual mode', () => {
  it('replace the selection with the register and put the replaced text in the register', () => {
    const session = new Session('|ab cd').press('xwvep')

    expect(session.text).toBe('b a')
    expect(session.view).toBe('b |a')
    expect(session.state.register).toEqual({ text: 'cd', linewise: false })
    expect(session.press('P').text).toBe('b cda')
  })

  it('P replaces too but leaves the register alone', () => {
    const session = new Session('|ab cd').press('xwveP')

    expect(session.text).toBe('b a')
    expect(session.state.register).toEqual({ text: 'a', linewise: false })
    expect(session.press('P').text).toBe('b aa')
  })

  it('swap a deleted word with the selection', () => {
    const session = new Session('|one two').press('dwvep')

    expect(session.text).toBe('one ')
    expect(session.state.register).toEqual({ text: 'two', linewise: false })
  })

  it('repeat the register with a count', () => {
    expect(new Session('|ab cd').press('xwve3p').text).toBe('b aaa')
  })

  it('do nothing with an empty register, and stay in visual mode', () => {
    const session = new Session('|abc').press('vp')

    expect(session.text).toBe('abc')
    expect(session.mode).toBe('visual')
  })

  it('replace lines with yanked lines', () => {
    const session = new Session('a\nb\n|c').press('yyggVp')

    expect(session.text).toBe('c\nb\nc')
    expect(session.mode).toBe('normal')
    expect(session.state.register).toEqual({ text: 'a\n', linewise: true })
    expect(session.press('p').text).toBe('c\na\nb\nc')
  })

  it('replace lines with several yanked lines, the last line included', () => {
    expect(new Session('|a\nb\nc').press('yjGVp').text).toBe('a\nb\na\nb')
  })

  it('turn a charwise register into a line when it replaces lines', () => {
    const session = new Session('|ab\ncd').press('xjVp')

    expect(session.text).toBe('b\na')
    expect(session.state.register).toEqual({ text: 'cd\n', linewise: true })
  })

  it('split the line when lines replace a charwise selection', () => {
    const session = new Session('L\n|one two three').press('ggyyjwvep')

    expect(session.text).toBe('L\none \nL\n three')
    expect(session.view).toBe('L\none \n|L\n three')
    expect(session.state.register).toEqual({ text: 'two', linewise: false })
  })
})

describe('counts', () => {
  it('0 is a motion until a digit came first', () => {
    expect(view('ab|c', '0')).toBe('|abc')
    expect(view('|abcdefghijkl', '10l')).toBe('abcdefghij|kl')
  })

  it('are cleared by a command', () => {
    const session = new Session('|abc').press('2l')

    expect(session.state.count).toBe(0)
  })
})
