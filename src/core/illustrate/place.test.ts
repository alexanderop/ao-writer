import { describe, expect, it } from 'vitest'

import type { TextEdit } from '../markdown/format.ts'
import { altEdit, placementEdit, withdrawEdit } from './place.ts'

function apply(text: string, edit: TextEdit | null): string | null {
  return edit === null ? null : text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
}

const image = '![Drawing…](images/ab12cd34.webp)'

describe('placementEdit', () => {
  it('fills the empty destination of the image and keeps the description as alt text', () => {
    const text = 'Intro.\n\n![a paper boat]()\n\nEnd.'
    const target = { kind: 'emptyImage', description: 'a paper boat', insertAt: text.indexOf('()') + 1 } as const

    expect(apply(text, placementEdit(text, target, 'ab12cd34', 0, 0))).toBe('Intro.\n\n![a paper boat](images/ab12cd34.webp)\n\nEnd.')
  })

  it('moves the caret past the inserted path only when it sat after it', () => {
    const text = '![boat]() tail'
    const target = { kind: 'emptyImage', description: 'boat', insertAt: 8 } as const

    expect(placementEdit(text, target, 'ab12cd34', 12, 12)).toMatchObject({ selectionStart: 12 + 'images/ab12cd34.webp'.length })
    expect(placementEdit(text, target, 'ab12cd34', 2, 4)).toMatchObject({ selectionStart: 2, selectionEnd: 4 })
  })

  it('adds the placeholder after the selection\'s paragraph and leaves the selection on its text', () => {
    const text = 'A fox reads\nthe paper.\n\nNext paragraph.'
    const target = { kind: 'selection', description: 'A fox reads', insertAt: text.indexOf('paper.') + 6 } as const
    const edit = placementEdit(text, target, 'ab12cd34', 0, 11)

    expect(apply(text, edit)).toBe(`A fox reads\nthe paper.\n\n${image}\n\nNext paragraph.`)
    expect(edit).toMatchObject({ selectionStart: 0, selectionEnd: 11 })
  })

  it('fills the blank line the prompt box opened on and puts the caret behind the placeholder', () => {
    const text = 'Intro.\n\n\n\nEnd.'
    const target = { kind: 'prompt', description: 'a fox', insertAt: 8 } as const
    const edit = placementEdit(text, target, 'ab12cd34', 8, 8)
    const result = apply(text, edit)

    expect(result).toBe(`Intro.\n\n${image}\n\nEnd.`)
    expect(edit.selectionStart).toBe(result?.indexOf('End.'))
  })

  it('adds the blank lines a blank line directly under text is missing', () => {
    const text = 'Intro.\n\nMore.\n'
    const target = { kind: 'prompt', description: 'a fox', insertAt: text.length } as const

    expect(apply(text, placementEdit(text, target, 'ab12cd34', text.length, text.length))).toBe(`Intro.\n\nMore.\n\n${image}\n\n`)
  })

  it('writes into an empty document', () => {
    const target = { kind: 'prompt', description: 'a fox', insertAt: 0 } as const
    const edit = placementEdit('', target, 'ab12cd34', 0, 0)

    expect(apply('', edit)).toBe(`${image}\n\n`)
    expect(edit.selectionStart).toBe(image.length + 2)
  })

  it('puts the placeholder after the paragraph when the caret sits in a line of text', () => {
    const text = 'First line\nsecond line.\n\nNext.'
    const target = { kind: 'prompt', description: 'a fox', insertAt: 4 } as const
    const edit = placementEdit(text, target, 'ab12cd34', 4, 4)

    expect(apply(text, edit)).toBe(`First line\nsecond line.\n\n${image}\n\nNext.`)
    expect(edit).toMatchObject({ selectionStart: 4, selectionEnd: 4 })
  })
})

describe('altEdit', () => {
  it('replaces the alt text of the placeholder', () => {
    const text = `Intro.\n\n${image}\n\nEnd.`

    expect(apply(text, altEdit(text, 'ab12cd34', 'A fox reads a paper at dawn.', 0, 0))).toBe('Intro.\n\n![A fox reads a paper at dawn.](images/ab12cd34.webp)\n\nEnd.')
  })

  it('finds the image again after the writer typed above it and shifts the caret with the text', () => {
    const text = `Typed first.\n\n${image}`
    const edit = altEdit(text, 'ab12cd34', 'A fox.', text.length, text.length)

    expect(apply(text, edit)).toBe('Typed first.\n\n![A fox.](images/ab12cd34.webp)')
    expect(edit).toMatchObject({ selectionStart: text.length - 'Drawing…'.length + 'A fox.'.length })
  })

  it('replaces the writer\'s own description too', () => {
    const text = '![a paper boat](images/ab12cd34.webp)'

    expect(apply(text, altEdit(text, 'ab12cd34', 'A paper boat on a pond.', 0, 0))).toBe('![A paper boat on a pond.](images/ab12cd34.webp)')
  })

  it('leaves other pictures alone', () => {
    const text = '![Drawing…](images/eeeeeeee.webp)\n\n![Drawing…](images/ab12cd34.webp)'

    expect(apply(text, altEdit(text, 'ab12cd34', 'A fox.', 0, 0))).toBe('![Drawing…](images/eeeeeeee.webp)\n\n![A fox.](images/ab12cd34.webp)')
  })

  it('is null when the placeholder is gone', () => {
    expect(altEdit('The writer deleted it.', 'ab12cd34', 'A fox.', 0, 0)).toBeNull()
  })
})

describe('withdrawEdit', () => {
  it('removes a placeholder that stands alone together with one blank line', () => {
    const text = `Intro.\n\n${image}\n\nEnd.`

    expect(apply(text, withdrawEdit(text, 'ab12cd34', 0, 0))).toBe('Intro.\n\nEnd.')
  })

  it('removes a placeholder at the end of the text with the blank line before it', () => {
    const text = `Intro.\n\n${image}`

    expect(apply(text, withdrawEdit(text, 'ab12cd34', 0, 0))).toBe('Intro.')
  })

  it('removes only the image from a line that holds more', () => {
    const text = `Before ${image} after`

    expect(apply(text, withdrawEdit(text, 'ab12cd34', 0, 0))).toBe('Before  after')
  })

  it('keeps a caret after the placeholder on the same text', () => {
    const text = `Intro.\n\n${image}\n\nEnd.`

    expect(withdrawEdit(text, 'ab12cd34', text.length, text.length)).toMatchObject({ selectionStart: 'Intro.\n\nEnd.'.length })
  })

  it('gives an image with the writer\'s own alt text its empty destination back', () => {
    const text = 'Intro.\n\n![a paper boat](images/ab12cd34.webp)\n\nEnd.'

    expect(apply(text, withdrawEdit(text, 'ab12cd34', 0, 0))).toBe('Intro.\n\n![a paper boat]()\n\nEnd.')
  })

  it('is null when the placeholder is gone', () => {
    expect(withdrawEdit('Nothing here.', 'ab12cd34', 0, 0)).toBeNull()
  })
})
