import { describe, expect, it } from 'vitest'

import type { TextEdit } from '../markdown/format.ts'
import { illustrationEdit } from './place.ts'

function apply(text: string, edit: TextEdit | null): string | null {
  return edit === null ? null : text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
}

const path = 'images/ab12.webp'

describe('illustrationEdit', () => {
  it('fills the empty destination of the image', () => {
    const text = 'Intro.\n\n![a paper boat]()\n\nEnd.'
    const target = { kind: 'emptyImage', description: 'a paper boat', insertAt: text.indexOf('()') + 1 } as const

    expect(apply(text, illustrationEdit(text, target, path, 0, 0))).toBe('Intro.\n\n![a paper boat](images/ab12.webp)\n\nEnd.')
  })

  it('finds the image again after the writer typed above it', () => {
    const before = '![a paper boat]()'
    const target = { kind: 'emptyImage', description: 'a paper boat', insertAt: before.indexOf('()') + 1 } as const
    const text = `A new line first.\n\n${before}`

    expect(apply(text, illustrationEdit(text, target, path, 3, 3))).toBe('A new line first.\n\n![a paper boat](images/ab12.webp)')
  })

  it('picks the nearest of two identical placeholders', () => {
    const text = '![boat]()\n\n![boat]()'
    const target = { kind: 'emptyImage', description: 'boat', insertAt: text.lastIndexOf('()') + 1 } as const

    expect(apply(text, illustrationEdit(text, target, path, 0, 0))).toBe('![boat]()\n\n![boat](images/ab12.webp)')
  })

  it('is null when the empty image is gone', () => {
    const target = { kind: 'emptyImage', description: 'a paper boat', insertAt: 20 } as const

    expect(illustrationEdit('The writer deleted it.', target, path, 0, 0)).toBeNull()
  })

  it('moves the caret past the inserted path only when it sat after it', () => {
    const text = '![boat]() tail'
    const target = { kind: 'emptyImage', description: 'boat', insertAt: 8 } as const
    const edit = illustrationEdit(text, target, path, 12, 12)

    expect(edit?.selectionStart).toBe(12 + path.length)
    expect(illustrationEdit(text, target, path, 2, 4)).toMatchObject({ selectionStart: 2, selectionEnd: 4 })
  })

  it('adds the image on a new line after the selection\'s paragraph', () => {
    const text = 'A fox reads\nthe paper.\n\nNext paragraph.'
    const target = { kind: 'selection', description: 'A fox reads', insertAt: text.indexOf('paper.') + 6 } as const

    expect(apply(text, illustrationEdit(text, target, path, 0, 11))).toBe('A fox reads\nthe paper.\n\n![A fox reads](images/ab12.webp)\n\nNext paragraph.')
  })

  it('finishes the paragraph the recorded offset lands in when the text changed meanwhile', () => {
    const text = 'Typed before. A fox reads the paper.\n\nNext.'
    const target = { kind: 'selection', description: 'A fox', insertAt: 14 } as const

    expect(apply(text, illustrationEdit(text, target, path, 0, 0))).toBe('Typed before. A fox reads the paper.\n\n![A fox](images/ab12.webp)\n\nNext.')
  })

  it('clamps a recorded offset past the end of the text', () => {
    const target = { kind: 'selection', description: 'Fox', insertAt: 500 } as const

    expect(apply('Fox', illustrationEdit('Fox', target, path, 0, 3))).toBe('Fox\n\n![Fox](images/ab12.webp)')
  })
})
