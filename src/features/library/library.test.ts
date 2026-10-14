import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { createDocument, loadLibrary, readDocument, removeDocument, renameDocument, saveDocument, sortDocuments } from './library.ts'
import { DocumentStorage } from './storage.ts'
import { WELCOME_NAME, WELCOME_TEXT } from './welcome.ts'

function run<A, E>(program: Effect.Effect<A, E, DocumentStorage>): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(DocumentStorage.layerMemory)))
}

describe('library', () => {
  it('seeds the welcome document on the first visit only', async () => {
    const result = await run(
      Effect.gen(function* () {
        const first = yield* loadLibrary
        const second = yield* loadLibrary
        const body = yield* readDocument(first[0]?.id ?? '')

        return { first, second, body }
      }),
    )

    expect(result.first).toHaveLength(1)
    expect(result.first[0]?.name).toBe(WELCOME_NAME)
    expect(result.second).toEqual(result.first)
    expect(result.body).toBe(WELCOME_TEXT)
  })

  it('creates, saves, renames and deletes documents', async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* loadLibrary

        const created = yield* createDocument('Notes', 'one')
        const saved = yield* saveDocument(created, 'one two')
        const renamed = yield* renameDocument(saved, 'Ideas')
        const body = yield* readDocument(created.id)

        yield* removeDocument(created.id)

        const after = yield* loadLibrary

        return { renamed, body, names: after.map((doc) => doc.name) }
      }),
    )

    expect(result.renamed.name).toBe('Ideas')
    expect(result.body).toBe('one two')
    expect(result.names).toEqual([WELCOME_NAME])
  })

  it('fails to read a document that is gone', async () => {
    const outcome = await run(readDocument('missing').pipe(Effect.result))

    expect(outcome._tag).toBe('Failure')
  })

  it('sorts newest first', () => {
    const docs = [
      { id: 'a', name: 'A', updatedAt: 1 },
      { id: 'b', name: 'B', updatedAt: 3 },
      { id: 'c', name: 'C', updatedAt: 2 },
    ]

    expect(sortDocuments(docs).map((doc) => doc.id)).toEqual(['b', 'c', 'a'])
  })
})
