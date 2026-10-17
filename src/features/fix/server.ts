import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'

import { FIX_INSTRUCTIONS, fixPrompt, parseFixes } from '../../core/fix/fix.ts'

/*
The proofreader's server function. It shares the coaches' ACP connection on the local dev server; every run is a fresh
session, so an earlier draft never leaks into the fixes. The static build has no server, so there the call fails.
*/

const Ask = Schema.Struct({ key: Schema.String, text: Schema.String })

/** Has the agent list the spelling and grammar fixes for a text. */
export const askFixes = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Ask))
  .handler(async ({ data }) => {
    const { coachConnection } = await import('../coach/acp.ts')

    return { fixes: parseFixes(await coachConnection().prompt(data.key, FIX_INSTRUCTIONS, fixPrompt(data.text))) }
  })
