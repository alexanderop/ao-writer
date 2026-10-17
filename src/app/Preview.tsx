import { useAtomValue } from '@effect/atom-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'

import { previewHtmlAtom } from '../features/editor/atoms.ts'
import { illustrationJobsAtom } from '../features/illustrate/atoms.ts'
import { imageName, imagesVersionAtom, readImage } from '../features/illustrate/images.ts'
import { PictureCaption, PictureSkeleton } from './PictureSkeleton.tsx'

/** A transparent pixel: a picture that is not stored yet shows this instead of asking the server for a file that is not there. */
const PENDING_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

/** A picture still being drawn: the element in the article where its skeleton is drawn, and the picture's file name. */
interface Pending {
  readonly host: HTMLElement
  readonly name: string
}

/** Points each `images/<id>.webp` picture of the rendered HTML at its stored file; the object URLs are kept while the preview lives. A picture still being drawn is hidden behind a skeleton (the returned hosts) and picked up once stored. */
function useStoredImages(articleRef: RefObject<HTMLElement | null>, html: string): readonly Pending[] {
  const urls = useRef(new Map<string, string>())
  const hosts = useRef(new Map<HTMLImageElement, HTMLElement>())
  const stored = useAtomValue(imagesVersionAtom)
  const [pending, setPending] = useState<readonly Pending[]>([])

  useEffect(() => {
    const known = urls.current

    return () => {
      for (const url of known.values()) URL.revokeObjectURL(url)

      known.clear()
    }
  }, [])

  useLayoutEffect(() => {
    // the skeleton goes, and the picture fades in once it is decoded, so it arrives at its full size
    const reveal = async (image: HTMLImageElement, url: string): Promise<void> => {
      image.src = url
      await image.decode().catch(() => undefined)

      if (!image.isConnected) return

      const wasPending = image.dataset.pending !== undefined

      delete image.dataset.pending

      if (wasPending) image.classList.add('picture-in')

      hosts.current.get(image)?.remove()
      hosts.current.delete(image)
      setPending((all) => all.filter((entry) => entry.host.isConnected))
    }

    for (const [image, host] of hosts.current) {
      if (image.isConnected) continue

      host.remove()
      hosts.current.delete(image)
    }

    for (const image of articleRef.current?.querySelectorAll('img') ?? []) {
      const name = image.dataset.stored ?? imageName(image.getAttribute('src') ?? '')

      if (name === null) continue

      image.dataset.stored = name

      const known = urls.current.get(name)

      if (known !== undefined) {
        if (image.src !== known) {
          if (image.dataset.pending === undefined) image.src = PENDING_SRC

          void reveal(image, known)
        }

        continue
      }

      if (!hosts.current.has(image)) {
        const host = document.createElement('div')

        host.className = 'picture-pending'
        image.dataset.pending = ''
        image.src = PENDING_SRC
        image.before(host)
        hosts.current.set(image, host)
        setPending((all) => [...all, { host, name }])
      }

      void readImage(name).then((blob) => {
        if (blob === null || !image.isConnected) return

        const url = urls.current.get(name) ?? URL.createObjectURL(blob)

        urls.current.set(name, url)
        void reveal(image, url)
      })
    }

    setPending((all) => all.filter((entry) => entry.host.isConnected))
  }, [articleRef, html, stored])

  return pending
}

/** The rendered Markdown. The renderer escapes all HTML, so the string is safe to inject. */
export function Preview() {
  const html = useAtomValue(previewHtmlAtom)
  const articleRef = useRef<HTMLElement>(null)

  const pending = useStoredImages(articleRef, html)
  const jobs = useAtomValue(illustrationJobsAtom)

  return (
    <div className="h-full overflow-y-auto" data-testid="preview">
      <div className="mx-auto w-[min(100%-4rem,64ch)] pt-28 pb-[40vh]">
        <article ref={articleRef} className="preview" dangerouslySetInnerHTML={{ __html: html }} />
        {pending.map(({ host, name }, index) => {
          const job = jobs[name.replace(/\.webp$/, '')]

          return createPortal(
            <>
              <PictureSkeleton />
              {job?.state === 'drawing' ? <PictureCaption job={job} /> : null}
            </>,
            host,
            `${name}-${index}`,
          )
        })}
      </div>
    </div>
  )
}
