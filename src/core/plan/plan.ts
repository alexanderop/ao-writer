import { Option, Schema } from 'effect'

import type { TextEdit } from '../markdown/format.ts'

/*
The idea coach: the writer describes a post idea, the coach recommends a Hacker News post type and a structure, and once
the writer likes it, writes the title and the section headings. What it knows about Hacker News comes from
docs/HACKERNEWS.md: 8,820 stories with 300+ points against 24,000 with fewer than 5, Oct 2024 to Oct 2026.
*/

/** The kinds of post that reach the front page from a personal site, each with the recipe it usually follows. */
const POST_TYPES = [
  { name: 'Experience report', recipe: 'I or we did a concrete thing, here is what happened, with numbers', example: 'We saved $500k per year by rolling our own "S3"' },
  { name: 'Failure story', recipe: 'what I tried, where it broke, what I learned; honest about the mistake', example: 'I failed to recreate the 1996 Space Jam website with Claude' },
  { name: 'Deep dive', recipe: 'one specific, surprising thing explained all the way down', example: 'Australia/Lord_Howe is the weirdest timezone' },
  { name: 'Built it', recipe: 'a thing the reader can try or read the code of, and how it works', example: 'Show HN: A CSS-Only Terrain Generator' },
  { name: 'Thesis', recipe: 'one sharp claim in the title, argued with evidence and counter-arguments', example: 'Agents don’t need memory, they need documentation' },
  { name: 'Practical tip', recipe: 'a small trick or tool most readers do not know, shown in a minute', example: 'You already have a Git server' },
  { name: 'Field guide', recipe: 'principles learned the hard way, each with the story that taught it', example: 'Writing a good design document' },
] as const

const TYPE_NAMES = POST_TYPES.map((type) => type.name)

/** One section of the recommended structure: what it is called for now, and what it has to do for the reader. */
const Section = Schema.Struct({ name: Schema.String, purpose: Schema.String })

/** The coach's recommendation for an idea. */
export const Plan = Schema.Struct({
  type: Schema.Literals(TYPE_NAMES),
  angle: Schema.String,
  why: Schema.String,
  risk: Schema.String,
  sections: Schema.Array(Section),
})

export type Plan = typeof Plan.Type

/** A title the coach offers, with what makes it work. */
const Title = Schema.Struct({ title: Schema.String, why: Schema.String })

/** The title options and one heading per section of the plan. */
export const Headlines = Schema.Struct({ titles: Schema.Array(Title), headings: Schema.Array(Schema.String) })

export type Headlines = typeof Headlines.Type

const decodePlan = Schema.decodeUnknownOption(Schema.fromJsonString(Plan))

const decodeHeadlines = Schema.decodeUnknownOption(Schema.fromJsonString(Headlines))

/** Hacker News cuts titles at this many characters. */
export const TITLE_LIMIT = 80

const TYPES_TEXT = POST_TYPES.map((type) => `- ${type.name}: ${type.recipe}. Example title: "${type.example}"`).join('\n')

/** How the idea coach behaves; told once, when an idea's session starts. */
export const PLAN_INSTRUCTIONS = `You are an editor who helps a writer turn an idea into a blog post that does well on Hacker News. You know what that audience rewards: technical depth, first-hand experience, real numbers, honesty about trade-offs, and no marketing tone. They punish hype, vague claims, and posts that bury the point.

These post types reach the front page from personal sites:
${TYPES_TEXT}

What 8,820 stories with 300+ points show, compared with stories that got fewer than 5:
- Titles are short: a median of 8 words and 48 characters. Hacker News cuts at ${TITLE_LIMIT} characters.
- Titles that start in the first person ("I", "We", "My") are about twice as common among the hits, when the post is a real experience.
- Concrete numbers help ($500k, 25 lines, a year of): titles with a digit are a third more common among the hits.
- Colons and subtitles are rarer among the hits (about half as common), and so are questions as titles. Exclamation marks almost never make it.
- Plain and literal beats clever: say what the post is. The site's guidelines forbid clickbait, uppercase for emphasis, and saying how great something is; moderators rewrite such titles. No listicle numbers ("10 ways to").
- "Show HN: <name> – <what it does in plain words>" only for something readers can try right now.

Structure that works for this audience:
- The point or result in the first paragraph; readers decide on the first screen.
- Concrete detail: code, numbers, screenshots, the actual commands.
- A section on limits, trade-offs or what did not work; commenters go for overclaims first.
- An ending that adds something (what you would do differently, open questions), not a summary.

Answer in the language the writer uses, but write titles and headings in English, since Hacker News is English. Speak to the writer as "you". Never guess their gender or name.

Reply with JSON only, no code fence.`

/** The first ask: recommend a type and a structure for the idea. */
export function planPrompt(idea: string): string {
  return `The writer's idea:
<idea>
${idea.trim()}
</idea>

Pick the post type that gives this idea the best chance on Hacker News, and recommend a structure of three to six sections in reading order. Reply in this shape:
{"type": "<one of: ${TYPE_NAMES.join(', ')}>", "angle": "<one sentence: the specific angle that makes it worth a click>", "why": "<at most three sentences: why this type and angle fit this idea and this audience>", "risk": "<one sentence: what would make Hacker News readers dismiss it, and how to avoid that>", "sections": [{"name": "<a working name, two to five words>", "purpose": "<one sentence: what this section must do for the reader>"}]}`
}

/** Asks for a different recommendation, with what the writer wants changed when they said so. */
export function revisePrompt(wish: string): string {
  const reason = wish.trim() === '' ? 'The writer wants a different angle: pick another type or a clearly different angle than before.' : `The writer wants this changed:\n<wish>\n${wish.trim()}\n</wish>`

  return `${reason}

Reply with a new recommendation in the same JSON shape as before.`
}

/** Asks for the title options and section headings for the plan the writer accepted. */
export function headlinesPrompt(plan: Plan): string {
  return `The writer likes this plan:
${JSON.stringify(plan)}

Write five title options for Hacker News, best first, each at most ${TITLE_LIMIT} characters and different in approach, and one heading per section, in the same order (${plan.sections.length} headings). Headings are short and concrete; they tell a skimming reader what the section gives them. Reply in this shape:
{"titles": [{"title": "<the title>", "why": "<at most twelve words: what makes it work>"}], "headings": ["<heading>"]}`
}

/** The JSON object in a reply, tolerating prose or a fence around it. */
function jsonIn(reply: string): string {
  return reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)
}

/** The plan in the coach's reply, or null when the reply was not one. */
export function parsePlan(reply: string): Plan | null {
  return decodePlan(jsonIn(reply)).pipe(
    Option.filter((plan) => plan.sections.length > 0 && plan.angle.trim() !== ''),
    Option.getOrNull,
  )
}

/** The headlines in the coach's reply, or null when the reply was not them. Titles over the limit are dropped. */
export function parseHeadlines(reply: string): Headlines | null {
  return decodeHeadlines(jsonIn(reply)).pipe(
    Option.map((headlines) => ({ ...headlines, titles: headlines.titles.filter((option) => option.title.trim() !== '' && option.title.length <= TITLE_LIMIT) })),
    Option.filter((headlines) => headlines.titles.length > 0 && headlines.headings.length > 0),
    Option.getOrNull,
  )
}

/** The outline as Markdown: the title, then each heading with what its section must do, as a line to write over. */
export function outlineMarkdown(title: string, headings: readonly string[], plan: Plan): string {
  const sections = headings.map((heading, index) => {
    const purpose = plan.sections[index]?.purpose.trim() ?? ''

    return purpose === '' ? `## ${heading}\n` : `## ${heading}\n\n_${purpose}_\n`
  })

  return `# ${title}\n\n${sections.join('\n')}`
}

/** The edit that puts the outline in place of an empty draft, or at the caret on a paragraph of its own; the caret lands at the end of the title. */
export function outlineEdit(text: string, at: number, title: string, outline: string): TextEdit {
  const empty = text.trim() === ''
  const from = empty ? 0 : at
  const to = empty ? text.length : at
  const head = text.slice(0, from)
  const gap = head === '' || head.endsWith('\n\n') ? '' : head.endsWith('\n') ? '\n' : '\n\n'
  const caret = from + gap.length + '# '.length + title.length

  return { from, to, insert: `${gap}${outline}`, selectionStart: caret, selectionEnd: caret }
}
