import type { TextRange } from '../core/text/focus.ts'
import { textSpans } from './vim-rows.ts'

/** One row of the selection band: its centre, measured from the top of the highlight layer, and its height (a full line, so rows touch). */
export interface BandRow {
  readonly center: number
  readonly height: number
}

/**
The rows a linewise selection covers, measured on the highlight layer.
The textarea paints a selected line break as a sliver and an empty line as almost nothing, so linewise mode draws its own band.
*/
export function selectionRows(root: HTMLElement, selection: TextRange): BandRow[] {
  const top = root.getBoundingClientRect().top
  const pitch = Number.parseFloat(getComputedStyle(root).lineHeight)
  const rows: BandRow[] = []

  const add = (rect: DOMRect): void => {
    const center = rect.top + rect.height / 2 - top

    // several fragments on one row (styled runs) make one band row
    if (!rows.some((row) => Math.abs(row.center - center) < rect.height / 2)) rows.push({ center, height: Number.isNaN(pitch) ? rect.height : pitch })
  }

  if (selection.end > selection.start) {
    const spans = textSpans(root)
    const first = spans.findLast((span) => span.start <= selection.start)
    const last = spans.findLast((span) => span.start < selection.end)

    if (first !== undefined && last !== undefined) {
      const range = document.createRange()

      range.setStart(first.node, Math.min(selection.start - first.start, first.node.length))
      range.setEnd(last.node, Math.min(selection.end - last.start, last.node.length))

      for (const rect of range.getClientRects()) add(rect)
    }
  }

  // nothing to measure (an empty last line, an empty document): the block cursor stands for the line
  const cursor = root.querySelector('[data-testid="vim-cursor"]')

  if (rows.length === 0 && cursor !== null) add(cursor.getBoundingClientRect())

  return rows
}
