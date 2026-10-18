import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react'

import { continueList } from '../core/markdown/format.ts'
import type { Segment } from '../core/editor/annotate.ts'
import { charLength, clampNormal } from '../core/vim/lines.ts'
import { initialVimState, isVisual } from '../core/vim/state.ts'
import type { VimState } from '../core/vim/state.ts'
import { cursorOf } from '../core/vim/vim.ts'
import { caretAtom, segmentsAtom, selectionAtom, textAtom, typingAtom, vimAtom } from '../features/editor/atoms.ts'
import { activeIdAtom, autosaveAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { typewriterActive } from '../features/settings/settings.ts'
import { CoachMarks } from './Coach.tsx'
import { StyleSuggestions } from './StyleSuggestions.tsx'
import { applyEdit, editorInputAtom } from './editor-input.ts'
import { IllustratePrompt } from './IllustratePrompt.tsx'
import { IllustrationCards } from './IllustrationCards.tsx'
import { useCaretScroll } from './useCaretScroll.ts'
import { runVimKey } from './vim-input.ts'
import { visualRows } from './vim-rows.ts'
import { selectionRows } from './vim-selection.ts'
import type { BandRow } from './vim-selection.ts'

type ToneStyle = CSSProperties & { '--tok-light': string; '--tok-dark': string }

/** The syntax colours of a code token as the two CSS variables the stylesheet picks from by theme. */
function toneStyle(segment: Segment): ToneStyle | undefined {
  const tone = segment.tone

  if (tone === undefined) return undefined

  return { '--tok-light': tone.light ?? 'var(--ink)', '--tok-dark': tone.dark ?? 'var(--ink)' }
}

/** A segment's text with the block cursor cut out of it: the character under the cursor, or a one-cell block at a line end. */
function cursorNodes(text: string, segment: Segment, index: number, cursor: number): ReactNode[] {
  const className = segment.className === '' ? undefined : segment.className
  const style = toneStyle(segment)
  const char = text.slice(cursor, cursor + charLength(text, cursor))
  const after = text.slice(cursor + char.length, segment.end)

  return [
    <span key={`${index}-before`} className={className} style={style}>
      {text.slice(segment.start, cursor)}
    </span>,
    char === '' ? (
      <span key={`${index}-cursor`} className="vim-cursor vim-cursor-eol" data-testid="vim-cursor" />
    ) : (
      <span key={`${index}-cursor`} className={className === undefined ? 'vim-cursor' : `${className} vim-cursor`} style={style} data-testid="vim-cursor">
        {char}
      </span>
    ),
    <span key={`${index}-after`} className={className} style={style}>
      {after}
    </span>,
  ]
}

function renderSegments(text: string, segments: readonly Segment[], caret: number, cursor: number | null, markerRef: { current: HTMLSpanElement | null }): ReactNode[] {
  const nodes: ReactNode[] = []
  let placed = false

  const marker = (
    <span
      key="caret"
      data-testid="caret-marker"
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

    if (cursor !== null && cursor >= segment.start && cursor < segment.end) {
      nodes.push(...cursorNodes(text, segment, index, cursor))

      return
    }

    nodes.push(
      <span key={index} className={segment.className === '' ? undefined : segment.className} style={toneStyle(segment)}>
        {text.slice(segment.start, segment.end)}
      </span>,
    )
  })

  if (!placed) nodes.push(marker)

  // a cursor behind the last character (an empty last line) has no segment to cut it out of
  if (cursor !== null && cursor >= text.length) nodes.push(<span key="vim-end" className="vim-cursor vim-cursor-eol" data-testid="vim-cursor" />)

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
  const caret = useAtomValue(caretAtom)
  const vim = useAtomValue(vimAtom)
  const setText = useAtomSet(textAtom)
  const setSelectionAtom = useAtomSet(selectionAtom)
  const setTyping = useAtomSet(typingAtom)
  const setInput = useAtomSet(editorInputAtom)
  const setVim = useAtomSet(vimAtom)
  const autosave = useAtomSet(autosaveAtom)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const markerRef = useRef<HTMLSpanElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const vimRef = useRef<VimState>(initialVimState)
  const lastSelection = useRef({ start: 0, end: 0 })
  const [band, setBand] = useState<readonly BandRow[]>([])

  // publish the selection only when it changed, so a caret that did not move does not repaint the layer
  const setSelection = useCallback(
    (next: { start: number; end: number }): void => {
      if (next.start === lastSelection.current.start && next.end === lastSelection.current.end) return

      lastSelection.current = next
      setSelectionAtom(next)
    },
    [setSelectionAtom],
  )

  // the ref is what the next key reads, the atom is what the status bar and the cursor draw
  const commitVim = useCallback(
    (next: VimState): void => {
      vimRef.current = next
      setVim(next)
    },
    [setVim],
  )

  // follow every selection change, including the ones made from code (format actions, document switches)
  useEffect(() => {
    const onSelectionChange = (): void => {
      const input = inputRef.current

      if (!input || document.activeElement !== input) return

      // a click can land behind the last character of a line, where normal mode has no cursor
      if (settings.vim && vimRef.current.mode === 'normal' && input.selectionStart === input.selectionEnd) {
        const caret = clampNormal(input.value, input.selectionStart)

        if (caret !== input.selectionStart) {
          input.setSelectionRange(caret, caret)

          return
        }
      }

      setSelection({ start: input.selectionStart, end: input.selectionEnd })
    }

    document.addEventListener('selectionchange', onSelectionChange)

    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [setSelection, settings.vim])

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

  // a new document, and switching Vim on, start in normal mode
  useEffect(() => {
    const input = inputRef.current

    commitVim(initialVimState)

    if (settings.vim && input) {
      const caret = clampNormal(input.value, input.selectionStart)

      input.setSelectionRange(caret, caret)
      setSelection({ start: caret, end: caret })
    }
  }, [activeId, settings.vim, commitVim, setSelection])

  // keep the caret in view; typewriter mode, and focus mode with it, keeps it in the middle
  const typewriter = typewriterActive(settings)

  useCaretScroll(scrollRef, inputRef, markerRef, highlightRef, typewriter, segments)

  // linewise visual mode paints its own band of full-width rows behind the text; it follows the layer's wrapping
  const measureBand = useCallback((): void => {
    const layer = highlightRef.current
    const input = inputRef.current
    const next = layer && input && vimRef.current.mode === 'visual-line' ? selectionRows(layer, { start: input.selectionStart, end: input.selectionEnd }) : []

    setBand((current) => (current.length === 0 && next.length === 0 ? current : next))
  }, [])

  // after the commit, so the layer holds the text and the cursor the selection is measured against
  useLayoutEffect(measureBand, [measureBand, text, selection, vim, segments])

  useEffect(() => {
    const layer = highlightRef.current

    if (!layer) return

    const observer = new ResizeObserver(measureBand)

    observer.observe(layer)

    return () => observer.disconnect()
  }, [measureBand])

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const { value, selectionStart, selectionEnd } = event.target

    setText(value)
    setSelection({ start: selectionStart, end: selectionEnd })

    // edits made by Vim commands are not typing, so the chrome and its mode label stay
    if (!settings.vim || vimRef.current.mode === 'insert') setTyping(true)

    if (activeId !== null) autosave({ id: activeId, text: value })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const input = event.currentTarget

    if (settings.vim && !event.nativeEvent.isComposing && !event.defaultPrevented && highlightRef.current) {
      const next = runVimKey(input, event, vimRef.current, visualRows(highlightRef.current, input.value))

      if (next !== null) {
        event.preventDefault()
        commitVim(next)
        setSelection({ start: input.selectionStart, end: input.selectionEnd })

        return
      }
    }

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

    // a click moves the caret on its own, which ends a visual selection
    if (isVisual(vimRef.current.mode)) commitVim({ ...initialVimState, register: vimRef.current.register, lastFind: vimRef.current.lastFind })

    if (!input || event.target === input) return

    // leave the scrollbar alone
    if (event.clientX > scroller.getBoundingClientRect().left + scroller.clientWidth) return

    event.preventDefault()
    input.focus()

    const textBottom = input.getBoundingClientRect().bottom

    if (event.clientY > textBottom) input.setSelectionRange(input.value.length, input.value.length)

    setSelection({ start: input.selectionStart, end: input.selectionEnd })
  }


  const vimCursor = settings.vim && vim.mode !== 'insert' ? cursorOf(vim, text, selection) : null

  return (
    <div ref={scrollRef} className="editor-scroll h-full overflow-y-auto" data-testid="editor-scroll" onMouseDown={onPageMouseDown}>
      <div className="editor-column" data-typewriter={typewriter} data-testid="editor-column">
        <div className="editor-stack">
          {band.map((row) => (
            <div key={row.center} className="vim-band" style={{ top: row.center - row.height / 2, height: row.height }} aria-hidden data-testid="vim-band" />
          ))}
          <div ref={highlightRef} className="editor-highlight" aria-hidden data-testid="highlight">
            {renderSegments(text, segments, caret, vimCursor, markerRef)}
            {'​'}
          </div>
          <textarea
            ref={inputRef}
            className="editor-input"
            data-editor-input
            data-vim={vimCursor === null ? undefined : vim.mode === 'visual-line' ? 'line' : 'block'}
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
          <StyleSuggestions layerRef={highlightRef} />
          <CoachMarks layerRef={highlightRef} />
          <IllustrationCards layerRef={highlightRef} />
          <IllustratePrompt layerRef={highlightRef} />
        </div>
      </div>
    </div>
  )
}
