/** What the writer asked to illustrate: the empty image under the caret, or the selected text. */
export interface IllustrateTarget {
  readonly kind: 'emptyImage' | 'selection'
  readonly description: string
  /** Where the picture goes: the offset inside the empty `()`, or the end of the paragraph the selection is in. */
  readonly insertAt: number
}

/** The house style: every picture in the app should look like it came from one hand. */
const STYLE = [
  'Style: a quiet editorial ink illustration in muted graphite, with a lot of calm empty space.',
  'Background: solid {background}, with no texture, frame or vignette.',
  'Accent: {accent}, used sparingly for one small detail.',
  'Do not put any text, letters or logos in the image.',
  'Aspect ratio: 16:9.',
]

const BACKGROUND = { light: '#f8f5ee', dark: '#171c25' } as const

const ACCENT = '#3b7a68'

/** The prompt that makes Codex render one picture for a description, in the house style, into ./out.png. */
export function illustrationPrompt(description: string, theme: 'light' | 'dark'): string {
  const style = STYLE.map((line) => line.replace('{background}', BACKGROUND[theme]).replace('{accent}', ACCENT))

  return [
    'Only generate images. Do not read or edit code. Use your built-in image generation tool.',
    ...style,
    `Subject: ${description}`,
    'Save it as ./out.png in the current directory.',
  ].join('\n')
}

/** An image whose destination is still empty: `![alt]()`. */
interface EmptyImage {
  readonly description: string
  /** Offset of the `!`. */
  readonly start: number
  /** Offset just after the `)`. */
  readonly end: number
  /** Offset between the parentheses. */
  readonly insertAt: number
}

/** Every empty image with a description in the text, in order. */
export function emptyImages(text: string): readonly EmptyImage[] {
  return [...text.matchAll(/!\[([^\]\n]*)\]\(\)/g)].flatMap((match) => {
    const description = match[1]?.trim() ?? ''

    return description === '' ? [] : [{ description, start: match.index, end: match.index + match[0].length, insertAt: match.index + match[0].length - 1 }]
  })
}

/** The end of the paragraph that holds `from`, before its trailing whitespace. */
export function paragraphEnd(text: string, from: number): number {
  const blank = /\n[ \t]*\n/g

  blank.lastIndex = from

  let end = blank.exec(text)?.index ?? text.length

  while (end > from && /\s/.test(text.charAt(end - 1))) end--

  return end
}

/** Square brackets and line breaks would break the image's alt text, so a selection is flattened before it becomes one. */
function altText(selected: string): string {
  return selected.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim()
}

/** What the writer means to illustrate: an empty image the selection sits in, else the selected text, else nothing. */
export function findIllustrateTarget(text: string, selectionStart: number, selectionEnd: number): IllustrateTarget | null {
  const image = emptyImages(text).find((candidate) => candidate.start <= selectionStart && selectionEnd <= candidate.end)

  if (image) return { kind: 'emptyImage', description: image.description, insertAt: image.insertAt }

  const description = altText(text.slice(selectionStart, selectionEnd))

  if (description === '') return null

  return { kind: 'selection', description, insertAt: paragraphEnd(text, selectionEnd) }
}
