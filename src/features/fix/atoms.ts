import { Effect, Option } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { applyFixes, fixEdit, spellingForPractice } from '../../core/fix/fix.ts'
import type { Fix } from '../../core/fix/fix.ts'
import { rememberWord } from '../../core/learn/practice.ts'
import { learningAtom } from '../learn/atoms.ts'
import { applyEdit, editorInputAtom } from '../../app/editor-input.ts'
import { activeIdAtom } from '../library/atoms.ts'
import { askFixes } from './server.ts'

/** What the proofreader is doing: nothing, reading, or what came of the last run. */
export type FixStatus = { readonly kind: 'idle' } | { readonly kind: 'fixing' } | { readonly kind: 'done'; readonly message: string }

const OFFLINE = 'Fixing needs the local dev server (pnpm dev) and a Claude Code login.'

export const fixStatusAtom = Atom.make<FixStatus>({ kind: 'idle' }).pipe(Atom.keepAlive)

/** Fixes spelling and grammar in the selection, or in the whole document when nothing is selected, as one edit to undo. */
export const fixAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* () {
    const registry = yield* AtomRegistry
    const input = registry.get(editorInputAtom)
    const documentId = registry.get(activeIdAtom)

    if (input === null || documentId === null || registry.get(fixStatusAtom).kind === 'fixing') return

    const whole = input.selectionStart === input.selectionEnd
    const from = whole ? 0 : input.selectionStart
    const asked = whole ? input.value : input.value.slice(input.selectionStart, input.selectionEnd)

    if (asked.trim() === '') return

    registry.set(fixStatusAtom, { kind: 'fixing' })

    const reply = yield* Effect.tryPromise(() => askFixes({ data: { key: `fix:${crypto.randomUUID()}`, text: asked } })).pipe(Effect.option)

    if (Option.isNone(reply) || reply.value.fixes === null) {
      registry.set(fixStatusAtom, { kind: 'done', message: Option.isNone(reply) ? OFFLINE : 'The answer did not come through. Try again.' })

      return
    }

    if (registry.get(activeIdAtom) !== documentId) return registry.set(fixStatusAtom, { kind: 'idle' })

    // the writer may have typed while the agent read; the fixes are passages, so they apply to the text as it is now
    const current = registry.get(editorInputAtom)

    if (current === null) return registry.set(fixStatusAtom, { kind: 'idle' })

    // a selection stays the only part fixed while it is still where it was; otherwise the fixes go wherever their passage is
    const inPlace = !whole && current.value.slice(from, from + asked.length) === asked
    const applied: Fix[] = []
    const fixed = applyFixes(inPlace ? asked : current.value, reply.value.fixes, (fix) => applied.push(fix))
    const text = inPlace ? current.value.slice(0, from) + fixed.text + current.value.slice(from + asked.length) : fixed.text

    if (fixed.count > 0) applyEdit(current, fixEdit(current.value, text, current.selectionEnd))

    const learning = registry.get(learningAtom)

    if (learning.rememberCorrections) {
      let cards = learning.cards

      for (const fix of applied) {
        const spelling = spellingForPractice(fix)

        if (spelling !== null) cards = rememberWord(cards, spelling.entry, Date.now(), spelling.mistake)
      }

      if (cards !== learning.cards) registry.set(learningAtom, { ...learning, cards })
    }

    registry.set(fixStatusAtom, { kind: 'done', message: fixed.count === 0 ? 'No mistakes found' : `Fixed ${fixed.count} ${fixed.count === 1 ? 'spot' : 'spots'} · undo reverts` })
  }),
  // started from a shortcut; the status bar shows the result with nothing subscribed to the atom itself
).pipe(Atom.keepAlive)
