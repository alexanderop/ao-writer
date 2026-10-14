import { useEffect } from 'react'

import { findAction, isFormatAction } from '../core/shortcuts.ts'
import type { ActionId } from '../core/shortcuts.ts'

/**
Listens for the app's shortcuts on the whole window. The listener runs in the capture phase and prevents the default, which stops the browser's own Cmd+D (bookmark) and Cmd+R (reload) where it allows that.
Format shortcuts only fire while the editor has focus, so typing in the rename field is not hijacked.
*/
export function useShortcuts(isMac: boolean, run: (id: ActionId) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return

      const action = findAction(event, isMac)

      if (action === null) return

      const inEditor = event.target instanceof HTMLElement && event.target.matches('[data-editor-input]')

      if (isFormatAction(action) && !inEditor) return

      event.preventDefault()
      run(action)
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isMac, run])
}
