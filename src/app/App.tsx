import { useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react'
import { useEffect } from 'react'
import type { CSSProperties } from 'react'

import { typingAtom, vimAtom } from '../features/editor/atoms.ts'
import { bootAtom, flushAtom, loadedAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { Editor } from './Editor.tsx'
import { Preview } from './Preview.tsx'
import { Sidebar } from './Sidebar.tsx'
import { StatusBar } from './StatusBar.tsx'
import { TopBar } from './TopBar.tsx'
import { useActions, useIsMac } from './useActions.ts'
import { useShortcuts } from './useShortcuts.ts'

/** Mouse movement smaller than this many pixels does not bring the chrome back. */
const MOVE_THRESHOLD = 4

/** Brings the chrome back when the mouse really moves (not when the page shifts under a still mouse). */
function useChromeReturn(): void {
  const setTyping = useAtomSet(typingAtom)

  useEffect(() => {
    let last: { x: number; y: number } | null = null

    const onMove = (event: MouseEvent): void => {
      if (last !== null && Math.abs(event.clientX - last.x) + Math.abs(event.clientY - last.y) > MOVE_THRESHOLD) setTyping(false)

      last = { x: event.clientX, y: event.clientY }
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setTyping(false)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
    }
  }, [setTyping])
}

/** Writes the open document when the tab hides or closes, instead of waiting for the autosave pause. */
function useFlushOnLeave(): void {
  const flush = useAtomSet(flushAtom)

  useEffect(() => {
    const onHide = (): void => flush()

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])
}

/** The whole app: library, editor, optional preview, and the two bars of chrome. */
export function App() {
  const settings = useAtomValue(settingsAtom)
  const loaded = useAtomValue(loadedAtom)
  const typing = useAtomValue(typingAtom)
  const vim = useAtomValue(vimAtom)
  const isMac = useIsMac()
  const run = useActions()

  useAtomMount(bootAtom)
  useShortcuts(isMac, run, settings.vim && vim.mode !== 'insert')
  useChromeReturn()
  useFlushOnLeave()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark')
  }, [settings.theme])

  const full = settings.preview && settings.previewLayout === 'full'
  const style: CSSProperties & { '--font-size': string } = { '--font-size': `${settings.fontSize}px` }

  return (
    <div className="app relative flex h-screen w-screen overflow-hidden" data-typing={typing} data-typeface={settings.typeface} style={style} data-testid="app">
      <Sidebar open={settings.sidebar} isMac={isMac} />
      <main className="relative flex min-w-0 flex-1">
        <TopBar isMac={isMac} run={run} />
        {loaded ? (
          <div className="flex h-full min-w-0 flex-1">
            {full ? null : (
              <section className="h-full min-w-0 flex-1" aria-label="Editor">
                <Editor />
              </section>
            )}
            {settings.preview ? (
              <section className={full ? 'h-full min-w-0 flex-1' : 'h-full min-w-0 flex-1 border-l border-rule'} aria-label="Preview">
                <Preview />
              </section>
            ) : null}
          </div>
        ) : null}
        <StatusBar isMac={isMac} run={run} />
      </main>
    </div>
  )
}
