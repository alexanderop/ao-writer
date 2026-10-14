import { Schema } from 'effect'

/** What the library keeps about a document besides its text. */
export const DocumentMeta = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  updatedAt: Schema.Number,
})

export type DocumentMeta = typeof DocumentMeta.Type

/** The browser refused to read or write a document. */
export class StorageError extends Schema.TaggedError<StorageError>()('StorageError', {
  message: Schema.String,
}) {}

/** Turns whatever a browser API threw into a StorageError. */
export function storageError(cause: Error | string): StorageError {
  return new StorageError({ message: cause instanceof Error ? cause.message : cause })
}
