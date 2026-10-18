import { useEffect } from 'react'

import { findAction, isFormatAction } from '../core/shortcuts.ts'
import type { ActionId } from '../core/shortcuts.ts'

/**
Listens for the app's shortcuts on the whole window. The listener runs in the capture phase and prevents the default, which stops the browser's own Cmd+D (bookmark) and Cmd+R (reload) where it allows that.
Format shortcuts only fire while the editor has focus, so typing in the rename field is not hijacked.
`vimCommands` is true while the editor is in Vim's normal or visual mode, where Ctrl+R is redo and so does not toggle the preview.
*/
export function useShortcuts(isMac: boolean, run: (id: ActionId) => void, vimCommands: boolean, learning = false): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return

      const action = findAction(event, isMac)

      if (action === null) return

      if (learning && action !== 'library' && action !== 'theme') return

      const inEditor = event.target instanceof HTMLElement && event.target.matches('[data-editor-input]')

      if (isFormatAction(action) && !inEditor) return

      // Ctrl+R is the preview only where Ctrl is the main modifier
      if (action === 'preview' && !isMac && vimCommands && inEditor) return

      event.preventDefault()
      run(action)
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isMac, run, vimCommands, learning])
}
