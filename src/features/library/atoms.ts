import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { textAtom } from '../editor/atoms.ts'
import { settingsAtom } from '../settings/atoms.ts'
import { createDocument, loadLibrary, readDocument, removeDocument, renameDocument, saveDocument, sortDocuments } from './library.ts'
import type { DocumentMeta } from './model.ts'
import { DocumentStorage } from './storage.ts'

const runtime = Atom.runtime(DocumentStorage.layerBrowser)

/** The documents in the sidebar, newest first. */
export const documentsAtom = Atom.make<ReadonlyArray<DocumentMeta>>([]).pipe(Atom.keepAlive)

/** The id of the open document. */
export const activeIdAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

/** Whether the library has been read, so the editor does not flash an empty page. */
export const loadedAtom = Atom.make(false).pipe(Atom.keepAlive)

/** Where the last save stands. */
export const saveStatusAtom = Atom.make<'saved' | 'saving' | 'error'>('saved').pipe(Atom.keepAlive)

/** The last storage failure, shown in the sidebar. */
export const storageProblemAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

/** Which browser storage holds the documents, for the sidebar footer. */
export const storageBackendAtom = runtime.atom(
  Effect.gen(function* () {
    const storage = yield* DocumentStorage

    return storage.backend
  }),
)

/** The wait after the last keystroke before the text is written. */
const AUTOSAVE_DELAY = '500 millis'

const persist = Effect.fnUntraced(function* (id: string, text: string) {
  const registry = yield* AtomRegistry
  const meta = registry.get(documentsAtom).find((candidate) => candidate.id === id)

  if (!meta) return

  const updated = yield* saveDocument(meta, text)

  registry.set(documentsAtom, sortDocuments(registry.get(documentsAtom).map((candidate) => (candidate.id === id ? updated : candidate))))
})

const flushActive = Effect.fnUntraced(function* () {
  const registry = yield* AtomRegistry
  const id = registry.get(activeIdAtom)

  if (id !== null) yield* persist(id, registry.get(textAtom))
})

const show = Effect.fnUntraced(function* (meta: DocumentMeta, text: string) {
  const registry = yield* AtomRegistry

  registry.set(activeIdAtom, meta.id)
  registry.set(textAtom, text)
  registry.set(settingsAtom, { ...registry.get(settingsAtom), lastDocument: meta.id })
})

const reportProblem = Effect.fnUntraced(function* (message: string) {
  const registry = yield* AtomRegistry

  registry.set(storageProblemAtom, message)
  registry.set(saveStatusAtom, 'error')
})

/** Reads the library on start-up and opens the last document. A storage failure leaves a writable, unsaved page. */
export const bootAtom = runtime.atom(
  Effect.gen(function* () {
    const registry = yield* AtomRegistry
    const documents = yield* loadLibrary
    const last = registry.get(settingsAtom).lastDocument
    const first = documents.find((candidate) => candidate.id === last) ?? documents[0]

    registry.set(documentsAtom, documents)

    if (first) yield* show(first, yield* readDocument(first.id))
  }).pipe(
    Effect.catchTag('StorageError', (error) => reportProblem(error.message)),
    Effect.ensuring(
      Effect.gen(function* () {
        const registry = yield* AtomRegistry

        registry.set(loadedAtom, true)
      }),
    ),
  ),
).pipe(Atom.keepAlive)

/** Saves the open document after a pause in typing; a newer call replaces the one still waiting. */
export const autosaveAtom = runtime.fn<{ id: string; text: string }>()(
  Effect.fnUntraced(function* ({ id, text }) {
    const registry = yield* AtomRegistry

    registry.set(saveStatusAtom, 'saving')
    yield* Effect.sleep(AUTOSAVE_DELAY)
    yield* persist(id, text).pipe(Effect.uninterruptible)
    registry.set(saveStatusAtom, 'saved')
    registry.set(storageProblemAtom, null)
  }, Effect.catchTag('StorageError', (error) => reportProblem(error.message))),
)

/** Saves the open document now: before leaving the page or switching documents. */
export const flushAtom = runtime.fn<void>()(
  Effect.fnUntraced(function* () {
    const registry = yield* AtomRegistry

    yield* flushActive()
    registry.set(saveStatusAtom, 'saved')
  }, Effect.catchTag('StorageError', (error) => reportProblem(error.message))),
)

/** Opens another document. */
export const openDocumentAtom = runtime.fn<string>()(
  Effect.fnUntraced(function* (id) {
    const registry = yield* AtomRegistry

    if (registry.get(activeIdAtom) === id) return

    yield* flushActive()

    const meta = registry.get(documentsAtom).find((candidate) => candidate.id === id)

    if (meta) yield* show(meta, yield* readDocument(id))
  }, Effect.catchTag('StorageError', (error) => reportProblem(error.message))),
)

/** Starts an empty document and opens it. */
export const createDocumentAtom = runtime.fn<void>()(
  Effect.fnUntraced(function* () {
    const registry = yield* AtomRegistry

    yield* flushActive()

    const meta = yield* createDocument('Untitled', '')

    registry.set(documentsAtom, sortDocuments([...registry.get(documentsAtom), meta]))
    yield* show(meta, '')
  }, Effect.catchTag('StorageError', (error) => reportProblem(error.message))),
)

/** Renames a document. */
export const renameDocumentAtom = runtime.fn<{ id: string; name: string }>()(
  Effect.fnUntraced(function* ({ id, name }) {
    const registry = yield* AtomRegistry
    const meta = registry.get(documentsAtom).find((candidate) => candidate.id === id)
    const trimmed = name.trim()

    if (!meta || trimmed === '' || trimmed === meta.name) return

    const renamed =
      registry.get(activeIdAtom) === id
        ? yield* saveDocument({ ...meta, name: trimmed }, registry.get(textAtom))
        : yield* renameDocument(meta, trimmed)

    registry.set(documentsAtom, sortDocuments(registry.get(documentsAtom).map((candidate) => (candidate.id === id ? renamed : candidate))))
  }, Effect.catchTag('StorageError', (error) => reportProblem(error.message))),
)

/** Deletes a document; deleting the open one opens the next, or starts an empty one when it was the last. */
export const deleteDocumentAtom = runtime.fn<string>()(
  Effect.fnUntraced(function* (id) {
    const registry = yield* AtomRegistry
    const wasActive = registry.get(activeIdAtom) === id

    yield* removeDocument(id)

    const remaining = registry.get(documentsAtom).filter((candidate) => candidate.id !== id)

    registry.set(documentsAtom, remaining)

    if (!wasActive) return

    const next = remaining[0]

    if (next) {
      yield* show(next, yield* readDocument(next.id))
    } else {
      const meta = yield* createDocument('Untitled', '')

      registry.set(documentsAtom, [meta])
      yield* show(meta, '')
    }
  }, Effect.catchTag('StorageError', (error) => reportProblem(error.message))),
)
