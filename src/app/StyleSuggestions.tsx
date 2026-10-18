import { Match } from 'effect'
import { useAtomValue } from '@effect/atom-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { suggestionEdit } from '../core/coach/note.ts'
import { checkStyle } from '../core/style/check.ts'
import type { StyleMatch, StyleKind } from '../core/style/check.ts'
import type { StyleSuggestion } from '../core/style/suggestion.ts'
import { textAtom } from '../features/editor/atoms.ts'
import { activeIdAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { askStyleSuggestion } from '../features/style/server.ts'
import { Button } from '../shared/ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../shared/ui/popover.tsx'
import { applyEdit, editorInputAtom } from './editor-input.ts'
import { rangeBoxes, useMeasureOnResize } from './range-boxes.ts'
import type { Box } from './range-boxes.ts'

const LABEL: Record<StyleKind, string> = { filler: 'Filler', cliche: 'Cliché', redundancy: 'Redundancy' }

type Result = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; suggestion: StyleSuggestion & { start: number; end: number } }

function StyleFlag({ match, boxes, text, hovered }: { match: StyleMatch; boxes: readonly Box[]; text: string; hovered: boolean }) {
  const input = useAtomValue(editorInputAtom)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<Result>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [requested, setRequested] = useState(false)
  const inCard = useRef(false)
  const openedByHover = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const cancelTimer = (): void => clearTimeout(timer.current)

  const show = (): void => {
    openedByHover.current = false
    cancelTimer()
    setRequested(true)
    setOpen(true)
  }

  const leave = (): void => {
    cancelTimer()
    timer.current = setTimeout(() => { if (!inCard.current) setOpen(false) }, 400)
  }

  // Observe the whole phrase without placing a hit area over the textarea's selection surface.
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (hovered) {
        openedByHover.current = true
        setRequested(true)
        setOpen(true)
      } else if (!inCard.current) setOpen(false)
    }, hovered ? 500 : 400)

    return () => clearTimeout(timer.current)
  }, [hovered])

  useEffect(() => {
    if (!requested) return

    let current = true

    setResult({ kind: 'loading' })
    void askStyleSuggestion({ data: { text, start: match.start, end: match.end, kind: match.kind } }).then(
      (suggestion) => { if (current) setResult({ kind: 'ready', suggestion }) },
      () => { if (current) setResult({ kind: 'error' }) },
    )

    return () => { current = false }
  }, [requested, attempt, text, match.start, match.end, match.kind])

  const first = boxes[0]

  if (!first) return null

  const apply = (): void => {
    // The complete snapshot must still match, including changes outside the quoted passage.
    if (result.kind !== 'ready' || input === null || input.value !== text) return

    const suggestion = result.suggestion

    openedByHover.current = true
    applyEdit(input, suggestionEdit(suggestion, suggestion.after))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(value) => {
      cancelTimer()
      setOpen(value)

      if (value) {
        openedByHover.current = false
        setRequested(true)
      }
    }}>
      {boxes.map((box, index) => {
        const trigger = (
          <button
            type="button"
            className="style-suggestion-trigger"
            aria-label={`${LABEL[match.kind]} suggestion: ${match.text}`}
            style={{ top: box.top + box.height - 5, left: box.left, width: Math.max(box.width, 8), height: 8 }}
            tabIndex={index === 0 ? 0 : -1}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={show}
          />
        )

        return index === 0 ? <PopoverTrigger key={index} asChild>{trigger}</PopoverTrigger> : <span key={index} onClick={show}>{trigger}</span>
      })}
      <PopoverContent
        align="start"
        side="bottom"
        aria-label="Style coach suggestion"
        onOpenAutoFocus={(event) => { if (openedByHover.current) event.preventDefault() }}
        onCloseAutoFocus={(event) => { if (openedByHover.current) event.preventDefault() }}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseEnter={() => { inCard.current = true; cancelTimer() }}
        onMouseLeave={() => { inCard.current = false; leave() }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-accent">Coach · {LABEL[match.kind]}</p>
          <button type="button" aria-label="Close style suggestion" className="text-xs text-ink-soft" onClick={() => setOpen(false)}>Close</button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">“{match.text}”</p>
        {Match.value(result).pipe(
          Match.when({ kind: 'loading' }, () => <p role="status" className="mt-3 text-sm text-ink-soft">Coach is considering this passage…</p>),
          Match.when({ kind: 'error' }, () => (
            <div className="mt-3 space-y-3">
              <p role="status" className="text-sm text-ink-soft">Could not reach the coach or read its suggestion. Try again with the local server and Claude Code login.</p>
              <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
            </div>
          )),
          Match.when({ kind: 'ready' }, ({ suggestion }) => (
            <div className="mt-3 space-y-3">
              <p className="text-sm leading-relaxed">{suggestion.note}</p>
              {suggestion.after !== suggestion.quote ? (
                <>
                  <div className="space-y-2 rounded-md bg-paper p-3 text-sm">
                    <p className="text-ink-faint line-through">{suggestion.quote}</p>
                    <p>{suggestion.after === '' ? 'Remove this phrase' : suggestion.after}</p>
                  </div>
                  <Button size="sm" onClick={apply}>Apply suggestion</Button>
                </>
              ) : <p className="text-xs text-ink-soft">Keep your wording.</p>}
            </div>
          )),
          Match.exhaustive,
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Phrase geometry supports hover without blocking selection; small underline buttons support touch and keyboard. */
function StyleMarks({ layerRef, text }: { layerRef: RefObject<HTMLDivElement | null>; text: string }) {
  const settings = useAtomValue(settingsAtom)

  const [hovered, setHovered] = useState<number | null>(null)
  const [flags, setFlags] = useState<readonly { match: StyleMatch; boxes: readonly Box[] }[]>([])

  const measure = useCallback((): void => {
    const layer = layerRef.current
    const kinds = new Set<StyleKind>()

    if (settings.fillers) kinds.add('filler')

    if (settings.cliches) kinds.add('cliche')

    if (settings.redundancies) kinds.add('redundancy')

    setFlags(layer === null ? [] : checkStyle(text, kinds).map((match) => ({ match, boxes: rangeBoxes(layer, match.start, match.end) })))
  }, [layerRef, text, settings.fillers, settings.cliches, settings.redundancies, settings.fontSize, settings.typeface])

  useLayoutEffect(measure, [measure])
  useMeasureOnResize(layerRef, measure)

  useEffect(() => {
    const layer = layerRef.current
    const stack = layer?.parentElement

    if (!layer || !stack) return

    const move = (event: PointerEvent): void => {
      if (event.buttons !== 0) {
        setHovered(null)

        return
      }

      const origin = layer.getBoundingClientRect()
      const x = event.clientX - origin.left
      const y = event.clientY - origin.top
      const hit = flags.find(({ boxes }) => boxes.some((box) => x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height + 3))

      setHovered(hit?.match.start ?? null)
    }

    const leave = (): void => setHovered(null)

    stack.addEventListener('pointermove', move)
    stack.addEventListener('pointerleave', leave)

    return () => {
      stack.removeEventListener('pointermove', move)
      stack.removeEventListener('pointerleave', leave)
    }
  }, [layerRef, flags])

  return flags.map(({ match, boxes }) => <StyleFlag key={`${match.start}:${match.end}`} match={match} boxes={boxes} text={text} hovered={hovered === match.start} />)
}

export function StyleSuggestions({ layerRef }: { layerRef: RefObject<HTMLDivElement | null> }) {
  const text = useAtomValue(textAtom)
  const documentId = useAtomValue(activeIdAtom)
  const enabled = useAtomValue(settingsAtom).style

  return enabled ? <StyleMarks key={`${documentId}:${text}`} layerRef={layerRef} text={text} /> : null
}
