/** How long the typewriter glide takes. */
export const SCROLL_MS = 150

/** How long a mouse-made selection settles before the page follows it. */
export const POINTER_DELAY_MS = 150

/** A caret line this close to the middle (as a share of the viewport height) is left where it is. */
const DEAD_ZONE = 0.03

/** Whether the caret line is far enough from the middle to be worth a scroll. `offset` is its centre minus the viewport centre. */
export function shouldScroll(offset: number, viewportHeight: number): boolean {
  return Math.abs(offset) > viewportHeight * DEAD_ZONE
}

/** The scroll position that puts the caret line in the middle, kept inside what the container can scroll. */
export function centredScrollTop(scrollTop: number, offset: number, maxScrollTop: number): number {
  return Math.max(0, Math.min(scrollTop + offset, maxScrollTop))
}

/** Ease-out cubic: fast at the start, settling at the end. */
export function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3
}

/** Where the tween from `from` to `to` is after `elapsed` ms. */
export function tweenValue(from: number, to: number, elapsed: number): number {
  return from + (to - from) * easeOut(Math.max(0, Math.min(elapsed / SCROLL_MS, 1)))
}
