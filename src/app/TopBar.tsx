import { useAtomValue } from '@effect/atom-react'
import {
  Bold,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  PanelLeft,
  Quote,
  Strikethrough,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { shortcutLabel } from '../core/shortcuts.ts'
import type { ActionId } from '../core/shortcuts.ts'
import { activeIdAtom, documentsAtom } from '../features/library/atoms.ts'
import { settingsAtom } from '../features/settings/atoms.ts'
import { ToolButton } from './ToolButton.tsx'

interface FormatEntry {
  readonly id: ActionId
  readonly label: string
  readonly icon: ReactNode
}

const FORMAT_GROUPS: readonly (readonly FormatEntry[])[] = [
  [
    { id: 'bold', label: 'Bold', icon: <Bold /> },
    { id: 'italic', label: 'Italic', icon: <Italic /> },
    { id: 'strike', label: 'Strikethrough', icon: <Strikethrough /> },
    { id: 'code', label: 'Code', icon: <Code /> },
    { id: 'codeBlock', label: 'Code block', icon: <FileCode /> },
    { id: 'link', label: 'Link', icon: <Link /> },
  ],
  [
    { id: 'h1', label: 'Heading 1', icon: <Heading1 /> },
    { id: 'h2', label: 'Heading 2', icon: <Heading2 /> },
    { id: 'h3', label: 'Heading 3', icon: <Heading3 /> },
  ],
  [
    { id: 'list', label: 'List', icon: <List /> },
    { id: 'orderedList', label: 'Ordered list', icon: <ListOrdered /> },
    { id: 'taskList', label: 'Task list', icon: <ListTodo /> },
    { id: 'quote', label: 'Blockquote', icon: <Quote /> },
  ],
]

interface TopBarProps {
  readonly isMac: boolean
  readonly run: (id: ActionId) => void
}

/** The library toggle, the document name and the format buttons. It fades while typing. */
export function TopBar({ isMac, run }: TopBarProps) {
  const settings = useAtomValue(settingsAtom)
  const documents = useAtomValue(documentsAtom)
  const activeId = useAtomValue(activeIdAtom)
  const name = documents.find((document) => document.id === activeId)?.name ?? ''

  return (
    <header className="chrome pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-2 bg-gradient-to-b from-paper from-60% to-transparent px-3">
      <div className="pointer-events-auto flex items-center gap-2">
        <ToolButton label="Library" shortcut={shortcutLabel('library', isMac)} pressed={settings.sidebar} testId="sidebar-toggle" onClick={() => run('library')}>
          <PanelLeft />
        </ToolButton>
        <span className="max-w-48 truncate text-xs text-ink-faint" data-testid="document-name">
          {name}
        </span>
      </div>
      <div className="pointer-events-auto ml-auto flex items-center gap-1" role="toolbar" aria-label="Format">
        {FORMAT_GROUPS.map((group, index) => (
          <div key={index} className="flex items-center gap-0.5 border-l border-rule pl-1 first:border-l-0 first:pl-0">
            {group.map((entry) => (
              <ToolButton key={entry.id} label={entry.label} shortcut={shortcutLabel(entry.id, isMac)} keepFocus testId={`format-${entry.id}`} onClick={() => run(entry.id)}>
                {entry.icon}
              </ToolButton>
            ))}
          </div>
        ))}
      </div>
    </header>
  )
}
