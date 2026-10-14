import { useAtomSet, useAtomValue } from '@effect/atom-react'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import { Check, FilePlus2, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { cn } from 'cn'

import { shortcutLabel } from '../core/shortcuts.ts'
import {
  activeIdAtom,
  createDocumentAtom,
  deleteDocumentAtom,
  documentsAtom,
  openDocumentAtom,
  renameDocumentAtom,
  storageBackendAtom,
  storageProblemAtom,
} from '../features/library/atoms.ts'
import type { DocumentMeta } from '../features/library/model.ts'
import { ToolButton } from './ToolButton.tsx'

const BACKEND_NAME = { opfs: 'OPFS', indexeddb: 'IndexedDB', memory: 'memory' } as const

interface RowProps {
  readonly document: DocumentMeta
  readonly active: boolean
}

function DocumentRow({ document, active }: RowProps) {
  const open = useAtomSet(openDocumentAtom)
  const rename = useAtomSet(renameDocumentAtom)
  const remove = useAtomSet(deleteDocumentAtom)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(document.name)
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (editing) {
      cancelled.current = false
    }

    if (editing) inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!confirming) return

    const timer = window.setTimeout(() => setConfirming(false), 3000)

    return () => window.clearTimeout(timer)
  }, [confirming])

  const commit = (): void => {
    if (!cancelled.current) rename({ id: document.id, name: draft })

    setEditing(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') commit()

    if (event.key === 'Escape') {
      cancelled.current = true
      setDraft(document.name)
      setEditing(false)
    }
  }

  return (
    <li
      className={cn('group flex items-center gap-1 rounded-md pr-1 text-sm', active ? 'bg-ink/8 text-ink' : 'text-ink-soft hover:bg-ink/5')}
      data-testid={`document-${document.id}`}
      data-active={active}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="min-w-0 flex-1 rounded-md bg-paper px-2 py-1.5 text-sm text-ink outline-2 outline-accent/60"
          aria-label="Document name"
          data-testid="rename-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
      ) : (
        <button type="button" className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left" onClick={() => open(document.id)} onDoubleClick={() => setEditing(true)}>
          {document.name}
        </button>
      )}
      {editing ? null : (
        <span className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-data-[active=true]:opacity-100">
          <ToolButton label="Rename" testId="rename-document" onClick={() => setEditing(true)}>
            <Pencil />
          </ToolButton>
          {confirming ? (
            <ToolButton label="Confirm delete" testId="confirm-delete" onClick={() => remove(document.id)}>
              <Check className="text-pos-verb" />
            </ToolButton>
          ) : (
            <ToolButton label="Delete" testId="delete-document" onClick={() => setConfirming(true)}>
              <Trash2 />
            </ToolButton>
          )}
        </span>
      )}
    </li>
  )
}

interface SidebarProps {
  readonly open: boolean
  readonly isMac: boolean
}

/** The library: every document in the browser, newest first. */
export function Sidebar({ open, isMac }: SidebarProps) {
  const documents = useAtomValue(documentsAtom)
  const activeId = useAtomValue(activeIdAtom)
  const problem = useAtomValue(storageProblemAtom)
  const create = useAtomSet(createDocumentAtom)
  const backend = useAtomValue(storageBackendAtom)

  return (
    <aside
      className={cn('shrink-0 overflow-hidden border-rule bg-panel transition-[width] duration-300 ease-out', open ? 'w-60 border-r' : 'w-0')}
      aria-label="Library"
      data-testid="sidebar"
      data-open={open}
      inert={!open}
    >
      <div className="flex h-full w-60 flex-col">
        <div className="flex h-12 items-center justify-between pr-3 pl-4">
          <h2 className="text-xs font-bold tracking-wider text-ink-faint uppercase">Library</h2>
          <ToolButton label="New document" shortcut={shortcutLabel('newDocument', isMac)} testId="new-document" onClick={() => create()}>
            <FilePlus2 />
          </ToolButton>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {documents.map((document) => (
            <DocumentRow key={document.id} document={document} active={document.id === activeId} />
          ))}
        </ul>
        {AsyncResult.isSuccess(backend) ? (
          <p className="border-t border-rule px-4 py-3 text-xs text-ink-faint" data-testid="storage-backend">
            Stored in this browser ({BACKEND_NAME[backend.value]})
          </p>
        ) : null}
        {problem === null ? null : (
          <p className="border-t border-rule p-3 text-xs text-pos-verb" role="alert" data-testid="storage-problem">
            Could not save: {problem}
          </p>
        )}
      </div>
    </aside>
  )
}
