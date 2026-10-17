import { describe, expect, it } from 'vitest'

import { headlinesPrompt, outlineEdit, outlineMarkdown, parseHeadlines, parsePlan, planPrompt, revisePrompt, TITLE_LIMIT } from './plan.ts'

const plan = {
  type: 'Experience report',
  angle: 'A solo dev replaced a SaaS bill with 200 lines of Go.',
  why: 'First-hand, with a number.',
  risk: 'Reads as an ad if the cost math is vague.',
  sections: [
    { name: 'The bill', purpose: 'Open with the number that hurt.' },
    { name: 'What I built', purpose: 'Show the code that replaced it.' },
  ],
} as const

const headlines = { titles: [{ title: 'I replaced a $900/month SaaS with 200 lines of Go', why: 'First person, two numbers.' }], headings: ['The $900 bill', '200 lines of Go'] }

describe('parsePlan', () => {
  it('reads a bare JSON plan', () => {
    expect(parsePlan(JSON.stringify(plan))).toEqual(plan)
  })

  it('reads a plan wrapped in a fence or prose', () => {
    expect(parsePlan(`Here:\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``)).toEqual(plan)
  })

  it('is null for a post type it does not know', () => {
    expect(parsePlan(JSON.stringify({ ...plan, type: 'Listicle' }))).toBeNull()
  })

  it('is null without sections or an angle', () => {
    expect(parsePlan(JSON.stringify({ ...plan, sections: [] }))).toBeNull()
    expect(parsePlan(JSON.stringify({ ...plan, angle: ' ' }))).toBeNull()
    expect(parsePlan('no json here')).toBeNull()
  })
})

describe('parseHeadlines', () => {
  it('reads titles and headings', () => {
    expect(parseHeadlines(JSON.stringify(headlines))).toEqual(headlines)
  })

  it('drops titles Hacker News would cut, and is null when none is left', () => {
    const long = { title: 'x'.repeat(TITLE_LIMIT + 1), why: 'Too long.' }

    expect(parseHeadlines(JSON.stringify({ ...headlines, titles: [long, ...headlines.titles] }))?.titles).toEqual(headlines.titles)
    expect(parseHeadlines(JSON.stringify({ ...headlines, titles: [long] }))).toBeNull()
  })

  it('is null without headings', () => {
    expect(parseHeadlines(JSON.stringify({ ...headlines, headings: [] }))).toBeNull()
  })
})

describe('outlineMarkdown', () => {
  it('writes the title, each heading and what its section must do', () => {
    expect(outlineMarkdown('My title', headlines.headings, plan)).toBe('# My title\n\n## The $900 bill\n\n_Open with the number that hurt._\n\n## 200 lines of Go\n\n_Show the code that replaced it._\n')
  })

  it('leaves the purpose out for a heading the plan has no section for', () => {
    expect(outlineMarkdown('T', ['A', 'B', 'Extra'], plan)).toMatch(/## Extra\n$/)
  })
})

describe('outlineEdit', () => {
  const outline = '# Title\n\n## A\n'

  it('replaces a draft that is only whitespace', () => {
    expect(outlineEdit('  \n', 2, 'Title', outline)).toEqual({ from: 0, to: 3, insert: outline, selectionStart: 7, selectionEnd: 7 })
  })

  it('starts a paragraph of its own after text at the caret', () => {
    expect(outlineEdit('Notes', 5, 'Title', outline)).toMatchObject({ from: 5, to: 5, insert: `\n\n${outline}`, selectionStart: 14 })
    expect(outlineEdit('Notes\n', 6, 'Title', outline).insert).toBe(`\n${outline}`)
    expect(outlineEdit('Notes\n\n', 7, 'Title', outline).insert).toBe(outline)
  })
})

describe('prompts', () => {
  it('puts the idea in the first ask', () => {
    expect(planPrompt('  my idea  ')).toContain('<idea>\nmy idea\n</idea>')
  })

  it('asks for another angle without a wish, and passes the wish on with one', () => {
    expect(revisePrompt('')).toContain('different angle')
    expect(revisePrompt('shorter')).toContain('<wish>\nshorter\n</wish>')
  })

  it('asks for one heading per section', () => {
    expect(headlinesPrompt(plan)).toContain('(2 headings)')
  })
})
