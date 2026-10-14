import type { RowMotion } from '../core/vim/state.ts'

interface TextSpan {
  readonly node: Text
  readonly start: number
}

/** The highlight layer's text nodes with the text offset each one starts at. */
function textSpans(root: HTMLElement): TextSpan[] {
  const spans: TextSpan[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let start = 0

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue

    spans.push({ node, start })
    start += node.length
  }

  return spans
}

interface Box {
  readonly top: number
  readonly left: number
  readonly height: number
}

/** The box of the character at `offset` in the highlight layer, or null when the browser reports none. */
function boxAt(spans: readonly TextSpan[], range: Range, offset: number): Box | null {
  const span = spans.findLast((candidate) => candidate.start <= offset)

  if (span === undefined || offset - span.start >= span.node.length) return null

  range.setStart(span.node, offset - span.start)
  range.setEnd(span.node, offset - span.start + 1)

  const rect = range.getClientRects()[0]

  return rect === undefined ? null : { top: rect.top, left: rect.left, height: rect.height }
}

/**
Moves by wrapped row, the way `gj` and `gk` do: the layer under the textarea wraps exactly like the textarea, so
the box of each character tells which row it is on. The goal x survives rows that are shorter than the column.
*/
export function visualRows(root: HTMLElement, text: string): RowMotion {
  let spans: TextSpan[] | null = null
  const range = document.createRange()

  const box = (offset: number): Box | null => {
    spans ??= textSpans(root)

    return boxAt(spans, range, offset)
  }

  // a low surrogate belongs to the character before it and is not a place the cursor can rest
  const isMidPair = (offset: number): boolean => {
    const unit = text.charCodeAt(offset)
    const before = text.charCodeAt(offset - 1)

    return unit >= 0xdc00 && unit <= 0xdfff && before >= 0xd800 && before <= 0xdbff
  }

  const sameRow = (offset: number, top: number, tolerance: number): boolean => {
    const found = box(offset)

    return found === null || isMidPair(offset) || Math.abs(found.top - top) <= tolerance
  }

  // the offset in a row whose left edge is the last one at or before x; the line break and the end of the text only count on an empty line
  const pick = (first: number, last: number, x: number): number => {
    let best = first

    for (let offset = first + 1; offset <= last; offset += 1) {
      const found = box(offset)

      if (found === null || isMidPair(offset) || offset >= text.length || text[offset] === '\n') continue

      if (found.left > x + 1) break

      best = offset
    }

    return best
  }

  return (pos, direction, goalX) => {
    const here = box(pos)

    if (here === null) return null

    const tolerance = here.height / 2
    const x = goalX ?? here.left

    if (direction === 1) {
      let first = pos + 1

      while (first <= text.length && sameRow(first, here.top, tolerance)) first += 1

      if (first > text.length) return null

      const rowTop = box(first)?.top ?? here.top
      let last = first

      while (last + 1 <= text.length && sameRow(last + 1, rowTop, tolerance)) last += 1

      return { pos: pick(first, last, x), goalX: x }
    }

    let last = pos - 1

    while (last >= 0 && sameRow(last, here.top, tolerance)) last -= 1

    if (last < 0) return null

    const rowTop = box(last)?.top ?? here.top
    let first = last

    while (first - 1 >= 0 && sameRow(first - 1, rowTop, tolerance)) first -= 1

    return { pos: pick(first, last, x), goalX: x }
  }
}
