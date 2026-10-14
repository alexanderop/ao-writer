import { useAtom, useAtomValue } from '@effect/atom-react'
import { Eye, Focus, Moon, Palette, SpellCheck } from 'lucide-react'

import { formatDuration } from '../core/text/counts.ts'
import type { TextCounts } from '../core/text/counts.ts'
import { shortcutLabel } from '../core/shortcuts.ts'
import type { ActionId } from '../core/shortcuts.ts'
import { countsAtom, selectionCountsAtom, vimAtom } from '../features/editor/atoms.ts'
import { saveStatusAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { nextCounter } from '../features/settings/settings.ts'
import type { Settings } from '../features/settings/settings.ts'
import { OptionsMenu } from './OptionsMenu.tsx'
import { ShortcutsMenu } from './ShortcutsMenu.tsx'
import { ToolButton } from './ToolButton.tsx'

function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`
}

/** The counter's text for the chosen mode. */
function counterText(mode: Settings['counter'], counts: TextCounts): string {
  switch (mode) {
    case 'words':
      return plural(counts.words, 'word')
    case 'characters':
      return plural(counts.characters, 'character')
    case 'reading':
      return `${formatDuration(counts.readingSeconds)} read`
    case 'speaking':
      return `${formatDuration(counts.speakingSeconds)} speaking`
  }
}

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving', error: 'Not saved' } as const

interface StatusBarProps {
  readonly isMac: boolean
  readonly run: (id: ActionId) => void
}

/** The counter and the switches for focus, syntax, style, preview and theme. It fades while typing. */
export function StatusBar({ isMac, run }: StatusBarProps) {
  const [settings, setSettings] = useAtom(settingsAtom)
  const counts = useAtomValue(countsAtom)
  const selected = useAtomValue(selectionCountsAtom)
  const saveStatus = useAtomValue(saveStatusAtom)
  const vim = useAtomValue(vimAtom)
  const shown = selected ?? counts
  // the keys Vim is still waiting on, such as 2d3
  const typedKeys = `${vim.operatorCount > 0 ? vim.operatorCount : ''}${vim.pending}${vim.count > 0 ? vim.count : ''}`

  return (
    <footer className="chrome absolute inset-x-0 bottom-0 z-20 flex h-11 items-center justify-between gap-3 bg-gradient-to-t from-paper from-60% to-transparent px-4">
      <div className="flex items-center gap-4 text-xs text-ink-soft">
        <button
          type="button"
          className="rounded-md px-2 py-1 tabular-nums transition-colors hover:bg-ink/6 hover:text-ink"
          title="Click to switch between words, characters, reading time and speaking time"
          data-testid="counter"
          data-mode={settings.counter}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setSettings((current) => ({ ...current, counter: nextCounter(current.counter) }))}
        >
          {counterText(settings.counter, shown)}
          {selected ? ' selected' : ''}
        </button>
        <span className="text-ink-faint" data-testid="save-status" data-state={saveStatus}>
          {SAVE_LABEL[saveStatus]}
        </span>
        {settings.vim ? (
          <span className="font-bold tracking-wider text-ink-faint" data-testid="vim-mode" data-mode={vim.mode}>
            {vim.mode.toUpperCase()}
            {typedKeys === '' ? '' : ` ${typedKeys}`}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-0.5">
        <ToolButton keepFocus label="Focus mode" shortcut={shortcutLabel('focus', isMac)} pressed={settings.focus} testId="toggle-focus" onClick={() => run('focus')}>
          <Focus />
        </ToolButton>
        <ToolButton keepFocus label="Syntax highlight" shortcut={shortcutLabel('syntax', isMac)} pressed={settings.syntax} testId="toggle-syntax" onClick={() => run('syntax')}>
          <Palette />
        </ToolButton>
        <ToolButton keepFocus label="Style check" shortcut={shortcutLabel('style', isMac)} pressed={settings.style} testId="toggle-style" onClick={() => run('style')}>
          <SpellCheck />
        </ToolButton>
        <ToolButton keepFocus label="Preview" shortcut={shortcutLabel('preview', isMac)} pressed={settings.preview} testId="toggle-preview" onClick={() => run('preview')}>
          <Eye />
        </ToolButton>
        <ToolButton keepFocus label="Dark appearance" shortcut={shortcutLabel('theme', isMac)} pressed={settings.theme === 'dark'} testId="toggle-theme" onClick={() => run('theme')}>
          <Moon />
        </ToolButton>
        <OptionsMenu />
        <ShortcutsMenu isMac={isMac} />
      </div>
    </footer>
  )
}
