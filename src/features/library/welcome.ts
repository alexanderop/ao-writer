/** The title of the document a first-time visitor sees. */
export const WELCOME_NAME = 'Welcome to AO Writer'

/** The seed document: it is also a tour, so every feature has something to act on. */
export const WELCOME_TEXT = `# Welcome to AO Writer

AO Writer is a quiet place to write. Start typing anywhere on this page. The tools around the text fade away while you work, and they come back when you move the mouse.

## Try the writing modes

Press **Cmd+D** (Ctrl+D elsewhere) for *focus mode*. Everything except the sentence you are writing fades out. The same toggle lives in the status bar below. Focus also keeps your line in the middle of the screen. Switch between sentence, paragraph and typewriter focus in the options menu; typewriter scrolling is also available on its own.

Press **Cmd+Shift+D** to show the syntax: nouns, verbs, adjectives, adverbs and conjunctions each get their own soft colour. It is a good way to see how a sentence is built, and to spot a paragraph that is all adjectives.

Press **Cmd+Alt+D** for the style check. It underlines fillers, clichés and redundancies. Honestly, this sentence is really very basically full of them, and at the end of the day the past history of these phrases is a free gift to any editor.

## Format as you go

- Select a word and press Cmd+B for **bold** or Cmd+I for *italic*
- Cmd+J wraps \`inline code\`
- Cmd+K turns the selection into a [link](https://example.com)
- Cmd+1 to Cmd+6 set the heading level
- Enter continues a list for you

1. Ordered lists count for you
2. Lists nest with indentation
3. Press Enter on an empty item to leave the list

- [x] Write the first sentence
- [ ] Open the preview with Cmd+R
- [ ] Try the dark appearance with Cmd+Ctrl+N

> A blockquote is just a line that starts with a greater-than sign.

\`\`\`ts
const draft = 'Code blocks keep their spacing'
\`\`\`

| Shortcut | Does |
| --- | --- |
| Cmd+R | Preview |
| Cmd+Shift+R | Split or full preview |
| Cmd+= and Cmd+- | Text size |

---

## Your library

Everything you write is saved in this browser, a moment after you stop typing. Open the library with the button at the top left (or Ctrl+Cmd+S) to create, rename and switch documents. Nothing leaves your device.
`
