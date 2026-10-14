import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

import type { Segment } from '../core/editor/annotate.ts'
import { POINTER_DELAY_MS, SCROLL_MS, centredScrollTop, shouldScroll, tweenValue } from '../core/editor/typewriter.ts'

/** The space the caret keeps from the top and bottom edge while it scrolls into view. */
const CARET_MARGIN = 96

interface Glide {
  readonly frame: number
  readonly to: number
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
Keeps the caret in view. Without typewriter mode it only scrolls when the caret nears an edge.
With it, the caret line is centred on every selection change: keys scroll at once, a mouse-made selection settles for
150 ms first (and waits for the button to come up), and the move is a 150 ms ease-out glide that a newer move retargets.
`segments` change whenever the caret may have moved.
*/
export function useCaretScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  inputRef: RefObject<HTMLTextAreaElement | null>,
  markerRef: RefObject<HTMLSpanElement | null>,
  layerRef: RefObject<HTMLDivElement | null>,
  typewriter: boolean,
  segments: readonly Segment[],
): void {
  const glide = useRef<Glide | null>(null)
  const delay = useRef<number | null>(null)
  const fromPointer = useRef(false)
  const buttonDown = useRef(false)
  const waitingForButton = useRef(false)

  const stopGlide = (): void => {
    if (glide.current !== null) cancelAnimationFrame(glide.current.frame)

    glide.current = null
  }

  const stopDelay = (): void => {
    if (delay.current !== null) window.clearTimeout(delay.current)

    delay.current = null
  }

  const glideTo = (scroller: HTMLDivElement, to: number): void => {
    if (glide.current !== null && Math.abs(glide.current.to - to) < 1) return

    stopGlide()

    const from = scroller.scrollTop

    if (Math.abs(to - from) < 0.5 || prefersReducedMotion()) {
      scroller.scrollTop = to

      return
    }

    const startedAt = performance.now()

    const step = (now: number): void => {
      const elapsed = now - startedAt
      const done = elapsed >= SCROLL_MS

      scroller.scrollTop = done ? to : tweenValue(from, to, elapsed)
      glide.current = done ? null : { frame: requestAnimationFrame(step), to }
    }

    glide.current = { frame: requestAnimationFrame(step), to }
  }

  // the caret line's centre against the viewport's, read now: the layer holds the text, the marker sits at the caret
  const centre = (): void => {
    const scroller = scrollRef.current
    const marker = markerRef.current

    if (!scroller || !marker || document.activeElement !== inputRef.current) return

    const view = scroller.getBoundingClientRect()
    const caret = marker.getBoundingClientRect()
    const offset = caret.top + caret.height / 2 - view.top - scroller.clientHeight / 2

    // a glide in flight moves the line through the dead zone on its way, so it always retargets rather than stops
    if (glide.current === null && !shouldScroll(offset, scroller.clientHeight)) return

    glideTo(scroller, centredScrollTop(scroller.scrollTop, offset, scroller.scrollHeight - scroller.clientHeight))
  }

  const centreAfterDelay = (): void => {
    stopDelay()
    delay.current = window.setTimeout(() => {
      delay.current = null
      centre()
    }, POINTER_DELAY_MS)
  }

  const keepInView = (): void => {
    const scroller = scrollRef.current
    const marker = markerRef.current

    if (!scroller || !marker || document.activeElement !== inputRef.current) return

    const view = scroller.getBoundingClientRect()
    const caret = marker.getBoundingClientRect()

    if (caret.bottom > view.bottom - CARET_MARGIN) {
      scroller.scrollTop += caret.bottom - (view.bottom - CARET_MARGIN)
    } else if (caret.top < view.top + CARET_MARGIN) {
      scroller.scrollTop -= view.top + CARET_MARGIN - caret.top
    }
  }

  // the refs and closures above are stable in effect, so the layout effect reads them through this ref
  const latest = useRef({ centre, centreAfterDelay, keepInView, stopDelay, stopGlide })

  latest.current = { centre, centreAfterDelay, keepInView, stopDelay, stopGlide }

  useLayoutEffect(() => {
    const { centre: centreNow, centreAfterDelay: centreLater, keepInView: keepNow, stopDelay: clearDelay, stopGlide: clearGlide } = latest.current

    clearDelay()

    if (!typewriter) {
      clearGlide()
      keepNow()

      return
    }

    if (!fromPointer.current) {
      centreNow()
    } else if (buttonDown.current) {
      waitingForButton.current = true
    } else {
      centreLater()
    }
  }, [segments, typewriter])

  // who made the selection change: the last thing the writer did was a key or a mouse press
  useEffect(() => {
    const scroller = scrollRef.current
    const input = inputRef.current

    if (!scroller || !input) return

    const onKey = (): void => {
      fromPointer.current = false
      buttonDown.current = false
      waitingForButton.current = false
    }

    const onMouseDown = (event: MouseEvent): void => {
      // the scrollbar is not a selection
      if (event.clientX > scroller.getBoundingClientRect().left + scroller.clientWidth) return

      fromPointer.current = true
      buttonDown.current = true
    }

    const onMouseUp = (): void => {
      buttonDown.current = false

      if (!waitingForButton.current) return

      waitingForButton.current = false
      latest.current.centreAfterDelay()
    }

    // a wheel or touch scroll belongs to the writer; a blur may be a document switch that resets the scroll itself
    const onUserScroll = (): void => latest.current.stopGlide()

    input.addEventListener('keydown', onKey)
    input.addEventListener('beforeinput', onKey)
    scroller.addEventListener('mousedown', onMouseDown)
    scroller.addEventListener('wheel', onUserScroll, { passive: true })
    scroller.addEventListener('touchstart', onUserScroll, { passive: true })
    input.addEventListener('blur', onUserScroll)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      input.removeEventListener('keydown', onKey)
      input.removeEventListener('beforeinput', onKey)
      scroller.removeEventListener('mousedown', onMouseDown)
      scroller.removeEventListener('wheel', onUserScroll)
      scroller.removeEventListener('touchstart', onUserScroll)
      input.removeEventListener('blur', onUserScroll)
      window.removeEventListener('mouseup', onMouseUp)
      latest.current.stopDelay()
      latest.current.stopGlide()
    }
  }, [scrollRef, inputRef])

  // a resize (window, split view, text size) or a re-wrap moves the caret line without touching the selection
  useEffect(() => {
    const scroller = scrollRef.current
    const layer = layerRef.current

    if (!scroller || !layer || !typewriter) return

    const observer = new ResizeObserver(() => {
      if (delay.current === null && !buttonDown.current) latest.current.centre()
    })

    observer.observe(scroller)
    observer.observe(layer)

    return () => observer.disconnect()
  }, [scrollRef, layerRef, typewriter])
}
