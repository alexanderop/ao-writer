import type { TextEdit } from '../markdown/format.ts'
import { emptyImages, paragraphEnd } from './prompt.ts'
import type { IllustrateTarget } from './prompt.ts'

/**
Where the picture goes in the text as it is now, once the picture is ready. The writer kept typing while it was made,
so the empty image is looked up by its description, and the paragraph of a selection by the offset recorded back then.
Null when the empty image is gone. The selection stays on the same text.
*/
export function illustrationEdit(text: string, target: IllustrateTarget, path: string, selectionStart: number, selectionEnd: number): TextEdit | null {
  if (target.kind === 'emptyImage') {
    const home = emptyImages(text)
      .filter((image) => image.description === target.description)
      .sort((a, b) => Math.abs(a.insertAt - target.insertAt) - Math.abs(b.insertAt - target.insertAt))[0]

    if (home === undefined) return null

    const shift = (offset: number) => (offset >= home.insertAt ? offset + path.length : offset)

    return { from: home.insertAt, to: home.insertAt, insert: path, selectionStart: shift(selectionStart), selectionEnd: shift(selectionEnd) }
  }

  const at = paragraphEnd(text, Math.min(target.insertAt, text.length))
  const insert = `\n\n![${target.description}](${path})`
  const shift = (offset: number) => (offset > at ? offset + insert.length : offset)

  return { from: at, to: at, insert, selectionStart: shift(selectionStart), selectionEnd: shift(selectionEnd) }
}
