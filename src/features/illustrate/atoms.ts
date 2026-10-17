import { Effect, Option } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { illustrationEdit } from '../../core/illustrate/place.ts'
import { findIllustrateTarget } from '../../core/illustrate/prompt.ts'
import type { IllustrateTarget } from '../../core/illustrate/prompt.ts'
import { applyEdit, editorInputAtom } from '../../app/editor-input.ts'
import { selectionAtom, textAtom } from '../editor/atoms.ts'
import { activeIdAtom } from '../library/atoms.ts'
import { settingsAtom } from '../settings/atoms.ts'
import { imagePath, pngToWebp, writeImage } from './images.ts'
import { illustrate } from './server.ts'

/** What the illustrations are doing: nothing, drawing (that many at once), or the last one did not work out. */
export type IllustrateStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly count: number }
  | { readonly kind: 'failed'; readonly message: string }

const NO_TARGET = 'Select some text, or put the caret in an image like ![a fox at dawn]().'

const NO_SERVER = 'Illustrate needs the local dev server (pnpm dev) and a Codex login.'

const NOT_DRAWN = 'The picture could not be prepared.'

const NO_PLACE = 'The empty image is gone, so the picture has no place.'

/** The illustration status the dot under the top bar shows. */
export const illustrateStatusAtom = Atom.make<IllustrateStatus>({ kind: 'idle' }).pipe(Atom.keepAlive)

function started(registry: AtomRegistry): void {
  const status = registry.get(illustrateStatusAtom)

  registry.set(illustrateStatusAtom, { kind: 'running', count: status.kind === 'running' ? status.count + 1 : 1 })
}

/** Ends one illustration; the status goes quiet once the last one is done, unless that one failed. */
function finished(registry: AtomRegistry, failure: string | null): void {
  const status = registry.get(illustrateStatusAtom)
  const remaining = status.kind === 'running' ? status.count - 1 : 0

  registry.set(illustrateStatusAtom, remaining > 0 ? { kind: 'running', count: remaining } : failure === null ? { kind: 'idle' } : { kind: 'failed', message: failure })
}

/** Has Codex draw the picture, stores it, and puts it in the text; resolves with why that did not work, or null. */
const drawn = Effect.fnUntraced(function* (registry: AtomRegistry, target: IllustrateTarget, documentId: string) {
  const rendered = yield* Effect.tryPromise(() => illustrate({ data: { description: target.description, theme: registry.get(settingsAtom).theme } })).pipe(Effect.option)

  if (Option.isNone(rendered)) return NO_SERVER

  if (!rendered.value.ok) return rendered.value.reason

  const { png } = rendered.value
  const webp = yield* Effect.tryPromise(() => pngToWebp(png)).pipe(Effect.option)

  if (Option.isNone(webp)) return NOT_DRAWN

  // a picture for a document the writer has left has no place in the one on screen
  if (registry.get(activeIdAtom) !== documentId) return null

  const id = crypto.randomUUID().slice(0, 8)
  const blob = webp.value

  yield* Effect.promise(() => writeImage(`${id}.webp`, blob))

  const input = registry.get(editorInputAtom)

  // the writer kept typing while the picture was made, so the place is looked up in the text as it is now
  const edit = input === null ? null : illustrationEdit(input.value, target, imagePath(id), input.selectionStart, input.selectionEnd)

  if (input === null || edit === null) return NO_PLACE

  applyEdit(input, edit)

  return null
})

/** Illustrates the empty image under the caret, or the selected text, with a picture from Codex. */
export const illustrateAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* () {
    const registry = yield* AtomRegistry
    const documentId = registry.get(activeIdAtom)
    const { start, end } = registry.get(selectionAtom)
    const target = findIllustrateTarget(registry.get(textAtom), start, end)

    if (documentId === null) return

    if (target === null) {
      registry.set(illustrateStatusAtom, { kind: 'failed', message: NO_TARGET })

      return
    }

    started(registry)
    finished(registry, yield* drawn(registry, target, documentId))
  }),
  // a second picture asked for while the first is drawing must not cancel it
  { concurrent: true },
  // the dot keeps its status with nothing subscribed to the atom itself
).pipe(Atom.keepAlive)
