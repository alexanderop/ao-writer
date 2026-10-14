/** Index of the first character of the line that holds `pos`. */
export function lineStart(text: string, pos: number): number {
  return pos <= 0 ? 0 : text.lastIndexOf('\n', pos - 1) + 1
}

/** Index of the line break that ends the line holding `pos` (or the text length on the last line). */
export function lineEnd(text: string, pos: number): number {
  const index = text.indexOf('\n', pos)

  return index === -1 ? text.length : index
}

/** The zero-based line number that holds `pos`. */
export function lineNumber(text: string, pos: number): number {
  let count = 0

  for (let index = text.indexOf('\n'); index !== -1 && index < pos; index = text.indexOf('\n', index + 1)) count += 1

  return count
}

/** The start of line `line`; a line past the end of the text gives the start of the last line. */
export function lineStartOf(text: string, line: number): number {
  let start = 0

  for (let remaining = line; remaining > 0; remaining -= 1) {
    const next = text.indexOf('\n', start)

    if (next === -1) break

    start = next + 1
  }

  return start
}

function isBlank(char: string | undefined): boolean {
  return char === ' ' || char === '\t'
}

/** The first character on the line of `pos` that is not a space or tab; on a blank line the last character. */
export function firstNonBlank(text: string, pos: number): number {
  const start = lineStart(text, pos)
  const end = lineEnd(text, pos)

  for (let index = start; index < end; index += 1) {
    if (!isBlank(text[index])) return index
  }

  return Math.max(start, end - 1)
}

/** How many UTF-16 units the character at `pos` takes; zero at a line break and at the end of the text. */
export function charLength(text: string, pos: number): number {
  const char = text.charCodeAt(pos)

  if (Number.isNaN(char) || char === 10) return 0

  const next = text.charCodeAt(pos + 1)

  return char >= 0xd800 && char <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1
}

/** Where the character before `pos` starts; `pos` itself at the start of the text. */
export function previousChar(text: string, pos: number): number {
  if (pos <= 0) return 0

  const char = text.charCodeAt(pos - 1)
  const before = text.charCodeAt(pos - 2)

  return char >= 0xdc00 && char <= 0xdfff && before >= 0xd800 && before <= 0xdbff ? pos - 2 : pos - 1
}

/**
Where the cursor may rest in normal mode: on a character, never behind the last one of a line.
An empty line is the one place that has nothing to rest on, so the cursor sits on its line break.
*/
export function clampNormal(text: string, pos: number): number {
  const at = Math.min(Math.max(pos, 0), text.length)

  if (at === text.length || text[at] === '\n') return at > lineStart(text, at) ? previousChar(text, at) : at

  // a position inside a surrogate pair moves back to the start of the pair
  return previousChar(text, at + 1)
}
