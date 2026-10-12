import { expect, test } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots')

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

test('persists settings, shows storage, celebrates a seeded PR, and accepts its next target at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('North Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()

  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Back Squat')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  const exercise = page.getByRole('article', { name: 'Back Squat' })
  await exercise.getByLabel('Add image or video').setInputFiles({
    name: 'form.webm',
    mimeType: 'video/webm',
    buffer: await readFile(resolve('e2e/fixtures/owned-motion-vp8.webm')),
  })
  await expect(exercise.getByText('form.webm')).toBeVisible()
  const encodedBytes = Buffer.from(await exercise.locator('video').evaluate(async (video: HTMLVideoElement) =>
    Array.from(new Uint8Array(await (await fetch(video.src)).arrayBuffer())),
  ))
  expect(encodedBytes.length).toBeGreaterThan(0)

  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Lower Strength')
  await page.getByRole('button', { name: 'Add Back Squat' }).click()
  await page.getByRole('article', { name: 'Back Squat sets' }).getByLabel('Set 1 weight').fill('80')
  await page.getByRole('article', { name: 'Back Squat sets' }).getByLabel('Set 1 reps').fill('8')
  await page.getByRole('button', { name: 'Save workout' }).click()
  const savedWorkout = page.getByRole('button', { name: 'Edit Lower Strength', exact: true })
  await expect(savedWorkout).toBeEnabled()
  await expect(savedWorkout).toBeFocused()

  const planTab = page.getByRole('tab', { name: 'Workouts' })
  await planTab.focus()
  await page.keyboard.press('End')
  const settingsTab = page.getByRole('tab', { name: 'Settings' })
  await expect(settingsTab).toBeFocused()
  await expect(settingsTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText(`${(encodedBytes.length / 1024).toFixed(1)} KB used across 1 file`)).toBeVisible()
  await page.getByLabel('Weight unit').selectOption('lb')
  await page.getByLabel('Rest duration (seconds)').fill('120')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status', { name: '' })).toContainText('Settings saved')
  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByLabel('Weight unit')).toHaveValue('lb')
  await expect(page.getByLabel('Rest duration (seconds)')).toHaveValue('120')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^spottr-backup-.*\.json$/)
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const backup = JSON.parse(await readFile(downloadPath!, 'utf8'))
  expect(backup).toMatchObject({
    format: 'spottr-backup',
    version: 1,
    entities: {
      selectedGymId: expect.any(String),
      gyms: [{ name: 'North Gym' }],
      exercises: [{
        name: 'Back Squat',
        media: [{
          name: 'form.webm',
          mimeType: expect.stringMatching(/^video\/webm/),
          size: encodedBytes.length,
          content: { encoding: 'base64', data: encodedBytes.toString('base64') },
        }],
      }],
      workouts: [{ name: 'Lower Strength' }],
      activeSession: null,
      completedSessions: [],
    },
    settings: { weightUnit: 'lb', restSeconds: 120 },
  })
  await expect(page.getByRole('status').filter({ hasText: 'Backup downloaded' })).toBeVisible()

  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Temporary Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()
  await page.getByRole('tab', { name: 'Settings' }).click()

  const backupInput = page.getByLabel('Choose backup file')
  await backupInput.setInputFiles({
    name: 'spottr-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await expect(page.getByRole('status').filter({ hasText: 'compatible and ready' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore backup' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await expect(page.getByRole('article', { name: 'North Gym' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Temporary Gym' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to home' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await expect(exercise.locator('video')).toBeVisible()
  const restoredBytes = Buffer.from(await exercise.locator('video').evaluate(async (video: HTMLVideoElement) =>
    Array.from(new Uint8Array(await (await fetch(video.src)).arrayBuffer())),
  ))
  expect(restoredBytes).toEqual(encodedBytes)
  await page.getByRole('tab', { name: 'Settings' }).click()

  await backupInput.setInputFiles({ name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await expect(page.getByRole('alert')).toContainText('not a valid Spottr backup')
  await backupInput.setInputFiles({
    name: 'future-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...backup, version: 2 })),
  })
  await expect(page.getByRole('alert')).toContainText('backup version 2 is not supported')
  await expect(page.getByLabel('Weight unit')).toHaveValue('lb')
  await expect(page.getByLabel('Rest duration (seconds)')).toHaveValue('120')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-backup-import-validation-390x844.png'), fullPage: true })
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-settings-storage-390x844.png'), fullPage: true })

  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start workout at North Gym' }).click()
  await page.getByRole('button', { name: 'Start Lower Strength' }).click()
  await expect(page.getByLabel('Back Squat set 1 weight (lb)')).toHaveValue('176.4')
  await page.getByRole('button', { name: 'Log Back Squat set 1' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()

  await page.getByRole('button', { name: 'Start workout at North Gym' }).click()
  await page.getByRole('button', { name: 'Start Lower Strength' }).click()
  await page.getByLabel('Back Squat set 1 weight (lb)').fill('187.4')
  await page.getByLabel('Back Squat set 1 reps').fill('5')
  await page.getByRole('button', { name: 'Log Back Squat set 1' }).click()
  const feedback = page.getByRole('status').filter({ hasText: 'New weight PR' })
  await expect(feedback).toContainText('Suggested rest: 120 seconds')
  const reducedAnimationSeconds = await feedback.evaluate((element) => {
    const duration = getComputedStyle(element).animationDuration
    return duration.endsWith('ms') ? Number.parseFloat(duration) / 1000 : Number.parseFloat(duration)
  })
  expect(reducedAnimationSeconds).toBeLessThanOrEqual(0.00001)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  const decision = page.getByRole('group', { name: 'Future target for Back Squat set 1' })
  await decision.getByRole('button', { name: 'Use this target' }).click()
  await expect(decision).toContainText('Target updated')

  expect(await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }))).toEqual({ width: 390, scrollWidth: 390 })
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-pr-settings-390x844.png'), fullPage: true })

  await page.reload()
  await page.getByRole('button', { name: 'Start workout at North Gym' }).click()
  await page.getByRole('button', { name: 'Start Lower Strength' }).click()
  await expect(page.getByLabel('Back Squat set 1 weight (lb)')).toHaveValue('187.4')
})
