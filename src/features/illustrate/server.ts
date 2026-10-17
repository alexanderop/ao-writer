import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'

import { illustrationPrompt } from '../../core/illustrate/prompt.ts'

/*
The illustration server function. It runs on the local dev server, which hands the prompt to the Codex CLI on the
writer's own login; the static GitHub Pages build has no server, so there the call fails and the action stays quiet.
*/

const Illustrate = Schema.Struct({ description: Schema.String, theme: Schema.Literals(['light', 'dark']) })

/** Has Codex draw a picture for a description, in the house style; resolves with the PNG as base64 or the reason it failed. */
export const illustrate = createServerFn({ method: 'POST' })
  .validator(Schema.toStandardSchemaV1(Illustrate))
  .handler(async ({ data }) => {
    const { renderWithCodex } = await import('./codex.ts')

    return renderWithCodex(illustrationPrompt(data.description, data.theme))
  })
