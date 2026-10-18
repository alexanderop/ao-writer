import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

const draft = 'This is really useful.'

/** The server-function envelope, with an intentionally deterministic coach response. */
async function reply(route: Route): Promise<void> {
  const suggestion = { quote: draft, after: 'This is useful.', note: 'Let useful carry the meaning.', start: 0, end: draft.length }
  const fields = Object.entries(suggestion)

  await route.fulfill({
    contentType: 'application/json',
    headers: { 'x-tss-serialized': 'true' },
    body: JSON.stringify({ t: 10, i: 0, p: { k: ['result', 'error', 'context'], v: [
      { t: 10, i: 1, p: { k: fields.map(([key]) => key), v: fields.map(([, value]) => ({ t: Number.isInteger(value) ? 0 : 1, s: value })) }, o: 0 },
      { t: 2, s: 1 }, { t: 11, i: 2, p: { k: [], v: [] }, o: 0 },
    ] }, o: 0 }),
  })
}

async function start(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByTestId('editor').fill(draft)
  await page.keyboard.press('ControlOrMeta+Alt+D')
}

test('hover offers a coach rewrite, reuses it on reopen, applies and supports undo', async ({ page }) => {
  let requests = 0

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()

    requests++
    await reply(route)
  })
  await start(page)
  const flag = page.getByRole('button', { name: 'Filler suggestion: really' })

  // Hover the letters through the textarea, not just the narrow button on the underline.
  const phrase = page.getByTestId('highlight').locator('.style-filler').first()
  const box = await phrase.boundingBox()

  expect(box).not.toBeNull()

  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  const card = page.getByRole('dialog', { name: 'Style coach suggestion' })

  await expect(card).toContainText('Let useful carry the meaning.')
  await card.getByRole('button', { name: 'Close style suggestion' }).click()
  await expect(card).toHaveCount(0)
  await flag.focus()
  await page.keyboard.press('Enter')
  await expect(card).toContainText('Let useful carry the meaning.')
  expect(requests).toBe(1)
  await expect(card.getByRole('button', { name: 'Close style suggestion' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await expect(flag).toBeFocused()
  await page.keyboard.press('Enter')
  await card.getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(page.getByTestId('editor')).toHaveValue('This is useful.')
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(page.getByTestId('editor')).toHaveValue(draft)
})

test('a draft change discards a pending suggestion', async ({ page }) => {
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => { release = resolve })

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()

    await waiting
    await reply(route)
  })
  await start(page)
  await page.getByRole('button', { name: 'Filler suggestion: really' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Coach is considering' })).toBeVisible()
  await page.getByTestId('editor').fill('This is really useful. My newer thought.')
  release?.()
  await expect(page.getByRole('dialog', { name: 'Style coach suggestion' })).toHaveCount(0)
  await expect(page.getByTestId('editor')).toHaveValue('This is really useful. My newer thought.')
})

test('unavailable coach offers retry without changing the draft', async ({ page }) => {
  let requests = 0

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()

    requests++

    if (requests === 1) await route.fulfill({ status: 503, body: 'Unavailable' })
    else await reply(route)
  })
  await start(page)
  await page.getByRole('button', { name: 'Filler suggestion: really' }).click()
  const card = page.getByRole('dialog', { name: 'Style coach suggestion' })

  await expect(card).toContainText('Could not reach the coach')
  await card.getByRole('button', { name: 'Try again' }).click()
  await expect(card.getByRole('button', { name: 'Apply suggestion' })).toBeVisible()
  await expect(page.getByTestId('editor')).toHaveValue(draft)
})

test('the suggestion card stays usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()

    await reply(route)
  })
  await start(page)
  await page.getByRole('button', { name: 'Filler suggestion: really' }).click()
  const card = page.getByRole('dialog', { name: 'Style coach suggestion' })

  await expect(card.getByRole('button', { name: 'Apply suggestion' })).toBeVisible()
  const box = await card.boundingBox()

  expect(box).not.toBeNull()

  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }

  await card.getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(page.getByTestId('editor')).toHaveValue('This is useful.')
})
