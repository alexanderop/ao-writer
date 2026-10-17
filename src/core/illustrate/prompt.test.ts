import { describe, expect, it } from 'vitest'

import { findIllustrateTarget, illustrationPrompt } from './prompt.ts'

describe('illustrationPrompt', () => {
  it('asks for an image only, in the light house style', () => {
    expect(illustrationPrompt('a fox reading the paper at dawn', 'light')).toBe(
      [
        'Only generate images. Do not read or edit code. Use your built-in image generation tool.',
        'Style: a quiet editorial ink illustration in muted graphite, with a lot of calm empty space.',
        'Background: solid #f8f5ee, with no texture, frame or vignette.',
        'Accent: #3b7a68, used sparingly for one small detail.',
        'Do not put any text, letters or logos in the image.',
        'Aspect ratio: 16:9.',
        'Subject: a fox reading the paper at dawn',
        'Save it as ./out.png in the current directory.',
      ].join('\n'),
    )
  })

  it('swaps the background for the dark theme', () => {
    expect(illustrationPrompt('x', 'dark')).toContain('Background: solid #171c25,')
  })
})

describe('findIllustrateTarget', () => {
  const text = 'Intro line.\n\nA fox reads\nthe paper at dawn.\n\n![a paper boat]() and more\n\nLast.'

  it('finds the empty image when the caret is inside its alt text', () => {
    const caret = text.indexOf('paper boat')

    expect(findIllustrateTarget(text, caret, caret)).toEqual({ kind: 'emptyImage', description: 'a paper boat', insertAt: text.indexOf('()') + 1 })
  })

  it('finds the empty image with the caret on either edge', () => {
    const start = text.indexOf('![')
    const end = text.indexOf(')') + 1
    const target = { kind: 'emptyImage', description: 'a paper boat', insertAt: text.indexOf('()') + 1 }

    expect(findIllustrateTarget(text, start, start)).toEqual(target)
    expect(findIllustrateTarget(text, end, end)).toEqual(target)
  })

  it('takes the selection and the end of its paragraph otherwise', () => {
    const start = text.indexOf('fox')
    const end = text.indexOf('paper at')

    expect(findIllustrateTarget(text, start, end)).toEqual({ kind: 'selection', description: 'fox reads the', insertAt: text.indexOf('dawn.') + 5 })
  })

  it('drops brackets from a selection and ignores a selection of blanks', () => {
    expect(findIllustrateTarget('see [this] now', 0, 14)).toEqual({ kind: 'selection', description: 'see this now', insertAt: 14 })
    expect(findIllustrateTarget('a   \n\nb', 1, 4)).toBeNull()
  })

  it('is null for a bare caret outside an empty image', () => {
    expect(findIllustrateTarget(text, 3, 3)).toBeNull()
    expect(findIllustrateTarget('![]() empty alt', 2, 2)).toBeNull()
  })

  it('leaves the end of the paragraph before trailing newlines at the end of the text', () => {
    expect(findIllustrateTarget('A fox.\n', 0, 5)).toEqual({ kind: 'selection', description: 'A fox', insertAt: 6 })
  })
})
