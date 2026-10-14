import { Keyboard } from 'lucide-react'

import { SHORTCUTS, shortcutLabel } from '../core/shortcuts.ts'
import { Button } from '#/shared/ui/button'
import { Kbd } from '#/shared/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '#/shared/ui/popover'

/** The Vim keys that work when Vim keybindings are on in the options. */
const VIM_KEYS: readonly { readonly label: string; readonly keys: string }[] = [
  { label: 'Move', keys: 'h j k l' },
  { label: 'Words', keys: 'w b e' },
  { label: 'Line start / first / end', keys: '0 ^ $' },
  { label: 'Top / bottom, line', keys: 'gg G' },
  { label: 'Delete / change / yank', keys: 'd c y' },
  { label: 'Whole line', keys: 'dd cc yy' },
  { label: 'Delete character, paste', keys: 'x p P' },
  { label: 'Insert', keys: 'i a I A o O' },
  { label: 'Select characters', keys: 'v' },
  { label: 'Undo / redo', keys: 'u Ctrl+R' },
  { label: 'Back to normal mode', keys: 'Esc' },
]

/** Every shortcut in one list, for the writer who forgets one. */
export function ShortcutsMenu({ isMac }: { isMac: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts" data-testid="shortcuts">
          <Keyboard />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" data-testid="shortcuts-menu">
        <h3 className="mb-2 text-[11px] font-bold tracking-wider text-ink-faint uppercase">Keyboard shortcuts</h3>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-soft">{shortcut.label}</span>
              <Kbd>{shortcutLabel(shortcut.id, isMac)}</Kbd>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 mb-2 text-[11px] font-bold tracking-wider text-ink-faint uppercase">Vim keybindings</h3>
        <ul className="space-y-1.5" data-testid="vim-keys">
          {VIM_KEYS.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-soft">{row.label}</span>
              <Kbd>{row.keys}</Kbd>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
