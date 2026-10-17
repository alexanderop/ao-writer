/** The longest alt text kept, so a rambling reply cannot turn into a paragraph inside the brackets. */
const MAX_ALT = 125

/** The alt text from Codex's last message: its last line, flattened so it fits inside `![…]`. Null when nothing usable is left. */
export function cleanAlt(raw: string): string | null {
  const last = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .at(-1)

  if (last === undefined) return null

  const flat = last
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (flat.length <= MAX_ALT) return flat === '' ? null : flat

  const space = flat.charAt(MAX_ALT) === ' ' ? MAX_ALT : flat.lastIndexOf(' ', MAX_ALT)
  const cut = flat.slice(0, space > 0 ? space : MAX_ALT)

  return cut.replace(/[\s,;:]+$/, '')
}
