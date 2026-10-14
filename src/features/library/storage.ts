import { Context, Effect, Layer, Option, Schema } from 'effect'

import { DocumentMeta, StorageError, storageError } from './model.ts'

/** Where documents live. Every implementation stores the same two things per document: its metadata and its text. */
export interface DocumentStore {
  readonly backend: 'opfs' | 'indexeddb' | 'memory'
  readonly list: Effect.Effect<ReadonlyArray<DocumentMeta>, StorageError>
  readonly read: (id: string) => Effect.Effect<string, StorageError>
  readonly write: (meta: DocumentMeta, body: string) => Effect.Effect<void, StorageError>
  readonly remove: (id: string) => Effect.Effect<void, StorageError>
}

const decodeMeta = Schema.decodeUnknownEffect(Schema.fromJsonString(DocumentMeta))

function attempt<A>(run: () => Promise<A>): Effect.Effect<A, StorageError> {
  return Effect.tryPromise({ try: run, catch: (cause) => storageError(cause instanceof Error ? cause : String(cause)) })
}

// OPFS: one folder, two files per document (`<id>.json` for the metadata, `<id>.md` for the text)

async function opfsFolder(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()

  return root.getDirectoryHandle('ao-writer', { create: true })
}

async function opfsWrite(folder: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const handle = await folder.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()

  await writable.write(text)
  await writable.close()
}

async function opfsRead(folder: FileSystemDirectoryHandle, name: string): Promise<string> {
  const handle = await folder.getFileHandle(name)
  const file = await handle.getFile()

  return file.text()
}

async function opfsRemove(folder: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await folder.removeEntry(name)
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'NotFoundError')) throw cause
  }
}

async function opfsMetaNames(folder: FileSystemDirectoryHandle): Promise<readonly string[]> {
  const names: string[] = []

  for await (const [name] of folder.entries()) {
    if (name.endsWith('.json')) names.push(name)
  }

  return names
}

/** Writes and reads a probe file: Safari and some private modes expose OPFS without a working createWritable. */
async function opfsProbe(folder: FileSystemDirectoryHandle): Promise<void> {
  await opfsWrite(folder, 'probe.tmp', 'ok')

  if ((await opfsRead(folder, 'probe.tmp')) !== 'ok') throw new Error('OPFS probe read back the wrong text')

  await opfsRemove(folder, 'probe.tmp')
}

const opfsStore: Effect.Effect<DocumentStore, StorageError> = Effect.gen(function* () {
  const folder = yield* attempt(async () => {
    const handle = await opfsFolder()

    await opfsProbe(handle)

    return handle
  })

  const list = Effect.gen(function* () {
    const names = yield* attempt(() => opfsMetaNames(folder))
    const found: DocumentMeta[] = []

    for (const name of names) {
      const text = yield* attempt(() => opfsRead(folder, name))
      const meta = yield* decodeMeta(text).pipe(Effect.option)

      if (Option.isSome(meta)) found.push(meta.value)
    }

    return found
  })

  return {
    backend: 'opfs',
    list,
    read: (id) => attempt(() => opfsRead(folder, `${id}.md`)),
    write: (meta, body) =>
      attempt(async () => {
        await opfsWrite(folder, `${meta.id}.md`, body)
        await opfsWrite(folder, `${meta.id}.json`, JSON.stringify(meta))
      }),
    remove: (id) =>
      attempt(async () => {
        await opfsRemove(folder, `${id}.json`)
        await opfsRemove(folder, `${id}.md`)
      }),
  }
})

// IndexedDB: one object store keyed by id, holding the metadata and the text together

interface StoredDocument {
  readonly id: string
  readonly name: string
  readonly updatedAt: number
  readonly body: string
}

const DB_NAME = 'ao-writer'

const STORE = 'documents'

function request<A>(source: IDBRequest<A>): Promise<A> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result)
    source.onerror = () => reject(source.error ?? new Error('IndexedDB request failed'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, 1)

    opening.onupgradeneeded = () => {
      opening.result.createObjectStore(STORE, { keyPath: 'id' })
    }

    opening.onsuccess = () => resolve(opening.result)
    opening.onerror = () => reject(opening.error ?? new Error('IndexedDB could not be opened'))
  })
}

function objectStore(database: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return database.transaction(STORE, mode).objectStore(STORE)
}

const indexedDbStore: Effect.Effect<DocumentStore, StorageError> = Effect.gen(function* () {
  const database = yield* attempt(openDatabase)

  return {
    backend: 'indexeddb',
    list: attempt(async () => {
      const all: StoredDocument[] = await request(objectStore(database, 'readonly').getAll())

      return all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    }),
    read: (id) =>
      attempt(async () => {
        const stored: StoredDocument | undefined = await request(objectStore(database, 'readonly').get(id))

        if (!stored) throw new Error(`Document ${id} is missing`)

        return stored.body
      }),
    write: (meta, body) =>
      attempt(async () => {
        await request(objectStore(database, 'readwrite').put({ ...meta, body }))
      }),
    remove: (id) =>
      attempt(async () => {
        await request(objectStore(database, 'readwrite').delete(id))
      }),
  }
})

// Memory: for tests

const memoryStore: Effect.Effect<DocumentStore> = Effect.sync(() => {
  const metas = new Map<string, DocumentMeta>()
  const bodies = new Map<string, string>()

  return {
    backend: 'memory',
    list: Effect.sync(() => [...metas.values()]),
    read: (id) =>
      Effect.suspend(() => {
        const body = bodies.get(id)

        return body === undefined ? Effect.fail(storageError(`Document ${id} is missing`)) : Effect.succeed(body)
      }),
    write: (meta, body) =>
      Effect.sync(() => {
        metas.set(meta.id, meta)
        bodies.set(meta.id, body)
      }),
    remove: (id) =>
      Effect.sync(() => {
        metas.delete(id)
        bodies.delete(id)
      }),
  }
})

/** Reads and writes documents. The browser layer uses OPFS and falls back to IndexedDB. */
export class DocumentStorage extends Context.Service<DocumentStorage, DocumentStore>()('ao-writer/library/DocumentStorage') {
  /** OPFS when it works, IndexedDB otherwise. */
  static readonly layerBrowser = Layer.effect(DocumentStorage, opfsStore.pipe(Effect.catch(() => indexedDbStore)))

  /** Keeps everything in memory, for tests. */
  static readonly layerMemory = Layer.effect(DocumentStorage, memoryStore)
}
