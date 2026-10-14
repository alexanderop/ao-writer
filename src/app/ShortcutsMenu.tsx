import { Keyboard } from 'lucide-react'

import { SHORTCUTS, shortcutLabel } from '../core/shortcuts.ts'
import { Button } from '#/shared/ui/button'
import { Kbd } from '#/shared/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '#/shared/ui/popover'

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
      </PopoverContent>
    </Popover>
  )
}
