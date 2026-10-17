import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react'
import { useEffect, useLayoutEffect, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

import { illustrateDescriptionAtom, illustratePromptAtom } from '../features/illustrate/atoms.ts'
import { textAtom } from '../features/editor/atoms.ts'
import { activeIdAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { editorInputAtom } from './editor-input.ts'
import { rangeBoxes } from './Coach.tsx'

/** A one-line box under the caret's line where the writer describes a picture; Enter has Codex draw it there. Lives inside the editor stack. */
export function IllustratePrompt({ layerRef }: { layerRef: RefObject<HTMLDivElement | null> }) {
  const [prompt, setPrompt] = useAtom(illustratePromptAtom)
  const draw = useAtomSet(illustrateDescriptionAtom)
  const text = useAtomValue(textAtom)
  const activeId = useAtomValue(activeIdAtom)
  const fontSize = useAtomValue(settingsAtom).fontSize
  const editor = useAtomValue(editorInputAtom)
  const [top, setTop] = useState<number | null>(null)
  const at = prompt.kind === 'open' ? Math.min(prompt.at, text.length) : null

  // under the line the caret is on; a character of the layer at the caret tells where that line is
  useLayoutEffect(() => {
    const layer = layerRef.current

    if (layer === null || at === null) {
      setTop(null)

      return
    }

    const box = rangeBoxes(layer, at, at + 1)[0] ?? rangeBoxes(layer, Math.max(at - 1, 0), at)[0]

    setTop(box === undefined ? null : box.top + box.height + 6)
  }, [layerRef, at, text, fontSize])

  // a box left open in another document would draw into the wrong place
  useEffect(() => setPrompt({ kind: 'closed' }), [activeId, setPrompt])

  if (prompt.kind === 'closed' || top === null) return null

  const close = (): void => setPrompt({ kind: 'closed' })

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      editor?.focus()
      editor?.setSelectionRange(prompt.at, prompt.at)

      return
    }

    if (event.key !== 'Enter') return

    event.preventDefault()

    const description = event.currentTarget.value.trim()

    if (description === '') return

    close()
    draw({ description, at: prompt.at })
  }

  return (
    <input
      key={prompt.at}
      autoFocus
      type="text"
      className="illustrate-prompt"
      style={{ top }}
      placeholder="Describe a picture…"
      aria-label="Describe a picture"
      data-testid="illustrate-prompt"
      spellCheck={false}
      autoComplete="off"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
      onBlur={close}
    />
  )
}
