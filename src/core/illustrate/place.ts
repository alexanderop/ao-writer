import type { TextEdit } from '../markdown/format.ts'
import { paragraphEnd } from './prompt.ts'
import type { IllustrateTarget } from './prompt.ts'

/** The alt text of a picture that is still being drawn. */
const PLACEHOLDER_ALT = 'Drawing…'

/** The relative Markdown path of a picture. */
function imagePath(id: string): string {
  return `images/${id}.webp`
}

function escaped(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The image `![alt](images/<id>.webp)` with this id; `alt` is a pattern for its alt text, any by default. */
function imagePattern(id: string, alt: string = '[^\\]\\n]*'): RegExp {
  return new RegExp(`!\\[(${alt})\\]\\(${escaped(imagePath(id))}\\)`)
}

/** Where an offset lands once `from..to` is replaced by `length` characters. An offset inside the replaced range ends up after it. */
function mapOffset(offset: number, from: number, to: number, length: number): number {
  if (offset <= from) return offset

  return offset >= to ? offset - (to - from) + length : from + length
}

function replacement(from: number, to: number, insert: string, selectionStart: number, selectionEnd: number): TextEdit {
  return { from, to, insert, selectionStart: mapOffset(selectionStart, from, to, insert.length), selectionEnd: mapOffset(selectionEnd, from, to, insert.length) }
}

/**
The placeholder for the picture that is about to be drawn, put in the text before Codex starts. An empty image gets its
destination filled in and keeps the writer's description as alt text. Anything else gets its own paragraph, with blank lines
around it: on a blank line it takes that line (and the caret moves behind it), otherwise it follows the paragraph of `insertAt`.
The selection stays on the same text.
*/
export function placementEdit(text: string, target: IllustrateTarget, id: string, selectionStart: number, selectionEnd: number): TextEdit {
  if (target.kind === 'emptyImage') return replacement(target.insertAt, target.insertAt, imagePath(id), selectionStart, selectionEnd)

  const image = `![${PLACEHOLDER_ALT}](${imagePath(id)})`
  const at = Math.min(target.insertAt, text.length)
  const lineStart = at === 0 ? 0 : text.lastIndexOf('\n', at - 1) + 1
  const newline = text.indexOf('\n', at)
  const lineEnd = newline === -1 ? text.length : newline
  const blank = text.slice(lineStart, lineEnd).trim() === ''
  const from = blank ? lineStart : paragraphEnd(text, at)
  const to = blank ? lineEnd : from
  const before = from === 0 ? 2 : (/\n*$/.exec(text.slice(0, from))?.[0].length ?? 0)
  const after = /^\n*/.exec(text.slice(to))?.[0].length ?? 0
  const prefix = blank ? '\n'.repeat(Math.max(0, 2 - before)) : '\n\n'
  const suffix = '\n'.repeat(2 - Math.min(after, 2))
  const insert = `${prefix}${image}${suffix}`

  if (!blank) return replacement(from, to, insert, selectionStart, selectionEnd)

  const caret = from + insert.length + Math.min(after, 2)

  return { from, to, insert, selectionStart: caret, selectionEnd: caret }
}

/** Gives the picture with this id its alt text, wherever the writer's typing has moved it. Null when it is gone from the text. */
export function altEdit(text: string, id: string, alt: string, selectionStart: number, selectionEnd: number): TextEdit | null {
  const match = imagePattern(id).exec(text)

  if (match === null) return null

  const from = match.index + 2

  return replacement(from, from + (match[1]?.length ?? 0), alt, selectionStart, selectionEnd)
}

/**
Undoes a picture that failed. A placeholder whose alt text is still `Drawing…` leaves the text with the blank line that set it apart;
an image with the writer's own alt text gets its empty `()` back, so the shortcut can try it again. Null when it is gone.
*/
export function withdrawEdit(text: string, id: string, selectionStart: number, selectionEnd: number): TextEdit | null {
  const match = imagePattern(id).exec(text)

  if (match === null) return null

  if (match[1] !== PLACEHOLDER_ALT) {
    const destination = match.index + match[0].length - 1 - imagePath(id).length

    return replacement(destination, destination + imagePath(id).length, '', selectionStart, selectionEnd)
  }

  let from = match.index
  let to = from + match[0].length
  const alone = (from === 0 || text.slice(from - 2, from) === '\n\n') && (to === text.length || text.slice(to, to + 2) === '\n\n')

  if (alone && text.slice(to, to + 2) === '\n\n') to += 2
  else if (alone && from > 0) from -= 2

  return replacement(from, to, '', selectionStart, selectionEnd)
}
