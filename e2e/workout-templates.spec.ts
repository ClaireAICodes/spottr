import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots')

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

test('builds, reloads, duplicates, and varies a mixed-set workout on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('button', { name: 'Manage gyms' }).click()
  for (const name of ['North Gym', 'South Gym']) {
    await page.getByRole('button', { name: 'Add gym' }).click()
    await page.getByLabel('Gym name').fill(name)
    await page.getByRole('button', { name: 'Save gym' }).click()
  }

  await page.getByRole('tab', { name: 'Train' }).click()
  for (const name of ['Back Squat', 'Cable Row']) {
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill(name)
    await page.getByRole('button', { name: 'Save exercise' }).click()
  }

  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Lower Strength')
  await page.getByRole('combobox', { name: 'Gym' }).selectOption({ label: 'North Gym' })
  await page.getByRole('button', { name: 'Add Back Squat' }).click()
  const squat = page.getByRole('article', { name: 'Back Squat sets' })
  await squat.getByLabel('Set 1 type').selectOption('warm-up')
  await squat.getByLabel('Set 1 weight').fill('20')
  await squat.getByLabel('Set 1 reps').fill('10')
  await squat.getByRole('button', { name: 'Add set' }).click()
  await squat.getByRole('button', { name: 'Add set' }).click()
  await squat.getByLabel('Set 3 type').selectOption('drop')
  await squat.getByLabel('Set 3 weight').fill('60')
  await squat.getByLabel('Set 3 reps').fill('8')
  await page.getByRole('button', { name: 'Add Cable Row' }).click()
  await page.getByRole('article', { name: 'Cable Row sets' }).getByRole('button', { name: 'Move exercise up' }).click()
  await expect(page.getByRole('article', { name: /sets/ }).first()).toHaveAttribute('aria-label', 'Cable Row sets')
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('article', { name: 'Lower Strength' })).toContainText('2 exercises')

  await page.reload()
  await page.getByRole('tab', { name: 'Plan' }).click()
  const restored = page.getByRole('article', { name: 'Lower Strength' })
  await expect(restored).toBeVisible()
  await restored.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('article', { name: /sets/ }).first()).toHaveAttribute('aria-label', 'Cable Row sets')
  await expect(page.getByRole('article', { name: 'Back Squat sets' }).getByLabel('Set 3 type')).toHaveValue('drop')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await restored.getByRole('button', { name: 'Duplicate' }).focus()
  await expect(restored.getByRole('button', { name: 'Duplicate' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByLabel('Duplicate to gym').selectOption({ label: 'South Gym' })
  await page.getByRole('button', { name: 'Create duplicate' }).click()
  const copy = page.getByRole('article', { name: 'Lower Strength copy' })
  await expect(copy).toContainText('South Gym')
  await copy.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('article', { name: 'Back Squat sets' }).getByRole('button', { name: 'Duplicate for variation' }).click()
  await expect(page.getByRole('article', { name: 'Back Squat variation sets' })).toBeVisible()
  await page.getByRole('button', { name: 'Save workout' }).click()

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-workouts-390x844.png'), fullPage: true })
})
