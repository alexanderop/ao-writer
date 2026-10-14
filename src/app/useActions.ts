import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { useCallback, useMemo } from 'react'

import { isFormatAction } from '../core/shortcuts.ts'
import type { ActionId } from '../core/shortcuts.ts'
import { createDocumentAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { resizedFont } from '../features/settings/settings.ts'
import type { Settings } from '../features/settings/settings.ts'
import { editorInputAtom, formatInput } from './editor-input.ts'

/** True on Apple platforms, where Cmd is the main modifier. */
export function useIsMac(): boolean {
  return useMemo(() => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent), [])
}

function toggleView(settings: Settings, id: ActionId): Settings {
  switch (id) {
    case 'focus':
      return { ...settings, focus: !settings.focus }
    case 'syntax':
      return { ...settings, syntax: !settings.syntax }
    case 'style':
      return { ...settings, style: !settings.style }
    case 'preview':
      return { ...settings, preview: !settings.preview }
    case 'previewLayout':
      return { ...settings, preview: true, previewLayout: settings.previewLayout === 'split' ? 'full' : 'split' }
    case 'theme':
      return { ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' }
    case 'biggerText':
      return { ...settings, fontSize: resizedFont(settings.fontSize, 'bigger') }
    case 'smallerText':
      return { ...settings, fontSize: resizedFont(settings.fontSize, 'smaller') }
    case 'normalText':
      return { ...settings, fontSize: resizedFont(settings.fontSize, 'normal') }
    case 'library':
      return { ...settings, sidebar: !settings.sidebar }
    default:
      return settings
  }
}

/** One function that runs any action, from a shortcut or a button. */
export function useActions(): (id: ActionId) => void {
  const setSettings = useAtomSet(settingsAtom)
  const createDocument = useAtomSet(createDocumentAtom)
  const input = useAtomValue(editorInputAtom)

  return useCallback(
    (id: ActionId) => {
      if (isFormatAction(id)) {
        if (input) formatInput(input, id)

        return
      }

      if (id === 'newDocument') {
        createDocument()

        return
      }

      setSettings((settings) => toggleView(settings, id))
    },
    [createDocument, input, setSettings],
  )
}
