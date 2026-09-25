import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots')

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

test('starts, fast-logs, reloads, and resumes an independent session snapshot at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('North Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()

  await page.getByRole('tab', { name: 'Train' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Back Squat')
  await page.getByRole('button', { name: 'Save exercise' }).click()

  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Lower Strength')
  await page.getByRole('button', { name: 'Add Back Squat' }).click()
  await page.getByRole('article', { name: 'Back Squat sets' }).getByLabel('Set 1 weight').fill('80')
  await page.getByRole('article', { name: 'Back Squat sets' }).getByLabel('Set 1 reps').fill('5')
  await page.getByRole('button', { name: 'Save workout' }).click()

  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start workout at North Gym' }).click()
  await page.getByRole('button', { name: 'Start Lower Strength' }).click()
  const weight = page.getByLabel('Back Squat set 1 weight')
  await weight.fill('82.5')
  await page.getByRole('button', { name: 'Log Back Squat set 1' }).click()
  await expect(page.getByText('1 of 1 sets logged')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Resume Lower Strength' }).click()
  await expect(page.getByLabel('Back Squat set 1 weight')).toHaveValue('82.5')
  await expect(page.getByRole('button', { name: 'Logged Back Squat set 1' })).toBeDisabled()

  const interactionState = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    clipped: Array.from(document.querySelectorAll<HTMLElement>('.active-session input, .active-session button'))
      .filter((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left < 0 || bounds.right > window.innerWidth
      })
      .map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim()),
  }))
  expect(interactionState).toEqual({ scrollWidth: 390, innerWidth: 390, clipped: [] })
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-active-session-390x844.png'), fullPage: true })

  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('article', { name: 'Lower Strength' }).getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('article', { name: 'Back Squat sets' }).getByLabel('Set 1 weight')).toHaveValue('80')

  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByRole('heading', { name: 'Workout saved' })).toBeVisible()
  await expect(page.getByText('412.5 kg')).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: 'History' }).click()
  const savedSession = page.getByRole('article', { name: 'Lower Strength at North Gym' })
  await expect(savedSession).toContainText('412.5 kg')
  await savedSession.getByRole('button', { name: 'View details' }).click()
  await expect(savedSession).toContainText('82.5 kg × 5 reps')
  await expect(savedSession).toContainText('Completed')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-completion-history-390x844.png'), fullPage: true })
})
