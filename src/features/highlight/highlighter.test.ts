import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { codeBlockKey } from '../../core/markdown/code.ts'
import type { CodeBlock, CodeToken } from '../../core/markdown/code.ts'
import { renderMarkdown } from '../../core/markdown/render.ts'
import { CodeHighlighter } from './highlighter.ts'
import type { Tokenizer } from './highlighter.ts'
import { resolveLanguage } from './languages.ts'

function tokenize(block: CodeBlock): Promise<readonly CodeToken[] | null> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const highlighter = yield* CodeHighlighter

      return yield* highlighter.tokenize(block)
    }).pipe(Effect.provide(CodeHighlighter.layerShiki)),
  )
}

const SNIPPET: CodeBlock = { lang: 'ts', code: 'const answer: number = 42\n\nexport function greet(name: string) {\n  return `hi ${name}`\n}' }

describe('given the Shiki highlighter', () => {
  it('should return coloured tokens for a ts snippet', async () => {
    const tokens = await tokenize(SNIPPET)

    expect(tokens).not.toBeNull()

    const keyword = tokens?.find((token) => SNIPPET.code.slice(token.start, token.end) === 'const')

    expect(keyword?.light).toMatch(/^#[0-9a-f]{6}$/i)
    expect(keyword?.dark).toMatch(/^#[0-9a-f]{6}$/i)
    expect(keyword?.light).not.toBe(keyword?.dark)
  })

  it('should keep every token inside the code and in order', async () => {
    const tokens = (await tokenize(SNIPPET)) ?? []

    expect(tokens.length).toBeGreaterThan(10)

    let at = 0

    for (const token of tokens) {
      expect(token.start).toBeGreaterThanOrEqual(at)
      expect(token.end).toBeGreaterThan(token.start)
      expect(token.end).toBeLessThanOrEqual(SNIPPET.code.length)
      at = token.end
    }
  })

  it('should give an alias the tokens of its language', async () => {
    expect(await tokenize({ lang: 'typescript', code: SNIPPET.code })).toEqual(await tokenize(SNIPPET))
  })

  it('should fall back to plain text for an unknown language', async () => {
    expect(await tokenize({ lang: 'brainfuck', code: '+++[->+<]' })).toBeNull()
  })

  it('should colour every shipped language with the JavaScript regex engine', async () => {
    const samples = ['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'vue', 'bash', 'sh', 'shell', 'python', 'rust', 'go', 'sql', 'yaml', 'markdown', 'diff']

    for (const lang of samples) {
      const tokens = await tokenize({ lang, code: 'one = "two"\n# three' })

      expect(tokens, lang).not.toBeNull()
      expect(tokens?.length, lang).toBeGreaterThan(0)
    }
  })
})

describe('given the preview with real tokens', () => {
  async function preview(source: string, block: CodeBlock): Promise<string> {
    const tokens = await tokenize(block)

    return renderMarkdown(source, new Map([[codeBlockKey(block), tokens ?? []]]))
  }

  it('should render a ts fence with Shiki token spans', async () => {
    const block: CodeBlock = { lang: 'ts', code: 'const a = 1' }
    const html = await preview('```ts\nconst a = 1\n```', block)

    expect(html).toMatch(/<span style="--shiki-light:#[0-9a-f]{6};--shiki-dark:#[0-9a-f]{6}">const<\/span>/i)
    expect(html.replace(/<[^>]+>/g, '')).toBe('const a = 1\n')
  })

  it('should escape a script tag inside a fence', async () => {
    const block: CodeBlock = { lang: 'ts', code: '<script>alert("x")</script>' }
    const html = await preview('```ts\n<script>alert("x")</script>\n```', block)

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;')
    expect(html).toContain('script')
    expect(html.replace(/<[^>]+>/g, '')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\n')
  })

  it('should escape a script tag inside a plain fence too', () => {
    expect(renderMarkdown('```ts\n<script>alert(1)</script>\n```')).not.toContain('<script')
  })
})

describe('given the per-block cache', () => {
  function counting() {
    const calls: string[] = []

    const tokenizer: Tokenizer = (code) => {
      calls.push(code)

      return Promise.resolve([{ start: 0, end: code.length, light: '#111111', dark: '#eeeeee' }])
    }

    return { layer: CodeHighlighter.layerWith(tokenizer), calls }
  }

  it('should not tokenise an unchanged block again', async () => {
    const { layer, calls } = counting()

    await Effect.runPromise(
      Effect.gen(function* () {
        const highlighter = yield* CodeHighlighter

        yield* highlighter.tokenize({ lang: 'ts', code: 'let a' })
        yield* highlighter.tokenize({ lang: 'ts', code: 'let a' })
        yield* highlighter.tokenize({ lang: 'ts', code: 'let b' })
        yield* highlighter.tokenize({ lang: 'ts', code: 'let a' })
      }).pipe(Effect.provide(layer)),
    )

    expect(calls).toEqual(['let a', 'let b'])
  })

  it('should key the cache by language as well as code', async () => {
    const { layer, calls } = counting()

    await Effect.runPromise(
      Effect.gen(function* () {
        const highlighter = yield* CodeHighlighter

        yield* highlighter.tokenize({ lang: 'ts', code: 'x' })
        yield* highlighter.tokenize({ lang: 'js', code: 'x' })
      }).pipe(Effect.provide(layer)),
    )

    expect(calls).toHaveLength(2)
  })

  it('should not call the tokenizer for an unknown language', async () => {
    const { layer, calls } = counting()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const highlighter = yield* CodeHighlighter

        return yield* highlighter.tokenize({ lang: 'klingon', code: 'x' })
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('should treat a failing tokenizer as plain text and retry next time', async () => {
    let attempts = 0

    const tokenizer: Tokenizer = (code) => {
      attempts += 1

      return attempts === 1 ? Promise.reject(new Error('chunk failed to load')) : Promise.resolve([{ start: 0, end: code.length, light: '#111111', dark: null }])
    }

    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const highlighter = yield* CodeHighlighter
        const first = yield* highlighter.tokenize({ lang: 'ts', code: 'x' })
        const second = yield* highlighter.tokenize({ lang: 'ts', code: 'x' })

        return { first, second }
      }).pipe(Effect.provide(CodeHighlighter.layerWith(tokenizer))),
    )

    expect(results.first).toBeNull()
    expect(results.second).toHaveLength(1)
  })
})

describe('given a fence language', () => {
  it('should resolve the names and aliases the writer expects', () => {
    for (const lang of ['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'vue', 'bash', 'sh', 'shell', 'python', 'rust', 'go', 'sql', 'yaml', 'markdown', 'diff', 'TS']) {
      expect(resolveLanguage(lang), lang).not.toBeNull()
    }
  })

  it('should not resolve an unknown or empty language', () => {
    expect(resolveLanguage('')).toBeNull()
    expect(resolveLanguage('cobol')).toBeNull()
  })
})
