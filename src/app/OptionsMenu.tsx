import { useAtom } from '@effect/atom-react'
import { Minus, Plus, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from 'cn'

import { settingsAtom } from '../features/settings/atoms.ts'
import { FONT_SIZE, resizedFont, typewriterActive } from '../features/settings/settings.ts'
import type { Settings } from '../features/settings/settings.ts'
import { Button } from '#/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '#/shared/ui/popover'

interface BooleanKey {
  readonly key: 'nouns' | 'verbs' | 'adjectives' | 'adverbs' | 'conjunctions' | 'fillers' | 'cliches' | 'redundancies' | 'typewriter' | 'vim'
  readonly label: string
  readonly swatch?: string
}

const SYNTAX_ROWS: readonly BooleanKey[] = [
  { key: 'nouns', label: 'Nouns', swatch: 'bg-pos-noun' },
  { key: 'verbs', label: 'Verbs', swatch: 'bg-pos-verb' },
  { key: 'adjectives', label: 'Adjectives', swatch: 'bg-pos-adj' },
  { key: 'adverbs', label: 'Adverbs', swatch: 'bg-pos-adv' },
  { key: 'conjunctions', label: 'Conjunctions', swatch: 'bg-pos-conj' },
]

const STYLE_ROWS: readonly BooleanKey[] = [
  { key: 'fillers', label: 'Fillers' },
  { key: 'cliches', label: 'Clichés' },
  { key: 'redundancies', label: 'Redundancies' },
]

const TYPEFACE_OPTIONS: readonly { readonly value: Settings['typeface']; readonly label: string }[] = [
  { value: 'duo', label: 'Duo' },
  { value: 'mono', label: 'Mono' },
  { value: 'quattro', label: 'Quattro' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-rule pb-3 last:border-b-0 last:pb-0">
      <h3 className="text-[11px] font-bold tracking-wider text-ink-faint uppercase">{title}</h3>
      {children}
    </section>
  )
}

interface SegmentedProps<T extends string> {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onChange: (value: T) => void
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-ink/6 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={cn('flex-1 rounded px-2 py-1 text-xs transition-colors', option.value === value ? 'bg-paper text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface CheckRowProps {
  readonly row: BooleanKey
  readonly settings: Settings
  readonly checked?: boolean
  readonly disabled?: boolean
  readonly onToggle: (key: BooleanKey['key']) => void
}

function CheckRow({ row, settings, checked = settings[row.key], disabled = false, onToggle }: CheckRowProps) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={() => onToggle(row.key)} data-testid={`option-${row.key}`} />
      {row.swatch ? <span className={cn('size-2 rounded-full', row.swatch)} /> : null}
      {row.label}
    </label>
  )
}

/** Every setting that has no room in the status bar: scopes, categories, typeface and size. */
export function OptionsMenu() {
  const [settings, setSettings] = useAtom(settingsAtom)
  const patch = (changes: Partial<Settings>): void => setSettings((current) => ({ ...current, ...changes }))
  const toggle = (key: BooleanKey['key']): void => setSettings((current) => ({ ...current, [key]: !current[key] }))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Options" data-testid="options">
          <SlidersHorizontal />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-3" data-testid="options-menu">
        <Section title="Focus">
          <Segmented
            label="Focus scope"
            value={settings.focusScope}
            options={[
              { value: 'sentence', label: 'Sentence' },
              { value: 'paragraph', label: 'Paragraph' },
              { value: 'typewriter', label: 'Typewriter' },
            ]}
            onChange={(focusScope) => patch({ focusScope, focus: true })}
          />
          {/* focus mode centres the line itself; the box shows that, and keeps the writer's own choice for when focus ends */}
          <CheckRow row={{ key: 'typewriter', label: 'Typewriter scrolling' }} settings={settings} checked={typewriterActive(settings)} disabled={settings.focus} onToggle={toggle} />
        </Section>
        <Section title="Coach">
          <Segmented
            label="Coach"
            value={settings.coach}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'ask', label: 'When asked' },
              { value: 'pause', label: 'On pauses' },
            ]}
            onChange={(coach) => patch({ coach })}
          />
        </Section>
        <Section title="Keys">
          <CheckRow row={{ key: 'vim', label: 'Vim keybindings' }} settings={settings} onToggle={toggle} />
        </Section>
        <Section title="Syntax">
          {SYNTAX_ROWS.map((row) => (
            <CheckRow key={row.key} row={row} settings={settings} onToggle={toggle} />
          ))}
        </Section>
        <Section title="Style check">
          {STYLE_ROWS.map((row) => (
            <CheckRow key={row.key} row={row} settings={settings} onToggle={toggle} />
          ))}
        </Section>
        <Section title="Preview">
          <Segmented
            label="Preview layout"
            value={settings.previewLayout}
            options={[
              { value: 'split', label: 'Split' },
              { value: 'full', label: 'Full' },
            ]}
            onChange={(previewLayout) => patch({ previewLayout, preview: true })}
          />
        </Section>
        <Section title="Appearance">
          <Segmented
            label="Appearance"
            value={settings.theme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) => patch({ theme })}
          />
          <Segmented label="Typeface" value={settings.typeface} options={TYPEFACE_OPTIONS} onChange={(typeface) => patch({ typeface })} />
          <div className="flex items-center justify-between text-sm">
            <span>Text size</span>
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Smaller text" onClick={() => patch({ fontSize: resizedFont(settings.fontSize, 'smaller') })} disabled={settings.fontSize <= FONT_SIZE.min}>
                <Minus />
              </Button>
              <button type="button" className="w-10 text-center text-xs text-ink-soft hover:text-ink" aria-label="Normal text size" onClick={() => patch({ fontSize: FONT_SIZE.default })}>
                {settings.fontSize}px
              </button>
              <Button variant="ghost" size="icon-sm" aria-label="Bigger text" onClick={() => patch({ fontSize: resizedFont(settings.fontSize, 'bigger') })} disabled={settings.fontSize >= FONT_SIZE.max}>
                <Plus />
              </Button>
            </span>
          </div>
        </Section>
      </PopoverContent>
    </Popover>
  )
}
