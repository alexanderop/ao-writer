# Margin

A quiet Markdown writer for the browser. One centred column of text, the tools out of the way, and a few
writing aids you switch on when you want them: focus mode, syntax highlight, style check and a live preview.
Everything you write stays in your browser (OPFS, with an IndexedDB fallback). There is no server and no account.

Margin is an **original, clean-room implementation** inspired by the feature set of iA Writer. It contains no
code, word lists, colours, CSS or icons from that app; the part-of-speech tagger, the style lists and the
Markdown renderer are written from scratch for this repo. The feature list is in [`docs/SPEC.md`](docs/SPEC.md).

![Margin in focus mode with the syntax highlight on](docs/screenshots/04-focus-sentence.png)

More screenshots (dark and light, typewriter, split and full preview, library, options) are in
[`docs/screenshots`](docs/screenshots).

## Run it

```sh
pnpm install
pnpm dev          # http://localhost:5190
pnpm build        # SPA in dist/client (serve _shell.html as the fallback page)
pnpm preview      # serve the build on :5190
```

| Command | What it does |
| --- | --- |
| `pnpm check` | typecheck, oxlint (zero warnings), Vitest, knip |
| `pnpm test` | unit tests (tagger accuracy, focus ranges, Markdown, storage, shortcuts) |
| `pnpm e2e` | Playwright tests against the dev server (installs nothing; run `pnpm exec playwright install chromium` once) |
| `pnpm lint` | `oxlint --deny-warnings` with the anti-slop rules in `tools/oxlint/anti-slop` |

## Features and shortcuts

On macOS the main modifier is Cmd; on Windows and Linux it is Ctrl. Every action is also a button in the top
bar, the status bar or the options menu, so nothing depends on a shortcut. Some browsers keep a few combinations
for themselves (Cmd+1..6 and Cmd+L in Chrome, for example), so headings, lists and links have second shortcuts
(shown in the keyboard list).

| Feature | macOS | Windows / Linux |
| --- | --- | --- |
| Focus mode (sentence or paragraph, set in Options) | Cmd+D | Ctrl+D |
| Syntax highlight (nouns, verbs, adjectives, adverbs, conjunctions) | Cmd+Shift+D | Ctrl+Shift+D |
| Style check (fillers, clichés, redundancies) | Cmd+Alt+D | Ctrl+Alt+D |
| Preview | Cmd+R | Ctrl+R |
| Split or full preview | Cmd+Shift+R | Ctrl+Shift+R |
| Dark appearance | Cmd+Ctrl+N | Ctrl+Alt+N |
| Text bigger / smaller / normal | Cmd+= / Cmd+- / Cmd+0 | Ctrl+= / Ctrl+- / Ctrl+0 |
| Library sidebar | Cmd+Ctrl+S | Ctrl+Alt+S |
| New document | Alt+Shift+N | Alt+Shift+N |
| Bold / italic / strikethrough | Cmd+B / Cmd+I / Cmd+Alt+U | Ctrl+B / Ctrl+I / Ctrl+Alt+U |
| Code / code block | Cmd+J / Cmd+Shift+J | Ctrl+J / Ctrl+Shift+J |
| Headings 1 to 6 | Cmd+1..6 (or Cmd+Alt+1..6) | Ctrl+1..6 (or Ctrl+Alt+1..6) |
| List / ordered list / task list | Cmd+L / Cmd+Shift+L / Cmd+Alt+L | Ctrl+L / Ctrl+Shift+L / Ctrl+Alt+L |
| Blockquote | Cmd+Shift+. | Ctrl+Shift+. |
| Link | Cmd+K | Ctrl+K |
| Mark task completed | Cmd+Alt+X | Ctrl+Alt+X |

Other behaviour: Enter continues lists, task lists and quotes (and leaves them on an empty item); typewriter
mode keeps the caret line in the middle of the screen; the status bar counter cycles through words, characters,
reading time (220 wpm) and speaking time (150 wpm) when you click it, and counts the selection while text is
selected; the chrome fades while you type and returns when the mouse moves; documents autosave 500 ms after
the last keystroke (and when the tab hides).

## How it works

- **Editor**: a `<textarea>` (it owns input, selection, IME and undo) over a transparent-text highlight layer
  with identical font metrics. The layer is built from pure functions in `src/core`; the Markdown styling
  never changes size, only weight and colour, so the two layers stay aligned.
- **`src/core`**: framework-free TypeScript with unit tests: `pos/` (lexicon + suffix rules + context rules
  tagger), `style/` (word lists and a phrase matcher), `markdown/` (live-styling ranges, safe HTML renderer,
  format edits), `text/` (counts, sentence and paragraph detection), `shortcuts.ts`.
- **`src/features`**: Effect 4 services and atoms. `library/storage.ts` is the `DocumentStorage` service (OPFS
  layer with an IndexedDB fallback and an in-memory layer for tests), `library/atoms.ts` holds the documents,
  the debounced autosave and the library actions, `settings/` is the persisted settings atom.
- **`src/app`**: React 19 components on TanStack Start (SPA mode) and Tailwind 4.

## Fonts

The typefaces are [iA Writer Duo, Mono and Quattro](https://github.com/iaolo/iA-Fonts) by Information
Architects Inc. (based on IBM Plex), used under the SIL Open Font License 1.1. The license text is in
[`public/fonts/LICENSE.md`](public/fonts/LICENSE.md).
