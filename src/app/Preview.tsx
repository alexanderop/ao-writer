import { useAtomValue } from '@effect/atom-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { previewHtmlAtom } from '../features/editor/atoms.ts'
import { imageName, readImage } from '../features/illustrate/images.ts'

/** Points each `images/<id>.webp` picture of the rendered HTML at its stored file; the object URLs are kept while the preview lives. */
function useStoredImages(articleRef: RefObject<HTMLElement | null>, html: string): void {
  const urls = useRef(new Map<string, string>())

  useEffect(() => {
    const known = urls.current

    return () => {
      for (const url of known.values()) URL.revokeObjectURL(url)

      known.clear()
    }
  }, [])

  useLayoutEffect(() => {
    for (const image of articleRef.current?.querySelectorAll('img') ?? []) {
      const name = imageName(image.getAttribute('src') ?? '')

      if (name === null) continue

      const known = urls.current.get(name)

      if (known !== undefined) {
        image.src = known

        continue
      }

      void readImage(name).then((blob) => {
        if (blob === null || !image.isConnected) return

        const url = urls.current.get(name) ?? URL.createObjectURL(blob)

        urls.current.set(name, url)
        image.src = url
      })
    }
  }, [articleRef, html])
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
