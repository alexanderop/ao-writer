/** A picture with a generated destination in the text: `![alt](images/<id>.webp)`, from the `!` to the closing parenthesis. */
export interface PictureRef {
  readonly id: string
  readonly start: number
  readonly end: number
}

/** What is known of one picture Codex draws or drew in this session. */
interface JobBase {
  readonly id: string
  readonly prompt: string
  readonly startedAt: number
}

export type IllustrationJob =
  | (JobBase & { readonly state: 'drawing' })
  | (JobBase & { readonly state: 'done'; readonly finishedAt: number })
  // `at` is where the withdrawn placeholder stood, null when the text was not there to show it
  | (JobBase & { readonly state: 'failed'; readonly finishedAt: number; readonly reason: string; readonly at: number | null })

/** A finished card stays on a narrow screen this long, then steps out of the text's way. */
const RECENT_MS = 6_000

/** A failure note stays this long. */
export const FAILED_MS = 6_000

/** Every `images/<id>.webp` picture in the text, in order. */
export function findPictures(text: string): PictureRef[] {
  return [...text.matchAll(/!\[[^\]\n]*\]\(images\/([\w-]+)\.webp\)/g)].map((match) => ({ id: match[1] ?? '', start: match.index, end: match.index + match[0].length }))
}

/** "7s" under a minute, "1m 05s" after. */
export function elapsedLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))

  if (seconds < 60) return `${seconds}s`

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** Whether a job still needs the clock: it is drawing, or a card it left is about to leave. */
export function isLive(job: IllustrationJob, now: number): boolean {
  if (job.state === 'drawing') return true

  return now - job.finishedAt < Math.max(RECENT_MS, FAILED_MS)
}

/**
Whether the card of a picture shows. With room in the margin every card does. Without it a card is an overlay that covers
the text under its line, so it shows only while drawing, shortly after, and while the caret is on the picture's line.
*/
export function cardShows(job: IllustrationJob | undefined, now: number, inMargin: boolean, caretOnLine: boolean): boolean {
  if (inMargin || caretOnLine) return true

  if (job === undefined) return false

  return job.state === 'drawing' || (job.state === 'done' && now - job.finishedAt < RECENT_MS)
}
