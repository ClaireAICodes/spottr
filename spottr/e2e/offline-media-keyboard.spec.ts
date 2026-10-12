import { expect, test, type Locator } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { SpottrBackup } from '../src/backup'

test('cached-ready local image chooser and active reference use keyboard actions', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  // Public fixture preparation, not keyboard acceptance.
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Media Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Media Row')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  await expect(page.getByRole('button', { name: 'Edit Media Row', exact: true })).toBeFocused()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 90
    const drawing = canvas.getContext('2d')!
    drawing.fillStyle = '#236abb'; drawing.fillRect(0, 0, 160, 90)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  async function tabTo(target: Locator) {
    await expect(target).toBeVisible()
    for (let i = 0; i < 100; i++) {
      if (await target.evaluate(node => node === document.activeElement)) return
      await page.keyboard.press('Tab')
    }
    throw new Error('Keyboard could not reach media journey control')
  }
  async function enter(name: string) {
    await tabTo(page.getByRole('button', { name, exact: true }))
    await page.keyboard.press('Enter')
  }
  async function section(name: string) {
    await tabTo(page.getByRole('tab', { selected: true }))
    await page.keyboard.press('Home')
    for (let i = 0; i < ['Home', 'Exercises', 'Workouts', 'History', 'Settings'].indexOf(name); i++) await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name, exact: true })).toBeFocused()
  }
  await section('Exercises')
  const picker = page.getByLabel('Add image or video — Media Row', { exact: true })
  await tabTo(picker)
  await expect(picker).toBeFocused()
  const choosing = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  // Native chooser internals are deliberately outside browser automation.
  await (await choosing).setFiles({ name: 'setup.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByText('setup.png', { exact: true })).toBeVisible()
  // No Tab recovery: completion must automatically return to this picker.
  await expect(picker).toBeEnabled()
  await expect(picker).toBeFocused()
  await expect(page.locator('[aria-live="polite"]')).toHaveText('setup.png added to Media Row')
  await expect.poll(() => page.getByRole('article', { name: 'Media Row', exact: true }).locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(160)
  await section('Workouts')
  await enter('Add workout')
  await expect(page.getByLabel('Workout name')).toBeFocused()
  await page.keyboard.type('Media Strength')
  await enter('Add Media Row')
  await enter('Save workout')
  await expect(page.getByRole('button', { name: 'Edit Media Strength', exact: true })).toBeFocused()
  await section('Home')
  await enter('Start workout at Media Gym')
  await enter('Start Media Strength')
  await enter('Show reference media for Media Row')
  const image = page.getByRole('img', { name: 'Media Row: setup.png', exact: true })
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(160)
  await enter('Hide reference media for Media Row')
  await expect(page.getByRole('button', { name: 'Show reference media for Media Row', exact: true })).toBeFocused()
  await enter('Exit workout')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  await enter('Resume Media Strength')
  await enter('Show reference media for Media Row')
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(160)
  await page.screenshot({ path: test.info().outputPath('offline-keyboard-media.png'), fullPage: true })
  await enter('Hide reference media for Media Row')
  await expect(page.getByRole('button', { name: 'Show reference media for Media Row', exact: true })).toBeFocused()
  await enter('Exit workout')
  await section('Settings')
  const downloading = page.waitForEvent('download')
  await enter('Download backup')
  const backup: SpottrBackup = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(backup.entities.exercises[0].media).toHaveLength(1)
  expect(backup.entities.exercises[0].media[0].name).toBe('setup.png')
  expect(backup.entities.activeSession?.name).toBe('Media Strength')
  expect(backup.settings).toBeDefined()
})
