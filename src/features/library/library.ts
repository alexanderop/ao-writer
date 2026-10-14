import { Effect } from 'effect'

import type { DocumentMeta } from './model.ts'
import { DocumentStorage } from './storage.ts'
import { WELCOME_NAME, WELCOME_TEXT } from './welcome.ts'

/** Newest first, the order the sidebar shows. */
export function sortDocuments(documents: ReadonlyArray<DocumentMeta>): ReadonlyArray<DocumentMeta> {
  return documents.toSorted((a, b) => b.updatedAt - a.updatedAt)
}

function fresh(name: string): DocumentMeta {
  return { id: crypto.randomUUID(), name, updatedAt: Date.now() }
}

/** Lists the documents; the first visit creates the welcome document. */
export const loadLibrary = Effect.gen(function* () {
  const storage = yield* DocumentStorage
  const existing = yield* storage.list

  if (existing.length > 0) return sortDocuments(existing)

  const welcome = fresh(WELCOME_NAME)

  yield* storage.write(welcome, WELCOME_TEXT)

  return [welcome]
})

/** Creates a document with the given text. */
export const createDocument = Effect.fn('createDocument')(function* (name: string, body: string) {
  const storage = yield* DocumentStorage
  const meta = fresh(name)

  yield* storage.write(meta, body)

  return meta
})

/** Reads a document's text. */
export const readDocument = Effect.fn('readDocument')(function* (id: string) {
  const storage = yield* DocumentStorage

  return yield* storage.read(id)
})

/** Writes new text for a document and returns its refreshed metadata. */
export const saveDocument = Effect.fn('saveDocument')(function* (meta: DocumentMeta, body: string) {
  const storage = yield* DocumentStorage
  const updated = { ...meta, updatedAt: Date.now() }

  yield* storage.write(updated, body)

  return updated
})

/** Renames a document without touching its text. */
export const renameDocument = Effect.fn('renameDocument')(function* (meta: DocumentMeta, name: string) {
  const storage = yield* DocumentStorage
  const body = yield* storage.read(meta.id)
  const renamed = { ...meta, name, updatedAt: Date.now() }

  yield* storage.write(renamed, body)

  return renamed
})

/** Deletes a document. */
export const removeDocument = Effect.fn('removeDocument')(function* (id: string) {
  const storage = yield* DocumentStorage

  yield* storage.remove(id)
})
