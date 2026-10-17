import { useAtomValue } from '@effect/atom-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { previewHtmlAtom } from '../features/editor/atoms.ts'
import { imageName, imagesVersionAtom, readImage } from '../features/illustrate/images.ts'

/** A transparent pixel: a picture that is not stored yet shows this, under the pulsing block the stylesheet makes of it. */
const PENDING_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

/** Points each `images/<id>.webp` picture of the rendered HTML at its stored file; the object URLs are kept while the preview lives. A picture still being drawn waits as a placeholder and is picked up once stored. */
function useStoredImages(articleRef: RefObject<HTMLElement | null>, html: string): void {
  const urls = useRef(new Map<string, string>())
  const stored = useAtomValue(imagesVersionAtom)

  useEffect(() => {
    const known = urls.current

    return () => {
      for (const url of known.values()) URL.revokeObjectURL(url)

      known.clear()
    }
  }, [])

  useLayoutEffect(() => {
    for (const image of articleRef.current?.querySelectorAll('img') ?? []) {
      const name = image.dataset.stored ?? imageName(image.getAttribute('src') ?? '')

      if (name === null) continue

      image.dataset.stored = name

      const known = urls.current.get(name)

      if (known !== undefined) {
        image.src = known
        delete image.dataset.pending

        continue
      }

      image.dataset.pending = ''
      image.src = PENDING_SRC

      void readImage(name).then((blob) => {
        if (blob === null || !image.isConnected) return

        const url = urls.current.get(name) ?? URL.createObjectURL(blob)

        urls.current.set(name, url)
        image.src = url
        delete image.dataset.pending
      })
    }
  }, [articleRef, html, stored])
}

/** The rendered Markdown. The renderer escapes all HTML, so the string is safe to inject. */
export function Preview() {
  const html = useAtomValue(previewHtmlAtom)
  const articleRef = useRef<HTMLElement>(null)

  useStoredImages(articleRef, html)

  return (
    <div className="h-full overflow-y-auto" data-testid="preview">
      <div className="mx-auto w-[min(100%-4rem,64ch)] pt-28 pb-[40vh]">
        <article ref={articleRef} className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
