import { Effect, Option } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import type { IllustrationJob } from '../../core/illustrate/cards.ts'
import { altEdit, placementEdit, withdrawEdit } from '../../core/illustrate/place.ts'
import { findIllustrateTarget } from '../../core/illustrate/prompt.ts'
import type { IllustrateTarget } from '../../core/illustrate/prompt.ts'
import { applyEdit, editorInputAtom } from '../../app/editor-input.ts'
import { selectionAtom, textAtom } from '../editor/atoms.ts'
import { activeIdAtom } from '../library/atoms.ts'
import { settingsAtom } from '../settings/atoms.ts'
import { imagesVersionAtom, pngToWebp, writeImage } from './images.ts'
import { illustrate } from './server.ts'

/** What the illustrations are doing: nothing, drawing (that many at once), or the last one did not work out. */
export type IllustrateStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly count: number }
  | { readonly kind: 'failed'; readonly message: string }

const NO_SERVER = 'Illustrate needs the local dev server (pnpm dev) and a Codex login.'

const NOT_DRAWN = 'The picture could not be prepared.'

const NO_PLACE = 'The placeholder is gone, so the picture has no place.'

/** The prompt box for a picture the writer describes: closed, or open at the caret offset it was asked for. */
export type IllustratePrompt = { readonly kind: 'closed' } | { readonly kind: 'open'; readonly at: number }

export const illustratePromptAtom = Atom.make<IllustratePrompt>({ kind: 'closed' }).pipe(Atom.keepAlive)

/** The illustration status the dot under the top bar shows. */
export const illustrateStatusAtom = Atom.make<IllustrateStatus>({ kind: 'idle' }).pipe(Atom.keepAlive)

/** The pictures of this session by id: what each was asked for and how it ended. The cards in the editor and the preview read it. */
export const illustrationJobsAtom = Atom.make<Readonly<Record<string, IllustrationJob>>>({}).pipe(Atom.keepAlive)

/** How a picture ended: why it did not work out (null when it did) and where its withdrawn placeholder stood. */
interface Outcome {
  readonly reason: string | null
  readonly at: number | null
}

function settle(registry: AtomRegistry, id: string, outcome: Outcome): void {
  registry.update(illustrationJobsAtom, (jobs) => {
    const job = jobs[id]

    if (job === undefined) return jobs

    const { prompt, startedAt } = job
    const finishedAt = Date.now()

    const settled: IllustrationJob = outcome.reason === null ? { state: 'done', id, prompt, startedAt, finishedAt } : { state: 'failed', id, prompt, startedAt, finishedAt, reason: outcome.reason, at: outcome.at }

    return { ...jobs, [id]: settled }
  })
}

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

/** What Codex made and the browser stored under the id, or why it did not work out. */
type Stored = { readonly ok: true; readonly alt: string } | { readonly ok: false; readonly reason: string }

/** Has Codex draw the picture for the description and stores it as `images/<id>.webp`. */
const stored = Effect.fnUntraced(function* (registry: AtomRegistry, description: string, id: string) {
  const rendered = yield* Effect.tryPromise(() => illustrate({ data: { description, theme: registry.get(settingsAtom).theme } })).pipe(Effect.option)

  if (Option.isNone(rendered)) return { ok: false, reason: NO_SERVER } as const

  if (!rendered.value.ok) return { ok: false, reason: rendered.value.reason } as const

  const { png, alt } = rendered.value
  const webp = yield* Effect.tryPromise(() => pngToWebp(png)).pipe(Effect.option)

  if (Option.isNone(webp)) return { ok: false, reason: NOT_DRAWN } as const

  const blob = webp.value

  yield* Effect.promise(() => writeImage(`${id}.webp`, blob))
  registry.update(imagesVersionAtom, (version) => version + 1)

  return { ok: true, alt: alt ?? description } as const
})

/** Has Codex draw the picture for the placeholder `id` and settles the placeholder and the job. */
const drawn = Effect.fnUntraced(function* (registry: AtomRegistry, description: string, id: string, documentId: string) {
  const result: Stored = yield* stored(registry, description, id)

  // a document the writer has left is not touched; the picture is stored, so it shows if they come back
  if (registry.get(activeIdAtom) !== documentId) return { reason: result.ok ? null : result.reason, at: null }

  const input = registry.get(editorInputAtom)

  // the writer kept typing while the picture was made, so the placeholder is looked up in the text as it is now
  const edit = input === null ? null : result.ok ? altEdit(input.value, id, result.alt, input.selectionStart, input.selectionEnd) : withdrawEdit(input.value, id, input.selectionStart, input.selectionEnd)

  if (input !== null && edit !== null) applyEdit(input, edit)

  if (!result.ok) return { reason: result.reason, at: edit?.from ?? null }

  return { reason: edit === null ? NO_PLACE : null, at: null }
})

/** Puts the placeholder in the text right away, then has Codex draw the picture for it. */
const illustrating = Effect.fnUntraced(function* (registry: AtomRegistry, target: IllustrateTarget, documentId: string) {
  const input = registry.get(editorInputAtom)

  if (input === null) return

  const id = crypto.randomUUID().slice(0, 8)

  applyEdit(input, placementEdit(input.value, target, id, input.selectionStart, input.selectionEnd))
  const drawing: IllustrationJob = { state: 'drawing', id, prompt: target.description, startedAt: Date.now() }

  registry.update(illustrationJobsAtom, (jobs) => ({ ...jobs, [id]: drawing }))
  started(registry)

  const outcome = yield* drawn(registry, target.description, id, documentId)

  settle(registry, id, outcome)
  finished(registry, outcome.reason)
})

/** Illustrates the empty image under the caret or the selected text; with neither, opens the prompt box at the caret. */
export const illustrateAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* () {
    const registry = yield* AtomRegistry
    const documentId = registry.get(activeIdAtom)
    const { start, end } = registry.get(selectionAtom)
    const target = findIllustrateTarget(registry.get(textAtom), start, end)

    if (documentId === null) return

    if (target === null) {
      registry.set(illustratePromptAtom, { kind: 'open', at: end })

      return
    }

    yield* illustrating(registry, target, documentId)
  }),
  // a second picture asked for while the first is drawing must not cancel it
  { concurrent: true },
  // the dot keeps its status with nothing subscribed to the atom itself
).pipe(Atom.keepAlive)

/** Illustrates what the writer typed into the prompt box, at the caret the box opened at. */
export const illustrateDescriptionAtom = Atom.fn<{ readonly description: string; readonly at: number }>()(
  Effect.fnUntraced(function* ({ description, at }) {
    const registry = yield* AtomRegistry
    const documentId = registry.get(activeIdAtom)

    if (documentId === null) return

    yield* illustrating(registry, { kind: 'prompt', description, insertAt: at }, documentId)
  }),
  { concurrent: true },
).pipe(Atom.keepAlive)
