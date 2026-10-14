import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

import type { CodeToken } from '../../core/markdown/code.ts'
import { loadLanguage } from './languages.ts'
import type { LanguageId } from './languages.ts'

// The only module that imports Shiki. The highlighter service loads it with a dynamic import, so none of
// this reaches the first page load. The JavaScript regex engine keeps WebAssembly out of the build.
const LIGHT_THEME = 'vitesse-light'

const DARK_THEME = 'github-dark-dimmed'

const highlighter = createHighlighterCore({
  themes: [import('shiki/themes/vitesse-light.mjs'), import('shiki/themes/github-dark-dimmed.mjs')],
  langs: [],
  engine: createJavaScriptRegexEngine(),
})

/** A colour equal to the theme's plain text colour is stored as null, so it follows the page's text colour. */
function toneOf(color: string | undefined, plain: string): string | null {
  return color === undefined || color.toLowerCase() === plain.toLowerCase() ? null : color
}

/** Colours `code` with both themes at once; each token carries its light and dark colour as CSS variables. */
export async function tokenize(code: string, language: LanguageId): Promise<readonly CodeToken[]> {
  const shiki = await highlighter

  await shiki.loadLanguage(loadLanguage(language))

  const light = shiki.getTheme(LIGHT_THEME).fg
  const dark = shiki.getTheme(DARK_THEME).fg
  const { tokens } = shiki.codeToTokens(code, { lang: language, themes: { light: LIGHT_THEME, dark: DARK_THEME }, defaultColor: false })

  return tokens.flatMap((line) =>
    line.map((token) => ({
      start: token.offset,
      end: token.offset + token.content.length,
      light: toneOf(token.htmlStyle?.['--shiki-light'], light),
      dark: toneOf(token.htmlStyle?.['--shiki-dark'], dark),
    })),
  )
}
