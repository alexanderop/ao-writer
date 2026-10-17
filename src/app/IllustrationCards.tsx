import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { cn } from 'cn'

import { cardShows, FAILED_MS, findPictures, isLive } from '../core/illustrate/cards.ts'
import type { IllustrationJob } from '../core/illustrate/cards.ts'
import { selectionAtom, textAtom } from '../features/editor/atoms.ts'
import { illustrationJobsAtom } from '../features/illustrate/atoms.ts'
import { imagesVersionAtom, readImage } from '../features/illustrate/images.ts'
import { activeIdAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { PictureCaption, PictureSkeleton, useNow } from './PictureSkeleton.tsx'
import { hasMarginRoom, lineBoxAt, rangeBoxes, useMeasureOnResize } from './range-boxes.ts'

/** The picture of a margin card: 14rem wide at 16:9, so the stacking below knows how tall it is. */
const PICTURE_HEIGHT = 126

/** What the caption of a drawing card adds under the picture. */
const CAPTION_HEIGHT = 64

const NOTE_HEIGHT = 44

const STACK_GAP = 10

interface Spec {
  readonly key: string
  readonly id: string
  readonly kind: 'picture' | 'failure'
  /** The characters the card is about: the picture's source, or the one place a withdrawn picture stood. */
  readonly start: number
  readonly end: number
}

interface Anchor {
  readonly top: number
  readonly bottom: number
}

/** The picture stored under the name as an object URL, once it exists; revoked when the card goes. */
function useStoredUrl(name: string): string | null {
  const version = useAtomValue(imagesVersionAtom)
  const made = useRef<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (made.current !== null) return

    let alive = true

    void readImage(name).then((blob) => {
      if (!alive || blob === null || made.current !== null) return

      made.current = URL.createObjectURL(blob)
      setUrl(made.current)
    })

    return () => {
      alive = false
    }
  }, [name, version])

  useEffect(
    () => () => {
      if (made.current !== null) URL.revokeObjectURL(made.current)

      made.current = null
    },
    [name],
  )

  return url
}

/** Brings the picture into view in the preview, opening the preview first when it is closed. */
function useShowInPreview(): (name: string) => void {
  const setSettings = useAtomSet(settingsAtom)

  return useCallback(
    (name: string) => {
      setSettings((settings) => (settings.preview ? settings : { ...settings, preview: true }))
      setTimeout(() => document.querySelector(`[data-testid="preview"] img[data-stored="${name}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
    },
    [setSettings],
  )
}

function PictureCard({ id, job, top, inMargin }: { id: string; job: IllustrationJob | undefined; top: number; inMargin: boolean }) {
  const name = `${id}.webp`
  const url = useStoredUrl(name)
  const show = useShowInPreview()
  const [loaded, setLoaded] = useState(false)
  const drawing = job?.state === 'drawing' ? job : undefined

  // nothing stored and nothing drawing: a picture from somewhere else that is not here
  if (url === null && drawing === undefined) return null

  return (
    <aside
      className={cn('picture-card animate-in fade-in duration-500', inMargin ? 'picture-card-margin' : 'picture-card-below')}
      style={{ top }}
      data-testid="picture-card"
      data-state={loaded ? 'picture' : 'drawing'}
      aria-label="Picture"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="picture-frame" data-loaded={loaded} title="Show in the preview" aria-label="Show the picture in the preview" onClick={() => show(name)}>
        {job === undefined ? null : <PictureSkeleton />}
        {url === null ? null : <img src={url} alt="" draggable={false} data-testid="picture-image" onLoad={() => setLoaded(true)} />}
      </button>
      {drawing === undefined || loaded ? null : <PictureCaption job={drawing} />}
    </aside>
  )
}

/** The pictures of the text beside their lines: a skeleton while Codex draws, then the picture itself. Lives inside the editor stack. */
export function IllustrationCards({ layerRef }: { layerRef: RefObject<HTMLDivElement | null> }) {
  const text = useAtomValue(textAtom)
  const selection = useAtomValue(selectionAtom)
  const jobs = useAtomValue(illustrationJobsAtom)
  const activeId = useAtomValue(activeIdAtom)
  const fontSize = useAtomValue(settingsAtom).fontSize
  const now = useNow(Object.values(jobs).some((job) => isLive(job, Date.now())))
  const [anchors, setAnchors] = useState<Readonly<Record<string, Anchor>>>({})
  const [inMargin, setInMargin] = useState(true)

  const specs = useMemo<Spec[]>(() => {
    // one card per picture, even when the same one stands in the text twice
    const pictures = findPictures(text)
      .filter((picture, index, all) => all.findIndex((other) => other.id === picture.id) === index)
      .map((picture): Spec => ({ key: picture.id, id: picture.id, kind: 'picture', start: picture.start, end: picture.end }))

    const failures = Object.values(jobs).flatMap((job): Spec[] => {
      if (job.state !== 'failed' || job.at === null) return []

      const at = Math.min(job.at, Math.max(text.length - 1, 0))

      return [{ key: `${job.id}-failed`, id: job.id, kind: 'failure', start: at, end: at + 1 }]
    })

    return [...pictures, ...failures]
  }, [text, jobs])

  const measure = useCallback((): void => {
    const layer = layerRef.current

    if (layer === null) return

    const next: Record<string, Anchor> = {}

    for (const spec of specs) {
      const boxes = spec.kind === 'picture' ? rangeBoxes(layer, spec.start, spec.end) : [lineBoxAt(layer, spec.start)].filter((box) => box !== undefined)
      const first = boxes[0]
      const last = boxes.at(-1)

      if (first !== undefined && last !== undefined) next[spec.key] = { top: first.top, bottom: last.top + last.height }
    }

    setAnchors(next)
    setInMargin(hasMarginRoom(layer))
  }, [layerRef, specs])

  useLayoutEffect(measure, [measure, fontSize])

  useMeasureOnResize(layerRef, measure)

  // a card belongs to the document whose text it is anchored in
  useEffect(() => setAnchors({}), [activeId])

  const shown = specs
    .filter((spec) => {
      const job = jobs[spec.id]
      const anchor = anchors[spec.key]

      if (anchor === undefined) return false

      if (spec.kind === 'failure') return job?.state === 'failed' && now - job.finishedAt < FAILED_MS

      return cardShows(job, now, inMargin, selection.start <= spec.end && selection.end >= spec.start)
    })
    .sort((a, b) => (anchors[a.key]?.top ?? 0) - (anchors[b.key]?.top ?? 0))

  // beside the text, neighbouring cards stack instead of overlapping
  let free = 0

  return (
    <>
      {shown.map((spec) => {
        const anchor = anchors[spec.key]

        if (anchor === undefined) return null

        const job = jobs[spec.id]
        const top = inMargin ? Math.max(anchor.top, free) : anchor.bottom + 6

        free = top + (spec.kind === 'failure' ? NOTE_HEIGHT : PICTURE_HEIGHT + (job?.state === 'drawing' ? CAPTION_HEIGHT : 0)) + STACK_GAP

        if (spec.kind === 'failure') {
          return (
            <aside key={spec.key} className={cn('picture-card picture-note animate-in fade-in duration-500', inMargin ? 'picture-card-margin' : 'picture-card-below')} style={{ top }} role="status" data-testid="picture-failed">
              {job?.state === 'failed' ? job.reason : ''}
            </aside>
          )
        }

        return <PictureCard key={spec.id} id={spec.id} job={job} top={top} inMargin={inMargin} />
      })}
    </>
  )
}
