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

test('adds, reorders, reloads, and removes ordered exercise media on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Train' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Front Squat')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  const exercise = page.getByRole('article', { name: 'Front Squat' })
  const picker = exercise.getByLabel('Add image or video')

  await picker.setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(exercise.locator('img.media-preview')).toBeVisible()
  expect(await exercise.locator('img.media-preview').evaluate(async (image) => (
    await (await fetch((image as HTMLImageElement).src)).blob()
  ).type)).toBe('image/jpeg')
  await picker.setInputFiles({ name: 'side.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') })
  await expect(exercise.getByText('front.png')).toBeVisible()
  await expect(exercise.getByText('side.mp4')).toBeVisible()

  await exercise.getByRole('button', { name: 'Move side.mp4 up' }).click()
  await expect(exercise.getByRole('listitem').first()).toHaveAttribute('aria-label', /side.mp4/)
  await page.reload()
  await page.getByRole('tab', { name: 'Train' }).click()
  const restored = page.getByRole('article', { name: 'Front Squat' })
  await expect(restored.getByRole('listitem').first()).toHaveAttribute('aria-label', /side.mp4/)
  await restored.getByRole('button', { name: 'Remove side.mp4' }).click()
  await expect(restored.getByText('side.mp4')).toHaveCount(0)
  await expect(restored.getByText('front.png')).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-exercise-media-390x844.png') })
})
