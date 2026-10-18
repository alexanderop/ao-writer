import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function addWord(page: Page, english: string, german: string, sentence: string): Promise<void> {
  await page.getByRole('textbox', { name: 'English word', exact: true }).fill(english)
  await page.getByRole('textbox', { name: 'German meaning' }).fill(german)
  await page.getByRole('textbox', { name: 'Example sentence' }).fill(sentence)
  await page.getByRole('form', { name: 'Add a new word' }).getByRole('button', { name: 'Add to practice', exact: true }).click()
}

test('learns a word through German recall, retry, persisted review, and removal without changing the draft', async ({ page }) => {
  await page.goto('/')
  const editor = page.getByTestId('editor')

  await editor.fill('My original draft stays here.')
  await page.getByRole('button', { name: 'Learn English', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Learn English' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Learn from corrections I accept' }).check()
  await addWord(page, 'requirement', 'Anforderung', 'The requirement is clear.')
  await page.reload()
  await page.getByRole('button', { name: 'Learn English', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Learn from corrections I accept' })).toBeChecked()
  await page.getByRole('button', { name: /Start practice/ }).click()

  const exercise = page.getByRole('region', { name: 'Typing exercise' })

  await expect(exercise.getByRole('heading', { name: 'Anforderung' })).toBeVisible()
  await expect(exercise).toContainText('The ___ is clear.')
  await expect(exercise).not.toContainText('requirement')
  await expect(exercise.getByRole('textbox', { name: 'Your English answer' })).toHaveAttribute('spellcheck', 'false')
  await exercise.getByRole('textbox').fill('requement')
  await exercise.getByRole('button', { name: 'Check answer' }).click()
  await expect(exercise).toContainText('requirement')
  await exercise.getByRole('button', { name: 'Try typing it again' }).click()
  await exercise.getByRole('textbox').fill('requirement')
  await exercise.getByRole('button', { name: 'Check answer' }).click()
  await expect(exercise).toContainText('Correct on the retry.')
  await exercise.getByRole('button', { name: 'Finish session' }).click()
  await expect(page.getByRole('region', { name: 'Practice complete' })).toContainText('0 of 1')
  await page.getByRole('button', { name: 'Back to your words' }).click()
  await expect(page.getByRole('button', { name: /Start practice/ })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: 'Learn English', exact: true }).click()
  await expect(page.getByRole('button', { name: /Start practice/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Remove requirement from practice' }).click()
  await expect(page.getByText('0 saved · 0 due')).toBeVisible()
  await page.getByRole('region', { name: 'Learn English', exact: true }).getByRole('button', { name: 'Back to writing', exact: true }).click()
  await expect(editor).toHaveValue('My original draft stays here.')
})

test('first-attempt recall counts, while revealing an answer does not', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Learn English', exact: true }).click()
  await addWord(page, 'precise', 'präzise', 'Use a precise term.')
  await addWord(page, 'concise', 'knapp', 'Keep it concise.')
  await page.getByRole('button', { name: /Start practice/ }).click()
  await page.getByRole('textbox', { name: 'Your English answer' }).fill('PRECISE')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(page.getByRole('region', { name: 'Typing exercise' })).toContainText('Correct!')
  await page.getByRole('button', { name: 'Next word' }).click()
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: 'Finish session' }).click()
  await expect(page.getByRole('region', { name: 'Practice complete' })).toContainText('1 of 2')
})

test('practice remains usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Learn English', exact: true }).click()
  await addWord(page, 'requirement', 'Anforderung', 'A requirement.')
  await page.context().setOffline(true)
  await page.getByRole('button', { name: /Start practice/ }).click()
  await page.getByRole('textbox', { name: 'Your English answer' }).fill('requirement')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await page.getByRole('button', { name: 'Finish session' }).click()
  await expect(page.getByRole('region', { name: 'Practice complete' })).toContainText('1 of 1')
})

test('switching to Learn preserves the draft and its native undo history', async ({ page }) => {
  await page.goto('/')
  const editor = page.getByTestId('editor')

  await editor.fill('My draft')
  await page.keyboard.insertText(' with another thought')
  await page.getByRole('button', { name: 'Learn English', exact: true }).click()
  await page.getByRole('textbox', { name: 'English word', exact: true }).fill('requirement')
  // Editor shortcuts must not change the hidden draft while working in Learn.
  await page.keyboard.press('ControlOrMeta+Alt+F')
  await page.getByRole('region', { name: 'Learn English', exact: true }).getByRole('button', { name: 'Back to writing', exact: true }).click()
  await expect(editor).toHaveValue('My draft with another thought')
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(editor).toHaveValue('My draft')
})
