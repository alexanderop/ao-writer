import { useAtomValue } from '@effect/atom-react'

import { previewHtmlAtom } from '../features/editor/atoms.ts'

/** The rendered Markdown. The renderer escapes all HTML, so the string is safe to inject. */
export function Preview() {
  const html = useAtomValue(previewHtmlAtom)

  return (
    <div className="h-full overflow-y-auto" data-testid="preview">
      <div className="mx-auto w-[min(100%-4rem,64ch)] pt-28 pb-[40vh]">
        <article className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
