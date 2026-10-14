import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Opens the app, waits for the library to load, and replaces the welcome text with `text`. */
async function startWriting(page: Page, text: string): Promise<void> {
  await page.goto('/')

  const editor = page.getByTestId('editor')

  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(text)
  await expect(editor).toHaveValue(text)
}

test('typing updates the counter, and text size and theme follow their shortcuts', async ({ page }) => {
  await startWriting(page, 'The quiet writer waits')

  const counter = page.getByTestId('counter')

  await expect(counter).toHaveText('4 words')

  await counter.click()
  await expect(counter).toHaveText('22 characters')

  await counter.click()
  await expect(counter).toContainText('read')

  await counter.click()
  await expect(counter).toContainText('speaking')

  await counter.click()
  await expect(counter).toHaveText('4 words')

  await page.keyboard.type(' today')
  await expect(counter).toHaveText('5 words')

  const app = page.getByTestId('app')

  await page.keyboard.press('ControlOrMeta+Equal')
  await expect(app).toHaveCSS('--font-size', '20px')
  await page.keyboard.press('ControlOrMeta+Minus')
  await page.keyboard.press('ControlOrMeta+Minus')
  await expect(app).toHaveCSS('--font-size', '16px')
  await page.keyboard.press('ControlOrMeta+0')
  await expect(app).toHaveCSS('--font-size', '18px')

  const dark = process.platform === 'darwin' ? 'Meta+Control+N' : 'Control+Alt+N'

  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.keyboard.press(dark)
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.keyboard.press(dark)
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('focus mode dims everything except the current sentence', async ({ page }) => {
  await startWriting(page, 'One alpha. Two beta. Three gamma.')

  const highlight = page.getByTestId('highlight')

  await expect(highlight.locator('.dim')).toHaveCount(0)

  // the shortcut and the button do the same thing
  await page.keyboard.press('ControlOrMeta+D')
  await expect(page.getByTestId('toggle-focus')).toHaveAttribute('aria-pressed', 'true')

  const dimmed = highlight.locator('.dim')

  await expect(dimmed).toContainText('One alpha.')
  await expect(dimmed).toContainText('Two beta.')
  await expect(dimmed).not.toContainText('Three gamma.')
  await expect.poll(() => dimmed.first().evaluate((element) => getComputedStyle(element).opacity)).toBe('0.25')

  // paragraph scope lights the whole paragraph instead
  await page.getByTestId('options').click()
  await page.getByRole('radio', { name: 'Paragraph' }).click()
  await page.keyboard.press('Escape')
  await expect(highlight.locator('.dim')).toHaveCount(0)

  await page.getByTestId('toggle-focus').click()
  await expect(page.getByTestId('toggle-focus')).toHaveAttribute('aria-pressed', 'false')
})

test('syntax highlight colours the parts of speech and each can be switched off', async ({ page }) => {
  await startWriting(page, 'The quiet writer quickly reads beautiful sentences and paragraphs.')

  const highlight = page.getByTestId('highlight')

  await expect(highlight.locator('.pos-noun')).toHaveCount(0)

  await page.getByTestId('toggle-syntax').click()

  for (const tag of ['noun', 'verb', 'adj', 'adv', 'conj']) {
    await expect(highlight.locator(`.pos-${tag}`).first()).toBeVisible()
  }

  await expect(highlight.locator('.pos-noun').first()).toHaveText('writer')
  await expect(highlight.locator('.pos-adv').first()).toHaveText('quickly')

  await page.getByTestId('options').click()
  await page.getByTestId('option-verbs').uncheck()
  await expect(highlight.locator('.pos-verb')).toHaveCount(0)
  await expect(highlight.locator('.pos-noun').first()).toBeVisible()
})

test('fenced code gets Shiki colours in the editor and the preview, in light and dark', async ({ page }) => {
  await startWriting(page, 'Some prose first.\n\n```ts\nconst answer: number = 42\n```')
  await page.keyboard.press('ControlOrMeta+R')

  const keyword = (scope: 'highlight' | 'preview') =>
    page
      .getByTestId(scope)
      .locator(scope === 'highlight' ? '.code-tok' : 'pre code span')
      .filter({ hasText: /^const$/ })

  const colors = async () => ({
    editor: await keyword('highlight').evaluate((element) => getComputedStyle(element).color),
    preview: await keyword('preview').evaluate((element) => getComputedStyle(element).color),
    ink: await page.getByTestId('highlight').evaluate((element) => getComputedStyle(element).color),
  })

  await expect(keyword('highlight')).toHaveCount(1)
  await expect(keyword('preview')).toHaveCount(1)

  const dark = process.platform === 'darwin' ? 'Meta+Control+N' : 'Control+Alt+N'

  await expect(page.locator('html')).not.toHaveClass(/dark/)

  const light = await colors()

  expect(light.editor).toBe(light.preview)
  expect(light.editor).not.toBe(light.ink)

  // switching the theme only swaps which CSS variable the same spans use
  await page.keyboard.press(dark)
  await expect(page.locator('html')).toHaveClass(/dark/)

  const night = await colors()

  expect(night.editor).toBe(night.preview)
  expect(night.editor).not.toBe(night.ink)
  expect(night.editor).not.toBe(light.editor)

  // prose is never coloured as code
  await expect(page.getByTestId('highlight').locator('.code-tok').filter({ hasText: 'prose' })).toHaveCount(0)
})

test('preview renders Markdown and escapes HTML', async ({ page }) => {
  await startWriting(page, '# Hello preview\n\nSome *emphasis* here.\n\n<script>window.pwned = 1</script>')

  await expect(page.getByTestId('preview')).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+R')

  const preview = page.getByTestId('preview')

  await expect(preview.getByRole('heading', { level: 1, name: 'Hello preview' })).toBeVisible()
  await expect(preview.locator('em')).toHaveText('emphasis')
  await expect(preview).toContainText('<script>window.pwned = 1</script>')
  await expect(preview.locator('script')).toHaveCount(0)
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false)

  // the editor stays next to it in split layout
  await expect(page.getByTestId('editor')).toBeVisible()
})

for (const backend of ['OPFS', 'IndexedDB'] as const) {
  test(`documents persist across a reload and the library manages them (${backend})`, async ({ page }) => {
    if (backend === 'IndexedDB') {
      // browsers without a working OPFS take the IndexedDB path
      await page.addInitScript(() => {
        Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined, configurable: true })
      })
    }

    await startWriting(page, 'Words that must outlive this page')
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved')

    await page.reload()
    await expect(page.getByTestId('editor')).toHaveValue('Words that must outlive this page')

    // library: new document, rename, switch, reload, delete
    await page.getByTestId('sidebar-toggle').click()
    await expect(page.getByTestId('sidebar')).toHaveAttribute('data-open', 'true')
    await expect(page.getByTestId('storage-backend')).toContainText(backend)

    await page.getByTestId('new-document').click()
    await expect(page.getByTestId('editor')).toHaveValue('')
    await page.getByTestId('editor').click()
    await page.keyboard.type('A second document')

    const row = page.getByTestId('sidebar').locator('li[data-active="true"]')

    await row.hover()
    await row.getByTestId('rename-document').click()
    await page.getByTestId('rename-input').fill('Notes')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('document-name')).toHaveText('Notes')
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'saved')

    await page.reload()
    await expect(page.getByTestId('editor')).toHaveValue('A second document')
    await expect(page.getByTestId('document-name')).toHaveText('Notes')

    await page.getByRole('button', { name: 'Welcome to AO Writer' }).click()
    await expect(page.getByTestId('editor')).toHaveValue('Words that must outlive this page')
    await page.getByRole('button', { name: 'Notes' }).click()
    await expect(page.getByTestId('editor')).toHaveValue('A second document')

    const active = page.getByTestId('sidebar').locator('li[data-active="true"]')

    await active.hover()
    await active.getByTestId('delete-document').click()
    await active.getByTestId('confirm-delete').click()
    await expect(page.getByRole('button', { name: 'Notes' })).toHaveCount(0)
    await expect(page.getByTestId('document-name')).toHaveText('Welcome to AO Writer')
  })
}

/** Switches Vim keybindings on in the options menu and puts the focus back in the editor. */
async function enableVim(page: Page): Promise<void> {
  await page.getByTestId('options').click()
  await page.getByTestId('option-vim').check()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('options-menu')).toHaveCount(0)
  await page.getByTestId('editor').click()
}

const caretOf = (page: Page): Promise<number> => page.getByTestId('editor').evaluate((element) => (element instanceof HTMLTextAreaElement ? element.selectionStart : -1))

test('vim keys: normal mode edits without typing, insert mode types, Escape returns', async ({ page }) => {
  await startWriting(page, 'alpha beta\ngamma delta\nepsilon')
  await expect(page.getByTestId('vim-mode')).toHaveCount(0)

  await enableVim(page)

  const editor = page.getByTestId('editor')
  const mode = page.getByTestId('vim-mode')

  await expect(mode).toHaveText('NORMAL')
  await expect(page.getByTestId('vim-cursor')).toHaveCount(1)

  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await page.keyboard.press('x')
  await expect(editor).toHaveValue('lpha beta\ngamma delta\nepsilon')

  // a letter with no meaning in normal mode must not land in the text
  await page.keyboard.press('q')
  await page.keyboard.press('z')
  await expect(editor).toHaveValue('lpha beta\ngamma delta\nepsilon')

  await page.keyboard.press('i')
  await expect(mode).toHaveText('INSERT')
  await expect(page.getByTestId('vim-cursor')).toHaveCount(0)
  await page.keyboard.type('XY')
  await expect(editor).toHaveValue('XYlpha beta\ngamma delta\nepsilon')

  await page.keyboard.press('Escape')
  await expect(mode).toHaveText('NORMAL')
  await expect(page.getByTestId('vim-cursor')).toHaveText('Y')

  // dd removes the line and u brings it back
  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await expect(editor).toHaveValue('gamma delta\nepsilon')
  await page.keyboard.press('u')
  await expect(editor).toHaveValue('XYlpha beta\ngamma delta\nepsilon')

  // visual mode selects, and the indicator follows
  await page.keyboard.press('v')
  await page.keyboard.press('e')
  await expect(mode).toHaveText('VISUAL')
  await expect.poll(() => editor.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value.slice(element.selectionStart, element.selectionEnd) : ''))).toBe('XYlpha')
  await page.keyboard.press('d')
  await expect(editor).toHaveValue(' beta\ngamma delta\nepsilon')
  await expect(mode).toHaveText('NORMAL')

  // yank a line and paste it below it
  await page.keyboard.press('y')
  await page.keyboard.press('y')
  await page.keyboard.press('p')
  await expect(editor).toHaveValue(' beta\n beta\ngamma delta\nepsilon')

  // a count waits in the status bar until the command is complete
  await page.keyboard.press('2')
  await expect(mode).toHaveText('NORMAL 2')
  await page.keyboard.press('d')
  await page.keyboard.press('d')
  await expect(editor).toHaveValue(' beta\nepsilon')
  await expect(mode).toHaveText('NORMAL')

  // the cursor sits on epsilon after 2dd; o opens a line below it, and Enter in insert mode still continues a list
  await page.keyboard.press('o')
  await expect(mode).toHaveText('INSERT')
  await page.keyboard.type('- one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await expect(editor).toHaveValue(' beta\nepsilon\n- one\n- two')

  // a new document starts in normal mode, even when the last one was left in insert mode
  await page.keyboard.press('Alt+Shift+N')
  await expect(editor).toHaveValue('')
  await expect(mode).toHaveText('NORMAL')
})

test('vim keys: V selects whole lines; d deletes them, u restores them, y and p paste a line below', async ({ page }) => {
  await startWriting(page, 'one\n\nthree\nfour')
  await enableVim(page)

  const editor = page.getByTestId('editor')
  const mode = page.getByTestId('vim-mode')
  const selected = (): Promise<string> => editor.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value.slice(element.selectionStart, element.selectionEnd) : ''))

  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await page.keyboard.press('V')
  await expect(mode).toHaveText('VISUAL LINE')
  await expect.poll(selected).toBe('one\n')
  await expect(page.getByTestId('vim-band')).toHaveCount(1)

  // j moves by logical line, and the empty line is part of the selection and the band
  await page.keyboard.press('j')
  await expect.poll(selected).toBe('one\n\n')
  await expect(page.getByTestId('vim-band')).toHaveCount(2)

  await page.keyboard.press('d')
  await expect(editor).toHaveValue('three\nfour')
  await expect(mode).toHaveText('NORMAL')
  await expect(page.getByTestId('vim-band')).toHaveCount(0)

  await page.keyboard.press('u')
  await expect(editor).toHaveValue('one\n\nthree\nfour')

  // yank the first line and paste it below the cursor line
  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await page.keyboard.press('V')
  await page.keyboard.press('y')
  await expect(mode).toHaveText('NORMAL')
  await expect(editor).toHaveValue('one\n\nthree\nfour')
  await page.keyboard.press('G')
  await page.keyboard.press('p')
  await expect(editor).toHaveValue('one\n\nthree\nfour\none')

  // v and V switch the kind of selection, and the same key leaves
  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await page.keyboard.press('V')
  await page.keyboard.press('v')
  await expect(mode).toHaveText('VISUAL')
  await page.keyboard.press('V')
  await expect(mode).toHaveText('VISUAL LINE')
  await page.keyboard.press('V')
  await expect(mode).toHaveText('NORMAL')

  // p over a selection swaps in the register; X deletes the character before the cursor
  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await page.keyboard.press('x')
  await expect(editor).toHaveValue('ne\n\nthree\nfour\none')
  await page.keyboard.press('v')
  await page.keyboard.press('e')
  await page.keyboard.press('p')
  await expect(editor).toHaveValue('o\n\nthree\nfour\none')
  await page.keyboard.press('G')
  await page.keyboard.press('$')
  await page.keyboard.press('X')
  await expect(editor).toHaveValue('o\n\nthree\nfour\noe')
})

test('vim keys: j and k move by wrapped row, not by paragraph', async ({ page }) => {
  await startWriting(page, 'lorem ipsum dolor sit amet '.repeat(10).trim())
  await enableVim(page)

  await page.keyboard.press('g')
  await page.keyboard.press('g')
  expect(await caretOf(page)).toBe(0)

  await page.keyboard.press('j')

  // one row down is about one column-width of text further, well inside the same paragraph
  const second = await caretOf(page)

  expect(second).toBeGreaterThan(40)
  expect(second).toBeLessThan(90)

  await page.keyboard.press('j')
  expect(await caretOf(page)).toBeGreaterThan(second + 40)

  await page.keyboard.press('k')
  await page.keyboard.press('k')
  expect(await caretOf(page)).toBe(0)
})

test('vim keys: f finds a character, ; repeats it and dt. deletes up to a period', async ({ page }) => {
  await startWriting(page, 'banana split. rest')
  await enableVim(page)

  const editor = page.getByTestId('editor')
  const mode = page.getByTestId('vim-mode')

  await page.keyboard.press('g')
  await page.keyboard.press('g')
  expect(await caretOf(page)).toBe(0)

  // the status bar waits for the character, which does not land in the text
  await page.keyboard.press('f')
  await expect(mode).toHaveText('NORMAL f')
  await page.keyboard.press('a')
  await expect(mode).toHaveText('NORMAL')
  expect(await caretOf(page)).toBe(1)
  await expect(editor).toHaveValue('banana split. rest')

  await page.keyboard.press(';')
  expect(await caretOf(page)).toBe(3)

  await page.keyboard.press('d')
  await page.keyboard.press('t')
  await expect(mode).toHaveText('NORMAL dt')
  await page.keyboard.press('.')
  await expect(editor).toHaveValue('ban. rest')
  expect(await caretOf(page)).toBe(3)
})

test('vim keys: Ctrl+R is redo in normal mode, Escape still closes menus, and the setting turns off', async ({ page }) => {
  await startWriting(page, 'one two')
  await enableVim(page)

  const editor = page.getByTestId('editor')

  await page.keyboard.press('g')
  await page.keyboard.press('g')
  await page.keyboard.press('x')
  await expect(editor).toHaveValue('ne two')
  await page.keyboard.press('u')
  await expect(editor).toHaveValue('one two')
  await page.keyboard.press('Control+R')
  await expect(editor).toHaveValue('ne two')
  await expect(page.getByTestId('preview')).toHaveCount(0)

  // a menu takes the Escape, not the editor
  await page.getByTestId('options').click()
  await expect(page.getByTestId('options-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('options-menu')).toHaveCount(0)

  await page.getByTestId('options').click()
  await page.getByTestId('option-vim').uncheck()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('vim-mode')).toHaveCount(0)
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('xyz')
  await expect(editor).toHaveValue('xyz')
})

/** How far the caret line's centre is from the scroll container's centre, in px. */
const caretOffset = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scroller = document.querySelector('[data-testid=editor-scroll]')
    const marker = document.querySelector('[data-testid=caret-marker]')

    if (!scroller || !marker) return Number.NaN

    const view = scroller.getBoundingClientRect()
    const caret = marker.getBoundingClientRect()

    return caret.top + caret.height / 2 - (view.top + view.height / 2)
  })

test('typewriter mode centres the first line, and glides to the caret line while typing', async ({ page }) => {
  await startWriting(page, 'First line')
  await page.getByTestId('options').click()
  await page.getByTestId('option-typewriter').check()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('options-menu')).toHaveCount(0)

  const editor = page.getByTestId('editor')
  const scroller = page.getByTestId('editor-scroll')

  const docStart = process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home'
  const docEnd = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'

  await editor.click()
  await page.keyboard.press(docStart)

  // the first line can sit in the middle of an unscrolled page
  await expect(scroller).toHaveJSProperty('scrollTop', 0)
  expect(Math.abs(await caretOffset(page))).toBeLessThan(4)

  await page.keyboard.press(docEnd)

  for (let paragraph = 1; paragraph <= 12; paragraph += 1) {
    await page.keyboard.type(`\n\nParagraph ${paragraph} goes on for a while so that the line wraps around the column at least once or twice more.`)
  }

  // the glide is 150 ms; give it a little more
  await page.waitForTimeout(250)

  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(300)
  expect(Math.abs(await caretOffset(page))).toBeLessThan(4)

  // arrow keys re-centre as well
  await page.keyboard.press(docStart)
  await page.waitForTimeout(250)
  await expect(scroller).toHaveJSProperty('scrollTop', 0)
  expect(Math.abs(await caretOffset(page))).toBeLessThan(4)
})
