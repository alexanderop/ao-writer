import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { outlineEdit, outlineMarkdown } from '../../core/plan/plan.ts'
import type { Headlines, Plan } from '../../core/plan/plan.ts'
import { applyEdit, editorInputAtom } from '../../app/editor-input.ts'
import { activeIdAtom } from '../library/atoms.ts'
import { askHeadlines, askPlan, revisePlan } from './server.ts'

/** Where the idea coach is: the idea box, waiting on an answer, a recommendation, or the headlines for it. */
export type PlanStep =
  | { readonly kind: 'idea' }
  | { readonly kind: 'thinking'; readonly for: 'plan' | 'headlines' }
  | { readonly kind: 'plan'; readonly plan: Plan }
  | { readonly kind: 'headlines'; readonly plan: Plan; readonly headlines: Headlines }

const OFFLINE = 'The coach is out of reach: it needs the local dev server (pnpm dev) and a Claude Code login.'

const GARBLED = 'The coach’s answer did not come through. Try again.'

/** Whether the idea coach's panel is open. */
export const planOpenAtom = Atom.make(false).pipe(Atom.keepAlive)

/** The idea as the writer typed it; kept when the panel closes, so nothing typed is lost. */
export const ideaAtom = Atom.make('').pipe(Atom.keepAlive)

export const planStepAtom = Atom.make<PlanStep>({ kind: 'idea' }).pipe(Atom.keepAlive)

/** Why the last ask did not work out, or null. */
export const planErrorAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

/** The session the current idea talks to; every new idea starts a fresh one. */
const sessionAtom = Atom.make('').pipe(Atom.keepAlive)

let nextSession = 0

/** Runs one ask with the panel showing that the coach thinks; on any failure the panel goes back to where it was. */
const asking = Effect.fnUntraced(function* (registry: AtomRegistry, waitingFor: 'plan' | 'headlines', ask: () => Promise<PlanStep | null>) {
  const before = registry.get(planStepAtom)

  if (before.kind === 'thinking') return

  registry.set(planErrorAtom, null)
  registry.set(planStepAtom, { kind: 'thinking', for: waitingFor })

  const next = yield* Effect.tryPromise(ask).pipe(Effect.catch(() => Effect.succeed(undefined)))

  if (next === undefined || next === null) {
    registry.set(planStepAtom, before)
    registry.set(planErrorAtom, next === undefined ? OFFLINE : GARBLED)

    return
  }

  registry.set(planStepAtom, next)
})

/** Has the coach recommend a type and a structure for the idea, in a new session. */
export const askPlanAtom = Atom.fn<string>()(
  Effect.fnUntraced(function* (idea) {
    const registry = yield* AtomRegistry
    const key = `plan:${++nextSession}`

    registry.set(sessionAtom, key)

    yield* asking(registry, 'plan', async () => {
      const { plan } = await askPlan({ data: { key, idea } })

      return plan === null ? null : { kind: 'plan', plan }
    })
  }),
  // the panel can close while the coach thinks; the answer is waiting when it opens again
).pipe(Atom.keepAlive)

/** Has the coach recommend again: another angle, or what the writer asked for. */
export const revisePlanAtom = Atom.fn<string>()(
  Effect.fnUntraced(function* (wish) {
    const registry = yield* AtomRegistry
    const key = registry.get(sessionAtom)

    yield* asking(registry, 'plan', async () => {
      const { plan } = await revisePlan({ data: { key, wish } })

      return plan === null ? null : { kind: 'plan', plan }
    })
  }),
).pipe(Atom.keepAlive)

/** The writer likes the plan: has the coach write the titles and headings for it. */
export const acceptPlanAtom = Atom.fn<Plan>()(
  Effect.fnUntraced(function* (plan) {
    const registry = yield* AtomRegistry
    const key = registry.get(sessionAtom)

    yield* asking(registry, 'headlines', async () => {
      const { headlines } = await askHeadlines({ data: { key, plan } })

      return headlines === null ? null : { kind: 'headlines', plan, headlines }
    })
  }),
).pipe(Atom.keepAlive)

/** Starts over with the idea box, keeping what was typed. */
export const restartPlanAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* () {
    const registry = yield* AtomRegistry

    registry.set(planErrorAtom, null)
    registry.set(planStepAtom, { kind: 'idea' })
  }),
)

/** Writes the outline with the chosen title into the document: in place of an empty draft, otherwise at the caret. */
export const insertOutlineAtom = Atom.fn<string>()(
  Effect.fnUntraced(function* (title) {
    const registry = yield* AtomRegistry
    const step = registry.get(planStepAtom)
    const input = registry.get(editorInputAtom)

    if (step.kind !== 'headlines' || input === null || registry.get(activeIdAtom) === null) return

    applyEdit(input, outlineEdit(input.value, input.selectionEnd, title, outlineMarkdown(title, step.headlines.headings, step.plan)))
    registry.set(planOpenAtom, false)
  }),
)
