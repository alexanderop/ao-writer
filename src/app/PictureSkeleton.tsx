import { Brush } from 'lucide-react'
import { useEffect, useState } from 'react'

import { elapsedLabel } from '../core/illustrate/cards.ts'
import type { IllustrationJob } from '../core/illustrate/cards.ts'

/** The current time, refreshed every second while `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    setNow(Date.now())

    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [active])

  return now
}

/** The 16:9 stand-in for a picture that is being drawn; the editor card and the preview both show it. */
export function PictureSkeleton() {
  return (
    <div className="picture-skeleton" role="status" aria-label="Drawing a picture" data-testid="picture-skeleton">
      <Brush aria-hidden />
    </div>
  )
}

/** What the picture was asked for and how long Codex has been at it. */
export function PictureCaption({ job }: { job: Extract<IllustrationJob, { state: 'drawing' }> }) {
  const now = useNow(true)

  return (
    <div className="picture-caption">
      <span className="picture-prompt" data-testid="picture-prompt">
        {job.prompt}
      </span>
      <span className="picture-elapsed" data-testid="picture-elapsed">
        Drawing · {elapsedLabel(now - job.startedAt)}
      </span>
    </div>
  )
}
