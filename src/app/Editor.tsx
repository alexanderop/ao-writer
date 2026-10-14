import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { ChangeEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react'

import { continueList } from '../core/markdown/format.ts'
import type { Segment } from '../core/editor/annotate.ts'
import { segmentsAtom, selectionAtom, textAtom, typingAtom } from '../features/editor/atoms.ts'
import { activeIdAtom, autosaveAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { applyEdit, editorInputAtom } from './editor-input.ts'

/** The space the caret keeps from the top and bottom edge while it scrolls into view. */
const CARET_MARGIN = 96

function renderSegments(text: string, segments: readonly Segment[], caret: number, markerRef: { current: HTMLSpanElement | null }): ReactNode[] {
  const nodes: ReactNode[] = []
  let placed = false

  const marker = (
    <span
      key="caret"
      ref={(element) => {
        markerRef.current = element
      }}
    />
  )

  segments.forEach((segment, index) => {
    if (!placed && segment.start === caret) {
      nodes.push(marker)
      placed = true
    }

    nodes.push(
      <span key={index} className={segment.className === '' ? undefined : segment.className}>
        {text.slice(segment.start, segment.end)}
      </span>,
    )
  })

  if (!placed) nodes.push(marker)

  return nodes
}

/**
The writing surface: a transparent textarea over a highlight layer with identical text metrics.
The textarea owns input, selection, IME and undo; the layer only paints the same text with classes.
*/
export function Editor() {
  const text = useAtomValue(textAtom)
  const segments = useAtomValue(segmentsAtom)
  const settings = useAtomValue(settingsAtom)
  const activeId = useAtomValue(activeIdAtom)
  const selection = useAtomValue(selectionAtom)
  const setText = useAtomSet(textAtom)
  const setSelectionAtom = useAtomSet(selectionAtom)
  const setTyping = useAtomSet(typingAtom)
  const setInput = useAtomSet(editorInputAtom)
  const autosave = useAtomSet(autosaveAtom)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const markerRef = useRef<HTMLSpanElement | null>(null)
  const lastSelection = useRef({ start: 0, end: 0 })

  // publish the selection only when it changed, so a caret that did not move does not repaint the layer
  const setSelection = useCallback(
    (next: { start: number; end: number }): void => {
      if (next.start === lastSelection.current.start && next.end === lastSelection.current.end) return

      lastSelection.current = next
      setSelectionAtom(next)
    },
    [setSelectionAtom],
  )

  // follow every selection change, including the ones made from code (format actions, document switches)
  useEffect(() => {
    const onSelectionChange = (): void => {
      const input = inputRef.current

      if (input && document.activeElement === input) setSelection({ start: input.selectionStart, end: input.selectionEnd })
    }

    document.addEventListener('selectionchange', onSelectionChange)

    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [setSelection])

  useEffect(() => {
    const input = inputRef.current

    setInput(input)
    input?.focus()

    return () => setInput(null)
  }, [setInput])

  // a different document starts at its top
  useEffect(() => {
    inputRef.current?.setSelectionRange(0, 0)
    setSelection({ start: 0, end: 0 })
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeId, setSelection])

  // keep the caret in view; typewriter mode keeps it in the middle
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const marker = markerRef.current

    if (!scroller || !marker || document.activeElement !== inputRef.current) return

    const view = scroller.getBoundingClientRect()
    const caret = marker.getBoundingClientRect()

    if (settings.typewriter) {
      const offset = caret.top + caret.height / 2 - view.top - scroller.clientHeight / 2

      if (Math.abs(offset) > 1) scroller.scrollTop += offset
    } else if (caret.bottom > view.bottom - CARET_MARGIN) {
      scroller.scrollTop += caret.bottom - (view.bottom - CARET_MARGIN)
    } else if (caret.top < view.top + CARET_MARGIN) {
      scroller.scrollTop -= view.top + CARET_MARGIN - caret.top
    }
  }, [segments, settings.typewriter])

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const { value, selectionStart, selectionEnd } = event.target

    setText(value)
    setSelection({ start: selectionStart, end: selectionEnd })
    setTyping(true)

    if (activeId !== null) autosave({ id: activeId, text: value })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const input = event.currentTarget

    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return

    if (input.selectionStart !== input.selectionEnd) return

    const edit = continueList(input.value, input.selectionStart)

    if (edit === null) return

    event.preventDefault()
    applyEdit(input, edit)
  }

  // a click on the empty page around the text still lands in the editor; below the last line it puts the caret at the end
  const onPageMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    const input = inputRef.current

    const scroller = event.currentTarget

    if (!input || event.target === input) return

    // leave the scrollbar alone
    if (event.clientX > scroller.getBoundingClientRect().left + scroller.clientWidth) return

    event.preventDefault()
    input.focus()

    const textBottom = input.getBoundingClientRect().bottom

    if (event.clientY > textBottom) input.setSelectionRange(input.value.length, input.value.length)

    setSelection({ start: input.selectionStart, end: input.selectionEnd })
  }


  return (
    <div ref={scrollRef} className="editor-scroll h-full overflow-y-auto" data-testid="editor-scroll" onMouseDown={onPageMouseDown}>
      <div className="editor-column" data-typewriter={settings.typewriter} data-testid="editor-column">
        <div className="editor-stack">
          <div className="editor-highlight" aria-hidden data-testid="highlight">
            {renderSegments(text, segments, selection.end, markerRef)}
            {'​'}
          </div>
          <textarea
            ref={inputRef}
            className="editor-input"
            data-editor-input
            data-testid="editor"
            aria-label="Document text"
            value={text}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder="Start writing"
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  )
}
