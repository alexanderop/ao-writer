import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'

import { headlinesPrompt, parseHeadlines, parsePlan, Plan, PLAN_INSTRUCTIONS, planPrompt, revisePrompt } from '../../core/plan/plan.ts'

/*
The idea coach's server functions. They share the writing coach's ACP connection on the local dev server; each idea is
its own session, so "another angle" knows which angles it already offered. The static build has no server, so there
every call fails and the panel says the coach is out of reach.
*/

const Ask = Schema.Struct({ key: Schema.String, idea: Schema.String })

/** Has the coach recommend a post type and a structure for an idea. */
export const askPlan = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Ask))
  .handler(async ({ data }) => {
    const { coachConnection } = await import('../coach/acp.ts')

    return { plan: parsePlan(await coachConnection().prompt(data.key, PLAN_INSTRUCTIONS, planPrompt(data.idea))) }
  })

const Revise = Schema.Struct({ key: Schema.String, wish: Schema.String })

/** Has the coach recommend again, differently or with the writer's wish. */
export const revisePlan = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Revise))
  .handler(async ({ data }) => {
    const { coachConnection } = await import('../coach/acp.ts')

    return { plan: parsePlan(await coachConnection().prompt(data.key, PLAN_INSTRUCTIONS, revisePrompt(data.wish))) }
  })

const Accept = Schema.Struct({ key: Schema.String, plan: Plan })

/** Has the coach write title options and section headings for the plan the writer accepted. */
export const askHeadlines = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Accept))
  .handler(async ({ data }) => {
    const { coachConnection } = await import('../coach/acp.ts')

    return { headlines: parseHeadlines(await coachConnection().prompt(data.key, PLAN_INSTRUCTIONS, headlinesPrompt(data.plan))) }
  })
