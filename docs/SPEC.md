# AO Writer: spec

AO Writer is a focused Markdown writer that runs in the browser. Its feature set
follows iA Writer 8.0.9 (macOS). The behaviour list below comes from a static
REA analysis of the shipped app bundle: the decoded `Menu.nib` and
`EditorPreferences.nib` (Evidence `ev_4e3198febd8a32d4dac1927a1a07e0855d321d71b306640b86e212bba4489b5b`)
and the linked frameworks. Nothing was decompiled. All code, word lists,
styles and icons in AO Writer are original. The iA Writer fonts are open source
(SIL OFL 1.1) and are taken from the official repo
https://github.com/iaolo/iA-Fonts together with their license file.

## Observed in iA Writer (behaviour reference)

| Area | Observed | Shortcut (macOS) |
|---|---|---|
| Focus | "Enable Focus Mode"; scope Sentence / Paragraph; Typewriter; Fade In/Out | Cmd+D |
| Syntax | "Show Syntax"; Nouns, Verbs, Adjectives, Adverbs, Conjunctions toggles | Cmd+Shift+D |
| Style check | "Enable Style Check"; Fillers, Clichés, Redundancies; custom patterns; built-in for English, French, German | Cmd+Opt+D |
| Preview | Show Preview; Split / Full layouts; Reload; HTML rendered in WebKit; templates Duo, Mono, Quattro, Sans, Serif, GitHub | Cmd+R, Cmd+Shift+R |
| Counter | Words, Characters, Characters without spaces, Sentences, Paragraphs, Reading Time, Speaking Time, Tasks | (status bar menu) |
| Appearance | Dark Appearance; Make Text Bigger / Smaller / Normal; line length limit; typeface Mono / Duospaced / Quattro | Cmd+Ctrl+N, Cmd+= / Cmd+- / Cmd+0 |
| Format | Bold, Italic, Strikethrough, Code, Code Block, Headings 1-6, List, Ordered List, Task List, Blockquote, Link, Footnote, Wikilink, Highlight, Mark Task Completed | Cmd+B, Cmd+I, Cmd+Opt+U, Cmd+J, Cmd+Shift+J, Cmd+1..6, Cmd+L, Cmd+Shift+L, Cmd+Opt+L, Cmd+>, Cmd+K, Cmd+Ctrl+K, Cmd+Shift+K, Cmd+Shift+U, Cmd+Opt+X |
| Library | Show Library, Quick Search | Cmd+Ctrl+S, Cmd+Shift+O |
| Authors | Human / AI / Reference authorship colouring | Cmd+Shift+A |

## MVP scope (first pass)

In:
1. Editor: a Markdown editor with live Markdown styling in the text itself
   (headings bigger/bold markers dimmed, `**bold**`, `*italic*`, `` `code` ``,
   lists, blockquotes, links). Monospace-ish iA Writer Duo by default.
   Comfortable line length (~64ch), centred column.
2. Focus mode (Cmd+D): dims everything except the current sentence or
   paragraph (setting). Typewriter mode: keeps the caret line vertically
   centred.
3. Syntax highlighting (Cmd+Shift+D): colours nouns, verbs, adjectives,
   adverbs, conjunctions, each toggleable. Uses a small in-repo English
   part-of-speech tagger (lexicon + suffix rules + a few context rules). No
   new dependency. Unit-tested on a fixed set of sentences.
4. Style check (Cmd+Opt+D): underlines fillers, clichés and redundancies
   from our own English lists (write them ourselves; keep each list short,
   about 30 to 60 entries).
5. Preview (Cmd+R): split or full, rendered from Markdown with a small
   in-repo renderer or the smallest maintained dependency if a renderer is
   clearly out of scope. Sanitize output.
6. Counter in a status bar: words, characters, reading time (~220 wpm),
   speaking time (~150 wpm). Click to cycle.
7. Light / dark theme (Cmd+Ctrl+N or a toggle), text size Cmd+= / Cmd+- /
   Cmd+0.
8. Format shortcuts: bold, italic, code, headings 1-3, link, list.
9. Documents saved in the browser (OPFS, falling back to IndexedDB), a simple
   library sidebar (new, rename, delete, switch), autosave.
10. Optional Vim keybindings (not part of iA Writer; off by default): normal,
    insert and charwise visual mode, the common motions, operators,
    text objects, search, `.` repeat and registers, `j`/`k` by wrapped row. A pure layer in `src/core/vim`.

Out (later): authorship tracking, templates, export, wikilinks, content
blocks, French/German, custom patterns.

On Windows and Linux, Cmd maps to Ctrl.
