import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react'
import { ArrowLeft, BookOpen, Check, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { correctAnswer, maskedSentence, practiceQueue, rememberWord, reviewCard } from '../core/learn/practice.ts'
import type { Card, PracticeWord } from '../core/learn/practice.ts'
import { journalAtom, loadJournalAtom } from '../features/coach/atoms.ts'
import { learningAtom, learningOpenAtom } from '../features/learn/atoms.ts'
import { prepareWord } from '../features/learn/server.ts'
import { Button } from '../shared/ui/button.tsx'

const FIELD = 'w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent'

/** A first answer determines the schedule; copying or retrying never counts as recall. */
function Exercise({ card, position, total, onGrade, onNext }: {
  card: Card; position: number; total: number; onGrade: (recalled: boolean) => void; onNext: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [helped, setHelped] = useState(false)
  const [graded, setGraded] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  const grade = (correct: boolean): void => {
    if (!graded) { onGrade(correct && !helped); setGraded(true) }

    setFeedback(correct ? 'correct' : 'wrong')

    if (!correct) setHelped(true)
  }

  return (
    <section className="rounded-xl border border-rule bg-panel p-6 sm:p-8" aria-label="Typing exercise">
      <p className="text-xs text-ink-faint">{position} of {total} · German → English</p>
      <h2 className="mt-5 text-2xl font-bold text-ink" lang="de">{card.german}</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{maskedSentence(card)}</p>
      <p className="mt-4 text-xs text-ink-faint">Type the English word that fits this sentence.</p>
      {feedback === null ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => {
          event.preventDefault()

          if (answer.trim() !== '') grade(correctAnswer(card, answer))
        }}>
          <label className="block space-y-2 text-xs text-ink-soft">
            <span>Your English answer</span>
            <input ref={input} className={FIELD} value={answer} onChange={(event) => setAnswer(event.target.value)} lang="en" autoComplete="off" autoCapitalize="off" spellCheck={false} autoCorrect="off" required />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={answer.trim() === ''}>Check answer</Button>
            <Button type="button" variant="ghost" onClick={() => { setHelped(true); grade(false) }}>Show answer</Button>
          </div>
        </form>
      ) : (
        <div className="mt-5 space-y-4">
          <div role="status" className="space-y-2 text-sm">
            <p className="font-bold text-ink">{feedback === 'correct' ? helped ? 'Correct on the retry.' : 'Correct!' : 'Let’s practise this spelling.'}</p>
            {feedback === 'wrong' && answer !== '' ? <p className="text-ink-faint">You typed: <span className="line-through">{answer}</span></p> : null}
            <p className="text-lg font-bold text-ink">{card.word}</p>
            <p className="text-ink-soft">{card.explanation}</p>
            <p className="text-xs text-ink-faint">{helped ? 'We’ll review this again tomorrow.' : 'Saved. Your next review is spaced further apart as you remember it.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {feedback === 'wrong' ? <Button onClick={() => { setAnswer(''); setFeedback(null); requestAnimationFrame(() => input.current?.focus()) }}>Try typing it again</Button> : null}
            <Button variant={feedback === 'wrong' ? 'ghost' : 'default'} onClick={onNext}>{position === total ? 'Finish session' : 'Next word'}</Button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Vocabulary, personal spelling history and short offline review sessions. */
export function Learn() {
  const [learning, setLearning] = useAtom(learningAtom)
  const close = useAtomSet(learningOpenAtom)
  const journal = useAtomValue(journalAtom)
  const loadJournal = useAtomSet(loadJournalAtom)
  const [session, setSession] = useState<readonly Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [english, setEnglish] = useState('')
  const [german, setGerman] = useState('')
  const [sentence, setSentence] = useState('')
  const [preparing, setPreparing] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const due = practiceQueue(learning.cards, Date.now())
  const dueCount = learning.cards.filter((card) => card.due <= Date.now()).length
  const current = session?.[index]
  const nextDue = learning.cards.toSorted((a, b) => a.due - b.due)[0]

  useEffect(() => { loadJournal() }, [loadJournal])

  const add = (entry: PracticeWord): void => {
    setLearning((state) => ({ ...state, cards: rememberWord(state.cards, entry, Date.now()) }))
    setMessage(`“${entry.word}” is ready to practise.`)
  }

  const importWord = async (word: string, context: string): Promise<void> => {
    setPreparing(word)
    setMessage('')

    try { add(await prepareWord({ data: { word, sentence: context } })) }
    catch { setMessage('Could not prepare a German prompt. Try again with the local server and Claude Code login, or add the word manually below.') }
    finally { setPreparing(null) }
  }

  return (
    <section className="h-full w-full overflow-y-auto px-5 pt-20 pb-20 sm:px-10" aria-label="Learn English">
      <div className="mx-auto max-w-2xl space-y-7">
        <header className="space-y-3">
          <button type="button" className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink" onClick={() => close(false)}><ArrowLeft className="size-3.5" />Back to writing</button>
          <div className="flex items-center gap-3"><BookOpen className="size-6 text-accent" /><h1 className="text-3xl font-bold text-ink">Learn English</h1></div>
          <p className="text-sm leading-relaxed text-ink-soft">Your words. Your spelling habits. A little practice, built from what you write.</p>
        </header>

        {session !== null ? current ? (
          <>
            <Exercise key={`${index}:${current.id}`} card={current} position={index + 1} total={session.length}
              onGrade={(recalled) => {
                setLearning((state) => ({ ...state, cards: state.cards.map((card) => card.id === current.id ? reviewCard(card, recalled, Date.now()) : card) }))

                if (recalled) setScore((value) => value + 1)
              }} onNext={() => setIndex((value) => value + 1)} />
            <Button variant="ghost" onClick={() => setSession(null)}>End practice</Button>
          </>
        ) : (
          <section className="space-y-4 rounded-xl border border-rule bg-panel p-6" aria-label="Practice complete">
            <Check className="size-6 text-accent" />
            <h2 className="text-xl font-bold text-ink">Practice complete</h2>
            <p className="text-sm text-ink-soft">You remembered {score} of {session.length} words without help. Your reviews are saved.</p>
            <Button onClick={() => setSession(null)}>Back to your words</Button>
          </section>
        ) : (
          <>
            <section className="space-y-4 rounded-xl border border-rule bg-panel p-6">
              <div className="flex items-baseline justify-between gap-3"><h2 className="text-lg font-bold text-ink">A few words for today</h2><span className="text-xs text-ink-faint">{learning.cards.length} saved · {dueCount} due</span></div>
              <p className="text-sm leading-relaxed text-ink-soft">{learning.cards.length === 0 ? 'Add your first word below, or let the coach remember spelling corrections. You’ll see a German meaning and type the English word yourself.' : due.length === 0 ? `You’re caught up. Next review: ${nextDue ? new Date(nextDue.due).toLocaleDateString() : 'soon'}.` : 'Practise up to five words. Difficult spellings come first; words you remember return after longer gaps.'}</p>
              <Button disabled={due.length === 0} onClick={() => { setSession(due); setIndex(0); setScore(0) }}>Start practice{due.length > 0 ? ` · ${due.length} words` : ''}</Button>
            </section>

            <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
              <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={learning.rememberCorrections} onChange={(event) => setLearning((state) => ({ ...state, rememberCorrections: event.target.checked }))} />
              <span>Learn from corrections I accept<span className="mt-1 block text-xs leading-relaxed text-ink-faint">When you run Fix spelling and grammar, save English spelling corrections with a German prompt. Repeated mistakes update the same word. You can remove one-off typos below.</span></span>
            </label>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-ink">Add a new word</h2>
              <form aria-label="Add a new word" className="space-y-3" onSubmit={(event) => {
                event.preventDefault()

                if (english.trim() === '' || german.trim() === '') return
                add({ word: english.trim(), german: german.trim(), sentence: sentence.trim(), explanation: '' })
                setEnglish(''); setGerman(''); setSentence('')
              }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs text-ink-soft"><span>English word</span><input className={FIELD} value={english} onChange={(event) => setEnglish(event.target.value)} required maxLength={80} /></label>
                  <label className="space-y-1.5 text-xs text-ink-soft"><span>German meaning</span><input className={FIELD} value={german} onChange={(event) => setGerman(event.target.value)} required maxLength={160} /></label>
                </div>
                <label className="block space-y-1.5 text-xs text-ink-soft"><span>Example sentence (optional)</span><input className={FIELD} value={sentence} onChange={(event) => setSentence(event.target.value)} maxLength={300} /></label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="outline"><Plus />Add to practice</Button>
                  <Button type="button" variant="ghost" disabled={english.trim() === '' || preparing !== null} onClick={() => { void importWord(english.trim(), sentence) }}>{preparing === english.trim() ? 'Preparing…' : 'Prepare with coach'}</Button>
                </div>
                <p className="text-xs text-ink-faint">Fill in both languages yourself, or enter an English word and let the coach prepare its German meaning and example.</p>
              </form>
            </section>

            {journal !== null && journal.words.some((word) => !learning.cards.some((card) => card.id === word.word.trim().toLowerCase())) ? (
              <section className="space-y-3">
                <h2 className="text-lg font-bold text-ink">From your word book</h2>
                <p className="text-xs text-ink-soft">Prepare a German prompt for words you picked up from the coach.</p>
                <ul className="space-y-2">{journal.words.filter((word) => !learning.cards.some((card) => card.id === word.word.trim().toLowerCase())).map((word) => (
                  <li key={word.word} className="flex items-center justify-between gap-3 text-sm text-ink"><span>{word.word}</span><Button size="sm" variant="outline" disabled={preparing !== null} onClick={() => { void importWord(word.word, word.sentence) }}>{preparing === word.word ? 'Preparing…' : 'Add to practice'}</Button></li>
                ))}</ul>
              </section>
            ) : null}

            <p role="status" className="text-sm text-ink-soft">{message}</p>

            {learning.cards.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-lg font-bold text-ink">Your practice book</h2>
                <ul className="divide-y divide-rule">{learning.cards.map((card) => (
                  <li key={card.id} className="flex items-start justify-between gap-3 py-4">
                    <div className="space-y-1 text-sm"><p className="font-bold text-ink">{card.word} <span className="font-normal text-ink-soft">· {card.german}</span></p>
                      {card.mistakes.length > 0 ? <p className="text-xs text-ink-faint">Previously: {card.mistakes.join(', ')} · corrected {card.occurrences} {card.occurrences === 1 ? 'time' : 'times'}</p> : null}
                      <p className="text-xs text-ink-faint">{card.due <= Date.now() ? 'Ready to practise' : `Review ${new Date(card.due).toLocaleDateString()}`} · {card.streak} remembered in a row</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${card.word} from practice`} onClick={() => setLearning((state) => ({ ...state, cards: state.cards.filter((entry) => entry.id !== card.id) }))}><Trash2 /></Button>
                  </li>
                ))}</ul>
              </section>
            ) : null}
            <p className="text-xs text-ink-faint">Spelling & vocabulary · Saved in this browser. Practice works offline; preparing coach prompts needs the local server.</p>
          </>
        )}
      </div>
    </section>
  )
}
