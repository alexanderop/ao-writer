/*
 * The languages a fence can name. Each loader is a plain dynamic import, so Vite emits one chunk per
 * grammar and the browser fetches it, with the right base path, the first time a fence asks for it.
 */
const LOADERS = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
}

/** The grammars Shiki can load for AO Writer. */
export type LanguageId = keyof typeof LOADERS

/** Other names a fence may use for a grammar. */
const ALIASES: ReadonlyMap<string, LanguageId> = new Map([
  ['ts', 'typescript'],
  ['mts', 'typescript'],
  ['cts', 'typescript'],
  ['js', 'javascript'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['sh', 'shellscript'],
  ['bash', 'shellscript'],
  ['shell', 'shellscript'],
  ['zsh', 'shellscript'],
  ['py', 'python'],
  ['rs', 'rust'],
  ['golang', 'go'],
  ['yml', 'yaml'],
  ['md', 'markdown'],
  ['patch', 'diff'],
])

const IDS: ReadonlySet<string> = new Set(Object.keys(LOADERS))

function isLanguageId(name: string): name is LanguageId {
  return IDS.has(name)
}

/** The grammar a fence's language names, or null when AO Writer has none for it (the code stays plain). */
export function resolveLanguage(lang: string): LanguageId | null {
  const name = lang.toLowerCase()

  return ALIASES.get(name) ?? (isLanguageId(name) ? name : null)
}

/** Loads the grammar (and the grammars it embeds). */
export function loadLanguage(id: LanguageId) {
  return LOADERS[id]()
}
