import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const setupFixture = resolve('e2e/fixtures/owned-setup.png')
const videoFixture = resolve('e2e/fixtures/owned-motion-vp8.webm')

test('active exercise references decode local media after backup and offline resume without changing drafts', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Reference Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Row')
  await page.getByLabel('Notes').fill('Brace torso. Set seat to position 3.')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  const exerciseCard = page.getByRole('article', { name: 'Row' })
  const picker = exerciseCard.getByLabel('Add image or video — Row', { exact: true })

  // Upload image fixture
  await picker.setInputFiles({ name: 'setup.png', mimeType: 'image/png', buffer: await readFile(setupFixture) })
  await expect(exerciseCard.getByText('setup.png')).toBeVisible()

  // Upload video fixture - wait for media preparation to complete
  const choosing = page.waitForEvent('filechooser')
  await picker.focus()
  await page.keyboard.press('Enter')
  await (await choosing).setFiles({ name: 'form.webm', mimeType: 'video/webm', buffer: await readFile(videoFixture) })

  const progress = exerciseCard.getByRole('progressbar', { name: 'Preparing media — Row', exact: true })
  await expect(progress).toBeVisible()
  await expect.poll(() => exerciseCard.getByText('form.webm', { exact: true }).count(), { timeout: 30000 }).toBe(1)

  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Press')
  await page.getByLabel('Notes').fill('Keep wrists straight.')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Reference Workout')
  await page.getByRole('button', { name: 'Add Row' }).click()
  await page.getByRole('button', { name: 'Add Press' }).click()
  await page.getByRole('button', { name: 'Save workout' }).click()
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start workout at Reference Gym' }).click()
  await page.getByRole('button', { name: 'Start Reference Workout' }).click()
  await expect(page.getByText('Brace torso. Set seat to position 3.', { exact: true })).toBeVisible()
  await page.getByLabel('Row set 1 weight').fill('42')
  const open = page.getByRole('button', { name: 'Show reference media for Row' })
  await open.focus(); await page.keyboard.press('Enter')
  const image = page.getByRole('img', { name: 'Row: setup.png' })
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160)
  // Exercise a transient decode failure without changing the stored attachment.
  await image.evaluate((img) => img.dispatchEvent(new Event('error')))
  const imageRetry = page.getByRole('button', { name: 'Retry setup.png', exact: true })
  await imageRetry.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160)
  await expect(page.getByRole('figure', { name: 'Row: setup.png reference', exact: true })).toBeFocused()
  const video = page.getByLabel('Row: form.webm', { exact: true })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => element.play())
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0)
  await video.focus(); await page.keyboard.press('Escape')
  await expect(open).toBeFocused()
  await expect(image).toHaveCount(0)
  await expect(page.getByLabel('Row set 1 weight')).toHaveValue('42')
  await page.getByRole('button', { name: 'Exit workout' }).click()
  await page.getByRole('tab', { name: 'Settings' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const backup = await readFile((await (await downloading).path())!, 'utf8')
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'reference.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  await page.getByRole('button', { name: 'Restore backup' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Resume Reference Workout' }).click()
  await expect(page.getByText('Brace torso. Set seat to position 3.', { exact: true })).toBeVisible()
  await open.click()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await page.screenshot({ path: 'evidence/screenshots/active-reference-390.png', fullPage: true })
  await page.getByRole('button', { name: 'Hide reference media for Row' }).click()
  await expect(open).toBeFocused()
  await page.getByLabel('Row set 1 weight').fill('47')
  await page.getByRole('button', { name: 'Exit workout' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (...args: Parameters<IDBObjectStore['get']>) {
      if (this.name === 'exercises') {
        IDBObjectStore.prototype.get = original
        throw new Error('Injected reference read failure')
      }
      return original.apply(this, args)
    }
  })
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Resume Reference Workout' }).click()
  await expect(page.getByRole('alert')).toHaveText('Reference for Row could not be loaded. Your workout has not been changed.')
  await page.getByLabel('Row set 1 weight').fill('47')
  const retry = page.getByRole('button', { name: 'Retry reference for Row' })
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Brace torso. Set seat to position 3.', { exact: true })).toBeVisible()
  await expect(open).toBeFocused()
  await expect(page.getByLabel('Row set 1 weight')).toHaveValue('47')
  await page.getByRole('button', { name: 'Exit workout' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.get
    let calls = 0
    IDBObjectStore.prototype.get = function (...args: Parameters<IDBObjectStore['get']>) {
      if (this.name === 'exercises' && ++calls >= 2) {
        if (calls === 3) IDBObjectStore.prototype.get = original
        throw new Error('Injected repeated reference failure')
      }
      return original.apply(this, args)
    }
  })
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Resume Reference Workout' }).click()
  const pressRetry = page.getByRole('button', { name: 'Retry reference for Press' })
  await expect(pressRetry).toBeVisible()
  await page.getByLabel('Row set 1 weight').fill('47')
  await pressRetry.focus()
  await page.keyboard.press('Enter')
  await expect(pressRetry).toBeFocused()
  await expect(pressRetry).toBeEnabled()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'Reference for Press', exact: true })).toBeFocused()
  await expect(page.getByText('Keep wrists straight.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Row set 1 weight')).toHaveValue('47')
  await page.getByRole('button', { name: 'Exit workout' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await expect(page.getByRole('article', { name: 'Row' }).getByText('setup.png', { exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Row' }).getByText('form.webm', { exact: true })).toBeVisible()
})
