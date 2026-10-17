import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react'
import { Lightbulb, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { cn } from 'cn'

import { TITLE_LIMIT } from '../core/plan/plan.ts'
import type { Headlines, Plan } from '../core/plan/plan.ts'
import { shortcutLabel } from '../core/shortcuts.ts'
import { acceptPlanAtom, askPlanAtom, ideaAtom, insertOutlineAtom, planErrorAtom, planOpenAtom, planStepAtom, restartPlanAtom, revisePlanAtom } from '../features/plan/atoms.ts'

/** The writer describes an idea: Cmd+Enter or the button asks for a recommendation. */
function IdeaStep({ isMac }: { isMac: boolean }) {
  const [idea, setIdea] = useAtom(ideaAtom)
  const ask = useAtomSet(askPlanAtom)
  const ready = idea.trim() !== ''

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready) {
      event.preventDefault()
      ask(idea)
    }
  }

  return (
    <>
      <p className="text-xs leading-relaxed text-ink-soft">What do you want to write about? A few sentences are enough: the topic, what happened, what you found out.</p>
      <textarea
        autoFocus
        className="plan-input min-h-36"
        placeholder="I moved our CI from GitHub Actions to a $5 VPS and builds got 4× faster…"
        aria-label="Your idea"
        data-testid="plan-idea"
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="coach-chip coach-chip-accent" data-testid="plan-ask" disabled={!ready} onClick={() => ask(idea)}>
        Recommend a structure <span className="opacity-70">{isMac ? '⌘↩' : 'Ctrl+Enter'}</span>
      </button>
    </>
  )
}

/** The recommendation: type, angle, why, the risk, and the sections; the writer takes it, asks for another, or says what to change. */
function PlanStep({ plan }: { plan: Plan }) {
  const accept = useAtomSet(acceptPlanAtom)
  const revise = useAtomSet(revisePlanAtom)
  const restart = useAtomSet(restartPlanAtom)
  const [wish, setWish] = useState('')

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || wish.trim() === '') return

    event.preventDefault()
    revise(wish)
    setWish('')
  }

  return (
    <>
      <div className="space-y-1.5" data-testid="plan-recommendation">
        <span className="plan-type" data-testid="plan-type">
          {plan.type}
        </span>
        <p className="coach-text">{plan.angle}</p>
        <p className="text-xs leading-relaxed text-ink-soft">{plan.why}</p>
        <p className="text-xs leading-relaxed text-ink-soft">
          <span className="font-bold text-ink">Watch out:</span> {plan.risk}
        </p>
      </div>
      <ol className="plan-sections" data-testid="plan-sections">
        {plan.sections.map((section) => (
          <li key={section.name}>
            <span className="font-bold text-ink">{section.name}</span>
            <span className="block text-ink-soft">{section.purpose}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="coach-chip coach-chip-accent" data-testid="plan-accept" onClick={() => accept(plan)}>
          I like it: write the headlines
        </button>
        <button type="button" className="coach-chip" data-testid="plan-another" onClick={() => revise('')}>
          Another angle
        </button>
        <button type="button" className="coach-chip" data-testid="plan-restart" onClick={() => restart()}>
          New idea
        </button>
      </div>
      <input
        type="text"
        className="plan-input"
        placeholder="Or tell the coach what to change…"
        aria-label="What to change"
        data-testid="plan-wish"
        value={wish}
        onChange={(event) => setWish(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </>
  )
}

/** The title options and the headings; the writer picks a title and puts the outline into the document. */
function HeadlinesStep({ plan, headlines }: { plan: Plan; headlines: Headlines }) {
  const insert = useAtomSet(insertOutlineAtom)
  const setStep = useAtomSet(planStepAtom)
  const [chosen, setChosen] = useState(0)
  const title = headlines.titles[chosen]?.title ?? headlines.titles[0]?.title ?? ''

  return (
    <>
      <h3 className="plan-label">Title</h3>
      <ul className="space-y-1" role="radiogroup" aria-label="Title" data-testid="plan-titles">
        {headlines.titles.map((option, index) => (
          <li key={option.title}>
            <button type="button" role="radio" aria-checked={index === chosen} className="coach-word plan-title" data-testid="plan-title" onClick={() => setChosen(index)}>
              <span className="font-bold text-ink">{option.title}</span>
              {index === 0 ? <span className="coach-best">best bet</span> : null}
              <span className="block text-ink-soft">
                {option.why} <span className="tabular-nums text-ink-faint">· {option.title.length}/{TITLE_LIMIT}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="plan-label">Headings</h3>
      <ol className="plan-sections" data-testid="plan-headings">
        {headlines.headings.map((heading, index) => (
          <li key={`${index}-${heading}`}>
            <span className="font-bold text-ink">{heading}</span>
            <span className="block text-ink-soft">{plan.sections[index]?.purpose}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="coach-chip coach-chip-accent" data-testid="plan-insert" onClick={() => insert(title)}>
          Insert outline
        </button>
        <button type="button" className="coach-chip" data-testid="plan-back" onClick={() => setStep({ kind: 'plan', plan })}>
          Back to the plan
        </button>
      </div>
    </>
  )
}

/** The idea coach: describe an idea, get a Hacker News post type and structure, then the title and headings. */
export function PlanPanel({ isMac }: { isMac: boolean }) {
  const [open, setOpen] = useAtom(planOpenAtom)
  const step = useAtomValue(planStepAtom)
  const error = useAtomValue(planErrorAtom)

  useEffect(() => {
    if (!open) return

    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  return (
    <aside className="plan-panel animate-in fade-in slide-in-from-right-2 duration-300" aria-label="Idea coach" data-testid="plan-panel" data-step={step.kind}>
      <header className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-ink-faint uppercase">
        <Lightbulb className="size-3" />
        Idea coach
        <span className="font-normal tracking-normal normal-case">· for Hacker News</span>
        <button type="button" className="ml-auto rounded p-0.5 hover:bg-ink/8 hover:text-ink" aria-label={`Close (${shortcutLabel('plan', isMac)})`} data-testid="plan-close" onClick={() => setOpen(false)}>
          <X className="size-3.5" />
        </button>
      </header>
      <div className={cn('-mr-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2', step.kind === 'thinking' && 'opacity-90')}>
        {step.kind === 'idea' ? <IdeaStep isMac={isMac} /> : null}
        {step.kind === 'thinking' ? (
          <p className="plan-thinking" role="status" data-testid="plan-thinking">
            <span className="coach-dot" data-state="thinking">
              <span />
            </span>
            {step.for === 'plan' ? 'Reading your idea…' : 'Writing titles and headings…'}
          </p>
        ) : null}
        {step.kind === 'plan' ? <PlanStep plan={step.plan} /> : null}
        {step.kind === 'headlines' ? <HeadlinesStep plan={step.plan} headlines={step.headlines} /> : null}
        {error === null ? null : (
          <p className="text-xs text-pos-verb" role="alert" data-testid="plan-error">
            {error}
          </p>
        )}
      </div>
    </aside>
  )
}
