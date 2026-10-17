import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { changedChars, locateQuote, MIN_WORDS, WORD_EVERY } from '../../core/coach/note.ts'
import type { CoachNote } from '../../core/coach/note.ts'
import type { LearnedWord } from '../../core/coach/vocabulary.ts'
import { countText } from '../../core/text/counts.ts'
import { caretAtom, textAtom } from '../editor/atoms.ts'
import { activeIdAtom } from '../library/atoms.ts'
import { settingsAtom } from '../settings/atoms.ts'
import { askCoach, learnWord, readJournal, reflectCoach } from './server.ts'

/** The pause in writing after which the coach looks at the draft on its own. */
const PAUSE = '20 seconds'

/** How much has to change since the coach last looked before a pause is worth a look. */
const MIN_CHANGED_CHARS = 80

/** After this many notes on one document the coach updates the writer profile; switching documents does it sooner. */
const REFLECT_EVERY = 4

/** A note on screen: the coach's note, which document it belongs to, and where its passage was when it arrived. */
export interface ShownNote extends CoachNote {
  readonly id: number
  readonly documentId: string
  readonly near: number
}

/** The coach's journal as the sidebar shows it. */
export interface Journal {
  readonly profile: string
  readonly words: readonly LearnedWord[]
  readonly directory: string
}

/** Where the coach stands: waiting, reading the draft, or out of reach (no dev server, no Claude Code login). */
export const coachStatusAtom = Atom.make<'idle' | 'thinking' | 'offline'>('idle').pipe(Atom.keepAlive)

/** The one note on screen, or null. */
export const coachNoteAtom = Atom.make<ShownNote | null>(null).pipe(Atom.keepAlive)

/** The writer profile and word book, or null until read (and while the journal is out of reach). */
export const journalAtom = Atom.make<Journal | null>(null).pipe(Atom.keepAlive)

/** True for a moment after the profile changed, so the sidebar can show that the coach learned something. */
export const profileFreshAtom = Atom.make(false).pipe(Atom.keepAlive)

/** The draft as the coach last saw it, so a pause without new writing does not ask again. */
const lastSeenAtom = Atom.make('').pipe(Atom.keepAlive)

/** Notes the coach gave, all told, and on the current document since it last updated the profile. */
const tallyAtom = Atom.make({ notes: 0, sinceReflect: 0 }).pipe(Atom.keepAlive)

let nextNoteId = 0

/** Reads the journal files into the sidebar. */
export const loadJournalAtom = Atom.fn<void>()(
  Effect.fnUntraced(
    function* () {
      const registry = yield* AtomRegistry

      registry.set(journalAtom, yield* Effect.tryPromise(() => readJournal()))
    },
    Effect.catch(() => Effect.void),
  ),
)

/** Has the coach rewrite the writer profile from what it saw in a document. */
const reflectAtom = Atom.fn<string>()(
  Effect.fnUntraced(
    function* (documentId) {
      const registry = yield* AtomRegistry

      registry.set(tallyAtom, { ...registry.get(tallyAtom), sinceReflect: 0 })

      const { profile } = yield* Effect.tryPromise(() => reflectCoach({ data: { documentId } }))
      const journal = registry.get(journalAtom)

      if (profile === null || journal === null) return

      registry.set(journalAtom, { ...journal, profile })
      registry.set(profileFreshAtom, true)
    },
    Effect.catch(() => Effect.void),
  ),
  // started from other atoms with nothing on screen subscribed, so it must outlive its caller to see its answer
).pipe(Atom.keepAlive)

/** Shows the draft to the coach and puts its note on screen, if it has one and its passage is still in the text. */
export const askCoachAtom = Atom.fn<void>()(
  Effect.fnUntraced(
    function* () {
      const registry = yield* AtomRegistry
      const documentId = registry.get(activeIdAtom)
      const text = registry.get(textAtom)

      if (documentId === null || registry.get(coachStatusAtom) === 'thinking' || countText(text).words < MIN_WORDS) return

      registry.set(coachStatusAtom, 'thinking')
      registry.set(lastSeenAtom, text)

      const tally = registry.get(tallyAtom)
      const wordTurn = tally.notes % WORD_EVERY === WORD_EVERY - 1
      const { note } = yield* Effect.tryPromise(() => askCoach({ data: { documentId, text, caret: registry.get(caretAtom), wordTurn } }))

      registry.set(coachStatusAtom, 'idle')

      if (note === null || registry.get(activeIdAtom) !== documentId) return

      const range = locateQuote(registry.get(textAtom), note.quote, registry.get(caretAtom))

      if (range === null) return

      registry.set(coachNoteAtom, { ...note, id: ++nextNoteId, documentId, near: range.start })
      registry.set(tallyAtom, { notes: tally.notes + 1, sinceReflect: tally.sinceReflect + 1 })

      if (tally.sinceReflect + 1 >= REFLECT_EVERY) registry.set(reflectAtom, documentId)
    },
    Effect.catch(() =>
      Effect.gen(function* () {
        const registry = yield* AtomRegistry

        registry.set(coachStatusAtom, 'offline')
      }),
    ),
  ),
)

/** Updates the profile from the document the writer just left, when the coach gave notes on it since the last update. */
export const leaveDocumentAtom = Atom.fn<string>()(
  Effect.fnUntraced(function* (documentId) {
    const registry = yield* AtomRegistry

    if (registry.get(tallyAtom).sinceReflect > 0) registry.set(reflectAtom, documentId)
  }),
)

/** Puts a word the writer took from a word note into their word book. */
export const learnWordAtom = Atom.fn<LearnedWord>()(
  Effect.fnUntraced(
    function* (entry) {
      const registry = yield* AtomRegistry
      const { words } = yield* Effect.tryPromise(() => learnWord({ data: entry }))
      const journal = registry.get(journalAtom)

      if (journal !== null) registry.set(journalAtom, { ...journal, words })
    },
    Effect.catch(() => Effect.void),
  ),
  // a second word taken right after the first must not cancel the first one's save
  { concurrent: true },
  // the note that started it leaves the screen while the save is still on its way
).pipe(Atom.keepAlive)

/** Waits for a pause in writing, then asks the coach when enough changed; a newer call restarts the wait. */
export const coachPauseAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* () {
    const registry = yield* AtomRegistry

    yield* Effect.sleep(PAUSE)

    const text = registry.get(textAtom)

    if (registry.get(settingsAtom).coach !== 'pause' || registry.get(coachNoteAtom) !== null) return

    if (changedChars(registry.get(lastSeenAtom), text) >= MIN_CHANGED_CHARS) registry.set(askCoachAtom, undefined)
  }),
)
