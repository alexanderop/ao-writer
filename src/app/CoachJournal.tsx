import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react'
import { useEffect } from 'react'

import { renderMarkdown } from '../core/markdown/render.ts'
import { journalAtom, loadJournalAtom, profileFreshAtom } from '../features/coach/atoms.ts'

/** The coach's journal in the sidebar: the writer profile it keeps, and the words learned from it. */
export function CoachJournal() {
  const journal = useAtomValue(journalAtom)
  const [fresh, setFresh] = useAtom(profileFreshAtom)
  const load = useAtomSet(loadJournalAtom)

  useEffect(() => {
    load()
  }, [load])

  // the writer has seen the new profile once the tab is open
  useEffect(() => {
    if (!fresh) return

    const timer = window.setTimeout(() => setFresh(false), 4000)

    return () => window.clearTimeout(timer)
  }, [fresh, setFresh])

  if (journal === null) {
    return (
      <p className="px-4 py-2 text-xs leading-relaxed text-ink-faint" data-testid="journal-offline">
        The coach’s journal lives on the local dev server. Start it with <code>pnpm dev</code>.
      </p>
    )
  }

  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4" data-testid="journal">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-ink-faint uppercase">
          Your profile
          {fresh ? <span className="rounded-full bg-accent/15 px-1.5 text-[10px] tracking-normal text-accent normal-case">updated</span> : null}
        </h3>
        {journal.profile === '' ? (
          <p className="text-xs leading-relaxed text-ink-faint">After a few notes the coach writes down your strengths and habits here, and reads them before every draft.</p>
        ) : (
          // the renderer escapes all HTML, so the string is safe to inject
          <div className="journal-profile" data-testid="journal-profile" dangerouslySetInnerHTML={{ __html: renderMarkdown(journal.profile) }} />
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold tracking-wider text-ink-faint uppercase">
          Word book <span className="tabular-nums">· {journal.words.length}</span>
        </h3>
        {journal.words.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-faint">Words you take from a word note land here, with the sentence you first used them in.</p>
        ) : (
          <ul className="space-y-3" data-testid="journal-words">
            {journal.words.map((entry) => (
              <li key={entry.word} className="text-xs leading-relaxed">
                <span className="font-bold text-ink">{entry.word}</span> <span className="text-ink-faint line-through">{entry.insteadOf}</span>
                <span className="block text-ink-soft">{entry.meaning}</span>
                <span className="block text-ink-faint italic">“{entry.sentence}”</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11px] break-all text-ink-faint">Saved as Markdown in {journal.directory}</p>
    </div>
  )
}
