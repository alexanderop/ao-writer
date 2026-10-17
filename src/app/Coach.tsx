import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react'
import { BookOpen, Check, PencilLine, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { cn } from 'cn'

import { locateQuote, suggestionEdit } from '../core/coach/note.ts'
import type { WordOption } from '../core/coach/note.ts'
import { shortcutLabel } from '../core/shortcuts.ts'
import { askCoachAtom, coachNoteAtom, coachPauseAtom, coachStatusAtom, learnWordAtom, leaveDocumentAtom, loadJournalAtom } from '../features/coach/atoms.ts'
import { sentenceRange } from '../core/text/focus.ts'
import { textAtom } from '../features/editor/atoms.ts'
import { activeIdAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { applyEdit, editorInputAtom } from './editor-input.ts'
import { hasMarginRoom, rangeBoxes, useMeasureOnResize } from './range-boxes.ts'
import type { Box } from './range-boxes.ts'

/** An unread note leaves the margin after this long, like a remark the writer let pass. */
const FADE_AFTER_MS = 90_000

/** How long the "handled" acknowledgement stays before the note goes. */
const HANDLED_MS = 2_500

/** The header of each kind of note. */
const KIND = {
  nudge: { icon: PencilLine, label: 'Coach' },
  praise: { icon: Check, label: 'Coach' },
  word: { icon: BookOpen, label: 'Word' },
} as const

/** Asks the coach after each pause in writing, while the coach is set to do that; updates the writer profile when the writer leaves a document. */
export function useCoach(): void {
  const text = useAtomValue(textAtom)
  const mode = useAtomValue(settingsAtom).coach
  const activeId = useAtomValue(activeIdAtom)
  const pause = useAtomSet(coachPauseAtom)
  const leave = useAtomSet(leaveDocumentAtom)
  const loadJournal = useAtomSet(loadJournalAtom)
  const previousId = useRef<string | null>(null)

  useEffect(() => {
    if (mode !== 'off') loadJournal()
  }, [mode, loadJournal])

  useEffect(() => {
    if (mode === 'pause') pause()
  }, [text, mode, pause])

  useEffect(() => {
    if (previousId.current !== null && previousId.current !== activeId && mode !== 'off') leave(previousId.current)

    previousId.current = activeId
  }, [activeId, mode, leave])
}

/** Today as YYYY-MM-DD in the writer's own time zone. */
function today(): string {
  return new Date().toLocaleDateString('sv')
}

/** The coach's state as a small dot under the top bar; a click asks for a note now. */
export function CoachDot({ isMac }: { isMac: boolean }) {
  const mode = useAtomValue(settingsAtom).coach
  const status = useAtomValue(coachStatusAtom)
  const note = useAtomValue(coachNoteAtom)
  const activeId = useAtomValue(activeIdAtom)
  const ask = useAtomSet(askCoachAtom)

  if (mode === 'off') return null

  const hasNote = note !== null && note.documentId === activeId
  const state = status === 'thinking' ? 'thinking' : status === 'offline' ? 'offline' : hasNote ? 'note' : 'idle'

  const title = {
    idle: `Coach is listening. Ask now (${shortcutLabel('coach', isMac)})`,
    thinking: 'Coach is reading your draft',
    note: 'Coach left a note in the margin',
    offline: 'Coach is out of reach: it needs the local dev server (pnpm dev) and a Claude Code login. Click to try again.',
  }[state]

  return (
    <button
      type="button"
      className="coach-dot absolute top-14 right-5 z-10 grid size-6 place-items-center rounded-full"
      data-state={state}
      data-testid="coach-dot"
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => ask()}
    >
      <span />
    </button>
  )
}

/** The coach's note in the margin, with a pencil underline under the passage it is about. Lives inside the editor stack. */
export function CoachMarks({ layerRef }: { layerRef: RefObject<HTMLDivElement | null> }) {
  const [note, setNote] = useAtom(coachNoteAtom)
  const text = useAtomValue(textAtom)
  const activeId = useAtomValue(activeIdAtom)
  const fontSize = useAtomValue(settingsAtom).fontSize
  const input = useAtomValue(editorInputAtom)
  const [boxes, setBoxes] = useState<readonly Box[]>([])
  const [inMargin, setInMargin] = useState(true)
  const [open, setOpen] = useState<'why' | 'example' | null>(null)
  const [hovered, setHovered] = useState(false)
  const [learned, setLearned] = useState<string | null>(null)
  const learn = useAtomSet(learnWordAtom)
  const shown = note !== null && note.documentId === activeId ? note : null
  const range = shown === null ? null : locateQuote(text, shown.quote, shown.near)
  const handled = shown !== null && range === null

  const measure = useCallback((): void => {
    const layer = layerRef.current

    if (layer === null || range === null) {
      setBoxes([])

      return
    }

    setBoxes(rangeBoxes(layer, range.start, range.end))
    setInMargin(hasMarginRoom(layer))
  }, [layerRef, range?.start, range?.end])

  useLayoutEffect(measure, [measure, text, fontSize])

  useMeasureOnResize(layerRef, measure)

  // a new note starts folded
  useEffect(() => {
    setOpen(null)
    setLearned(null)
  }, [shown?.id])

  // a note the writer let pass leaves on its own; one they acted on says so and goes
  useEffect(() => {
    if (shown === null || (!handled && (hovered || open !== null))) return

    const timer = setTimeout(() => setNote(null), handled ? HANDLED_MS : FADE_AFTER_MS)

    return () => clearTimeout(timer)
  }, [shown, handled, hovered, open, setNote])

  if (shown === null) return null

  const Icon = KIND[shown.kind].icon
  const first = boxes[0]
  const last = boxes.at(-1)
  const top = inMargin ? (first?.top ?? 0) - 4 : (last ? last.top + last.height : 0) + 8

  const apply = (): void => {
    if (input === null || range === null) return

    applyEdit(input, suggestionEdit(range, shown.after))
  }

  // the word goes into the text and into the word book, with the sentence it now stands in
  const takeWord = (option: WordOption): void => {
    if (input === null || range === null) return

    applyEdit(input, suggestionEdit(range, option.replacement))

    const sentence = sentenceRange(input.value, range.start)

    learn({ word: option.word, meaning: option.meaning, insteadOf: shown.weak.trim() === '' ? shown.quote : shown.weak, sentence: input.value.slice(sentence.start, sentence.end).trim(), learned: today() })
    setLearned(option.word)
  }

  return (
    <>
      {boxes.map((box) => (
        <div key={`${box.top}-${box.left}`} className="coach-underline" style={{ top: box.top + box.height - 3, left: box.left, width: box.width }} aria-hidden />
      ))}
      <aside
        key={shown.id}
        className={cn('coach-card animate-in fade-in slide-in-from-right-2 duration-500', inMargin ? 'coach-card-margin' : 'coach-card-below')}
        style={{ top }}
        data-testid="coach-note"
        data-kind={shown.kind}
        aria-label="Coach note"
        onMouseDown={(event) => event.stopPropagation()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <header className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-ink-faint uppercase">
          <Icon className="size-3" />
          {KIND[shown.kind].label}
          <button type="button" className="ml-auto rounded p-0.5 hover:bg-ink/8 hover:text-ink" aria-label="Dismiss note" data-testid="coach-dismiss" onClick={() => setNote(null)}>
            <X className="size-3.5" />
          </button>
        </header>
        {handled ? (
          <p className="coach-text" data-testid="coach-handled">
            {learned === null ? 'Nice, that’s handled.' : `“${learned}” is in your word book now.`}
          </p>
        ) : (
          <>
            <p className="coach-text" data-testid="coach-text">
              {shown.note}
            </p>
            {shown.kind === 'word' ? (
              <ul className="space-y-1" data-testid="coach-words">
                {shown.options.map((option, index) => (
                  <li key={option.word}>
                    <button type="button" className="coach-word" data-testid="coach-word" onClick={() => takeWord(option)}>
                      <span className="font-bold text-ink">{option.word}</span>
                      {index === 0 ? <span className="coach-best">best fit</span> : null}
                      <span className="block text-ink-soft">{option.meaning}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-1">
              <button type="button" className="coach-chip" aria-pressed={open === 'why'} data-testid="coach-why" onClick={() => setOpen(open === 'why' ? null : 'why')}>
                Why?
              </button>
              {shown.kind === 'word' || shown.after.trim() === '' ? null : (
                <button type="button" className="coach-chip" aria-pressed={open === 'example'} data-testid="coach-show" onClick={() => setOpen(open === 'example' ? null : 'example')}>
                  Show me
                </button>
              )}
            </div>
            {open === 'why' ? <p className="text-xs leading-relaxed text-ink-soft">{shown.why}</p> : null}
            {open === 'example' ? (
              <div className="space-y-1.5 text-xs leading-relaxed">
                <p className="text-ink-faint line-through">{shown.quote}</p>
                <p className="text-ink">{shown.after}</p>
                <button type="button" className="coach-chip coach-chip-accent" data-testid="coach-apply" onClick={apply}>
                  Use this
                </button>
              </div>
            ) : null}
          </>
        )}
      </aside>
    </>
  )
}
