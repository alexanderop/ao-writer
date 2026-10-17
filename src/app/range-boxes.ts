import { useEffect } from 'react'
import type { RefObject } from 'react'

/** The margin needs this much room right of the text for a card; with less, the card sits under its passage. */
const MARGIN_WIDTH = 320

export interface Box {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/** The line boxes of a character range in the highlight layer, relative to the layer. */
export function rangeBoxes(layer: HTMLElement, start: number, end: number): Box[] {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let offset = 0
  let started = false

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0

    if (!started && start < offset + length) {
      range.setStart(node, start - offset)
      started = true
    }

    if (started && end <= offset + length) {
      range.setEnd(node, end - offset)
      break
    }

    offset += length
  }

  if (!started) return []

  const origin = layer.getBoundingClientRect()

  return [...range.getClientRects()].map((rect) => ({ top: rect.top - origin.top, left: rect.left - origin.left, width: rect.width, height: rect.height }))
}

/** The box of the line holding the character at `offset` (or the one before it at a text end). */
export function lineBoxAt(layer: HTMLElement, offset: number): Box | undefined {
  return rangeBoxes(layer, offset, offset + 1)[0] ?? rangeBoxes(layer, Math.max(offset - 1, 0), offset)[0]
}

/** Whether the editor has room right of the text for a margin card; it measures the editor's own pane, so a preview beside it does not count as room. */
export function hasMarginRoom(layer: HTMLElement): boolean {
  const pane = layer.closest('.editor-scroll') ?? document.documentElement

  return pane.getBoundingClientRect().right - layer.getBoundingClientRect().right >= MARGIN_WIDTH
}

/** Measures again when the window, the text column or the editor's pane changes size; a preview opening beside the editor narrows the pane without a window resize. */
export function useMeasureOnResize(layerRef: RefObject<HTMLElement | null>, measure: () => void): void {
  useEffect(() => {
    const layer = layerRef.current

    if (layer === null) return

    const observer = new ResizeObserver(measure)

    observer.observe(layer)

    const pane = layer.closest('.editor-scroll')

    if (pane !== null) observer.observe(pane)

    return () => observer.disconnect()
  }, [layerRef, measure])
}
