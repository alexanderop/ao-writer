import { Option, Schema } from 'effect'

import { PracticeWord } from '../learn/practice.ts'

import type { TextEdit } from '../markdown/format.ts'

/*
Fix spelling and grammar: the agent returns small swaps ("wrong" → "right"), never a rewrite, so the writer's wording
and voice stay theirs. The swaps are applied here, outside code and link targets, as one edit the writer can undo.
*/

/** One correction: a short passage copied from the text, and the same passage corrected. */
const Fix = Schema.Struct({ wrong: Schema.String, right: Schema.String, practice: Schema.optionalKey(PracticeWord) })

export type Fix = typeof Fix.Type

const Reply = Schema.Struct({ fixes: Schema.Array(Fix) })

const decodeReply = Schema.decodeUnknownOption(Schema.fromJsonString(Reply))

/** A swap longer than this is a rewrite, not a fix, and is left out. */
const MAX_FIX_CHARS = 120

/** How the fixer behaves; told once per session. */
export const FIX_INSTRUCTIONS = `You are a proofreader. You correct spelling, grammar, punctuation and typos in a Markdown draft, and nothing else.

- Never change word choice, tone, sentence structure, or style when the original is correct. A casual or unusual phrasing that is grammatical stays.
- Keep the language of the draft. In a draft that mixes languages, correct each part in its own language.
- Leave code, inline code, URLs, Markdown syntax and proper names alone.
- Each fix copies a short passage character for character from the draft ("wrong"), just long enough to be unique (a few words), and gives the same passage corrected ("right").
- If there is nothing to fix, return an empty list.
- For an English spelling mistake only, optionally add "practice": {"word": "<the corrected English word alone>", "german": "<short German meaning in this context, without the English answer>", "sentence": "<a short corrected English example containing that exact word>", "explanation": "<brief English spelling cue or meaning>"}. Do not add practice for grammar, punctuation, proper names, non-English words, or correct word choices. The word must be the spelling you actually corrected in "right".

Reply with JSON only, no code fence: {"fixes": [{"wrong": "<passage from the draft>", "right": "<the corrected passage>"}]}`

/** What the fixer is shown: the draft, or the selected part of it. */
export function fixPrompt(text: string): string {
  return `The draft:\n<draft>\n${text}\n</draft>\n\nYour fixes, as JSON.`
}

/** The fixes in the reply that are real, small corrections; null when the reply was not a list of fixes. */
export function parseFixes(reply: string): readonly Fix[] | null {
  const json = reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)

  return decodeReply(json).pipe(
    Option.map(({ fixes }) => fixes.filter((fix) => fix.wrong !== '' && fix.wrong !== fix.right && fix.wrong.length <= MAX_FIX_CHARS && fix.right.length <= MAX_FIX_CHARS)),
    Option.getOrNull,
  )
}

/** Fenced code blocks, inline code and link targets: what no fix may touch. */
function protectedRanges(text: string): readonly (readonly [number, number])[] {
  const ranges: [number, number][] = []

  for (const match of text.matchAll(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))|`[^`\n]+`|\]\([^)\n]*\)|https?:\/\/\S+/gm)) {
    ranges.push([match.index, match.index + match[0].length])
  }

  return ranges
}

/** Learn only the changed word, never an unchanged neighbour in the proofreader's passage. */
export function spellingForPractice(fix: Fix): { readonly entry: PracticeWord; readonly mistake: string } | null {
  const entry = fix.practice

  if (entry === undefined) return null

  const before = fix.wrong.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? []
  const after = fix.right.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? []

  if (before.length !== after.length) return null

  const changes = after.flatMap((word, index) => word.toLowerCase() === before[index]?.toLowerCase() ? [] : [{ word, mistake: before[index] ?? '' }])
  const change = changes[0]

  if (changes.length !== 1 || change === undefined || change.word.toLowerCase() !== entry.word.trim().toLowerCase()) return null

  return { entry, mistake: change.mistake }
}

/** A text after fixing, and how many places changed. */
interface Fixed {
  readonly text: string
  readonly count: number
}

/** The text with every fix applied wherever its passage occurs outside code, and how many places changed. */
export function applyFixes(text: string, fixes: readonly Fix[], onApplied?: (fix: Fix) => void): Fixed {
  const blocked = protectedRanges(text)
  const swaps: { start: number; end: number; right: string; fix: Fix }[] = []

  for (const fix of fixes) {
    for (let index = text.indexOf(fix.wrong); index !== -1; index = text.indexOf(fix.wrong, index + fix.wrong.length)) {
      const end = index + fix.wrong.length
      const inCode = blocked.some(([from, to]) => index < to && end > from)
      const overlaps = swaps.some((swap) => index < swap.end && end > swap.start)

      if (!inCode && !overlaps) swaps.push({ start: index, end, right: fix.right, fix })
    }
  }

  swaps.sort((a, b) => b.start - a.start)

  for (const swap of swaps) onApplied?.(swap.fix)

  return { text: swaps.reduce((fixed, swap) => fixed.slice(0, swap.start) + swap.right + fixed.slice(swap.end), text), count: swaps.length }
}

/** One edit from the old text to the new, covering only what changed, with the caret kept where it was relative to the text around it. */
export function fixEdit(before: string, after: string, caret: number): TextEdit {
  const shorter = Math.min(before.length, after.length)
  let prefix = 0

  while (prefix < shorter && before[prefix] === after[prefix]) prefix++

  let suffix = 0

  while (suffix < shorter - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++

  const to = before.length - suffix
  const moved = caret <= prefix ? caret : caret >= to ? caret + after.length - before.length : prefix + (after.length - prefix - suffix)

  return { from: prefix, to, insert: after.slice(prefix, after.length - suffix), selectionStart: moved, selectionEnd: moved }
}
