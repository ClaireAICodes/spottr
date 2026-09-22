import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots')

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

test('creates, searches, edits, and restores an exercise on mobile while offline', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  expect(await page.evaluate(async () => {
    const resources = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"]')]
      .map((element) => element instanceof HTMLScriptElement ? element.src : element.href)
    return Promise.all(resources.map(async (resource) => Boolean(await caches.match(resource))))
  })).not.toContain(false)

  await page.getByRole('tab', { name: 'Train' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Goblet Squat')
  await page.getByLabel('Muscle group').fill('Legs')
  await page.getByLabel('Equipment').fill('Kettlebell')
  await page.getByLabel('Notes').fill('Keep torso tall')
  await page.getByRole('button', { name: 'Save exercise' }).click()

  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('kettle')
  const exercise = page.getByRole('article', { name: 'Goblet Squat' })
  await expect(exercise).toBeVisible()
  await exercise.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Exercise name').fill('Double Kettlebell Squat')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('article', { name: 'Double Kettlebell Squat' })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await page.getByRole('tab', { name: 'Train' }).click()
  await expect(page.getByRole('article', { name: 'Double Kettlebell Squat' })).toBeVisible()

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(horizontalOverflow).toBe(0)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-exercises-390x844.png'), fullPage: true })
})
