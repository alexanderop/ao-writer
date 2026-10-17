import type { FormatAction } from './markdown/format.ts'

/** Everything the app can do from the keyboard or a button. */
export type ActionId =
  | FormatAction
  | 'focus'
  | 'syntax'
  | 'style'
  | 'preview'
  | 'previewLayout'
  | 'theme'
  | 'biggerText'
  | 'smallerText'
  | 'normalText'
  | 'library'
  | 'newDocument'
  | 'coach'
  | 'illustrate'

/** One key combination. `mod` is Cmd on a Mac and Ctrl elsewhere. */
export interface Chord {
  readonly mod: boolean
  readonly ctrl: boolean
  readonly alt: boolean
  readonly shift: boolean | null
  readonly code: string | null
  readonly keys: readonly string[]
  readonly label: string
}

/** The parts of a KeyboardEvent the matcher reads. */
export interface KeyLike {
  readonly code: string
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/** A shortcut as documented: what it does and the chords for each platform (the first chord is the one shown). */
export interface Shortcut {
  readonly id: ActionId
  readonly label: string
  readonly mac: readonly string[]
  readonly other: readonly string[]
}

const NAMED_KEYS: ReadonlyMap<string, { code: string | null; keys: readonly string[]; shift: boolean | null; label: string }> = new Map([
  ['=', { code: null, keys: ['=', '+'], shift: null, label: '+' }],
  ['-', { code: null, keys: ['-', '_'], shift: null, label: '-' }],
  ['.', { code: 'Period', keys: [], shift: true, label: '.' }],
])

/** Parses a spec such as "Mod+Shift+D" into a chord. */
export function parseChord(spec: string): Chord {
  const parts = spec.split('+')
  const key = parts.at(-1) ?? ''
  const named = NAMED_KEYS.get(key)
  const flags = new Set(parts.slice(0, -1))
  const isLetter = /^[A-Za-z]$/.test(key)
  const isDigit = /^[0-9]$/.test(key)

  if (named) {
    return { mod: flags.has('Mod'), ctrl: flags.has('Ctrl'), alt: flags.has('Alt'), shift: named.shift, code: named.code, keys: named.keys, label: named.label }
  }

  return {
    mod: flags.has('Mod'),
    ctrl: flags.has('Ctrl'),
    alt: flags.has('Alt'),
    shift: flags.has('Shift'),
    code: isLetter ? `Key${key.toUpperCase()}` : isDigit ? `Digit${key}` : key,
    keys: [],
    label: key.toUpperCase(),
  }
}

/** Whether the key event is exactly this chord on this platform. */
export function matchesChord(chord: Chord, event: KeyLike, isMac: boolean): boolean {
  const wantsMeta = isMac && chord.mod
  const wantsCtrl = chord.ctrl || (!isMac && chord.mod)

  if (event.metaKey !== wantsMeta || event.ctrlKey !== wantsCtrl || event.altKey !== chord.alt) return false

  if (chord.shift !== null && event.shiftKey !== chord.shift) return false

  return (chord.code !== null && event.code === chord.code) || chord.keys.includes(event.key)
}

/** Shows a chord the way the platform writes it: "⌘⇧D" on a Mac, "Ctrl+Shift+D" elsewhere. */
export function formatChord(chord: Chord, isMac: boolean): string {
  const shift = chord.shift === true

  if (isMac) {
    return `${chord.ctrl ? '⌃' : ''}${chord.alt ? '⌥' : ''}${shift ? '⇧' : ''}${chord.mod ? '⌘' : ''}${chord.label}`
  }

  const parts = [chord.mod || chord.ctrl ? 'Ctrl' : '', chord.alt ? 'Alt' : '', shift ? 'Shift' : '', chord.label]

  return parts.filter((part) => part !== '').join('+')
}

/** Every shortcut of the MVP. On Windows and Linux Cmd maps to Ctrl; Mod+Ctrl on a Mac becomes Ctrl+Alt elsewhere. */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'focus', label: 'Focus mode', mac: ['Mod+D'], other: ['Mod+D'] },
  { id: 'syntax', label: 'Syntax highlight', mac: ['Mod+Shift+D'], other: ['Mod+Shift+D'] },
  { id: 'style', label: 'Style check', mac: ['Mod+Alt+D'], other: ['Mod+Alt+D'] },
  { id: 'preview', label: 'Preview', mac: ['Mod+R'], other: ['Mod+R'] },
  { id: 'previewLayout', label: 'Split or full preview', mac: ['Mod+Shift+R'], other: ['Mod+Shift+R'] },
  { id: 'theme', label: 'Dark appearance', mac: ['Mod+Ctrl+N'], other: ['Ctrl+Alt+N'] },
  { id: 'biggerText', label: 'Bigger text', mac: ['Mod+='], other: ['Mod+='] },
  { id: 'smallerText', label: 'Smaller text', mac: ['Mod+-'], other: ['Mod+-'] },
  { id: 'normalText', label: 'Normal text size', mac: ['Mod+0'], other: ['Mod+0'] },
  { id: 'library', label: 'Library', mac: ['Mod+Ctrl+S'], other: ['Ctrl+Alt+S'] },
  { id: 'newDocument', label: 'New document', mac: ['Alt+Shift+N'], other: ['Alt+Shift+N'] },
  { id: 'coach', label: 'Ask the coach', mac: ['Mod+Shift+K'], other: ['Mod+Shift+K'] },
  { id: 'illustrate', label: 'Illustrate', mac: ['Mod+Shift+I'], other: ['Mod+Alt+I'] },
  { id: 'bold', label: 'Bold', mac: ['Mod+B'], other: ['Mod+B'] },
  { id: 'italic', label: 'Italic', mac: ['Mod+I'], other: ['Mod+I'] },
  { id: 'strike', label: 'Strikethrough', mac: ['Mod+Alt+U'], other: ['Mod+Alt+U'] },
  { id: 'code', label: 'Code', mac: ['Mod+J'], other: ['Mod+J'] },
  { id: 'codeBlock', label: 'Code block', mac: ['Mod+Shift+J'], other: ['Mod+Shift+J'] },
  { id: 'h1', label: 'Heading 1', mac: ['Mod+1', 'Mod+Alt+1'], other: ['Mod+1', 'Mod+Alt+1'] },
  { id: 'h2', label: 'Heading 2', mac: ['Mod+2', 'Mod+Alt+2'], other: ['Mod+2', 'Mod+Alt+2'] },
  { id: 'h3', label: 'Heading 3', mac: ['Mod+3', 'Mod+Alt+3'], other: ['Mod+3', 'Mod+Alt+3'] },
  { id: 'h4', label: 'Heading 4', mac: ['Mod+4', 'Mod+Alt+4'], other: ['Mod+4', 'Mod+Alt+4'] },
  { id: 'h5', label: 'Heading 5', mac: ['Mod+5', 'Mod+Alt+5'], other: ['Mod+5', 'Mod+Alt+5'] },
  { id: 'h6', label: 'Heading 6', mac: ['Mod+6', 'Mod+Alt+6'], other: ['Mod+6', 'Mod+Alt+6'] },
  { id: 'list', label: 'List', mac: ['Mod+L', 'Mod+Shift+8'], other: ['Mod+L', 'Mod+Shift+8'] },
  { id: 'orderedList', label: 'Ordered list', mac: ['Mod+Shift+L', 'Mod+Shift+7'], other: ['Mod+Shift+L', 'Mod+Shift+7'] },
  { id: 'taskList', label: 'Task list', mac: ['Mod+Alt+L'], other: ['Mod+Alt+L'] },
  { id: 'quote', label: 'Blockquote', mac: ['Mod+Shift+.'], other: ['Mod+Shift+.'] },
  { id: 'link', label: 'Link', mac: ['Mod+K'], other: ['Mod+K'] },
  { id: 'toggleTask', label: 'Mark task completed', mac: ['Mod+Alt+X'], other: ['Mod+Alt+X'] },
]

const PARSED: ReadonlyMap<string, readonly Chord[]> = new Map(
  SHORTCUTS.flatMap((shortcut) => [
    [`mac:${shortcut.id}`, shortcut.mac.map(parseChord)] as const,
    [`other:${shortcut.id}`, shortcut.other.map(parseChord)] as const,
  ]),
)

/** The action a key event triggers on this platform, or null. */
export function findAction(event: KeyLike, isMac: boolean): ActionId | null {
  const platform = isMac ? 'mac' : 'other'

  for (const shortcut of SHORTCUTS) {
    const chords = PARSED.get(`${platform}:${shortcut.id}`) ?? []

    if (chords.some((chord) => matchesChord(chord, event, isMac))) return shortcut.id
  }

  return null
}

/** The chord shown next to a button or menu entry. */
export function shortcutLabel(id: ActionId, isMac: boolean): string {
  const shortcut = SHORTCUTS.find((candidate) => candidate.id === id)
  const spec = (isMac ? shortcut?.mac : shortcut?.other)?.[0]

  return spec === undefined ? '' : formatChord(parseChord(spec), isMac)
}

const FORMAT_ACTIONS: ReadonlySet<ActionId> = new Set<FormatAction>([
  'bold', 'italic', 'strike', 'code', 'codeBlock', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'list', 'orderedList', 'taskList', 'quote', 'link', 'toggleTask',
])

/** True for the actions that edit the text rather than change the view. */
export function isFormatAction(id: ActionId): id is FormatAction {
  return FORMAT_ACTIONS.has(id)
}
