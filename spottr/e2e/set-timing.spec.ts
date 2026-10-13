import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseSpottrBackup } from '../src/backup'

async function reach(page: Page, target: Locator) {
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate(node => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}
async function enter(page: Page, target: Locator) { await reach(page, target); await page.keyboard.press('Enter') }
async function type(page: Page, target: Locator, value: string) {
  await reach(page, target); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(value)
}
async function tab(page: Page, name: 'Home' | 'Workouts' | 'Settings') {
  await reach(page, page.getByRole('tab', { selected: true }))
  await page.keyboard.press('Home')
  if (name === 'Settings') await page.keyboard.press('End')
  if (name === 'Workouts') { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight') }
  await expect(page.getByRole('tab', { name, exact: true })).toBeFocused()
}

test('public keyboard chosen target Start, reload, Complete, editable actuals and durable Log preserve timing backup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.install({ time: new Date('2026-10-13T08:00:00Z') })
  await page.goto('/')
  await enter(page, page.getByRole('button', { name: 'Manage gyms' }))
  await enter(page, page.getByRole('button', { name: 'Add gym', exact: true }))
  await type(page, page.getByLabel('Gym name'), 'Timing Gym')
  await enter(page, page.getByRole('button', { name: 'Save gym' }))
  await tab(page, 'Workouts')
  await enter(page, page.getByRole('button', { name: 'Add workout' }))
  await type(page, page.getByLabel('Workout name'), 'Timed Row')
  await enter(page, page.getByRole('button', { name: 'Create new exercise' }))
  await page.keyboard.type('Row')
  await enter(page, page.getByRole('button', { name: 'Save exercise' }))
  await type(page, page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' }), '40')
  await type(page, page.getByRole('spinbutton', { name: 'Set 1 reps — Row, exercise 1' }), '8')
  await enter(page, page.getByRole('button', { name: 'Add set — Row, exercise 1' }))
  await enter(page, page.getByRole('button', { name: 'Save workout' }))
  await tab(page, 'Home')
  await enter(page, page.getByRole('button', { name: 'Start workout at Timing Gym' }))
  await enter(page, page.getByRole('button', { name: 'Start Timed Row', exact: true }))
  const weight = page.getByLabel('Row set 1 weight (kg)', { exact: true })
  await type(page, weight, '42.5')
  await type(page, page.getByLabel('Row set 1 reps', { exact: true }), '9')
  await enter(page, page.getByRole('button', { name: 'Start Row set 1', exact: true }))
  await expect(page.getByRole('button', { name: 'Complete Row set 1' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Log Row set 1', exact: true })).toBeDisabled()
  await page.clock.fastForward(12000)
  await expect(page.getByRole('timer', { name: 'Elapsed Row set 1' })).toHaveText('0:12')
  await page.reload()
  await enter(page, page.getByRole('button', { name: 'Resume Timed Row' }))
  await expect(weight).toHaveValue('42.5')
  await expect(page.getByRole('timer', { name: 'Elapsed Row set 1' })).toHaveText(/0:1[2-9]/)
  await enter(page, page.getByRole('button', { name: 'Complete Row set 1' }))
  await expect(weight).toBeFocused()
  await expect(page.getByText('Awaiting actuals', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Row set 1 reps', { exact: true })).toHaveValue('9')
  await type(page, weight, '43')
  await type(page, page.getByLabel('Row set 1 reps', { exact: true }), '7')
  await enter(page, page.getByRole('button', { name: 'Log Row set 1', exact: true }))
  await expect(page.getByText('1 of 2 sets logged · 0 skipped')).toBeVisible()
  await expect(page.getByRole('timer', { name: 'Rest timer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop rest' })).toBeFocused()
  await page.reload()
  await enter(page, page.getByRole('button', { name: 'Resume Timed Row' }))
  await expect(weight).toHaveValue('43')
  await enter(page, page.getByRole('button', { name: 'Exit workout' }))
  await tab(page, 'Settings')
  const downloading = page.waitForEvent('download')
  await enter(page, page.getByRole('button', { name: 'Download backup' }))
  const text = await readFile((await (await downloading).path())!, 'utf8')
  const backup = JSON.parse(text)
  const set = backup.entities.activeSession.exercises[0].sets[0]
  expect(set).toMatchObject({ targetWeight: 40, weight: 43, reps: 7 })
  expect(set.timing.durationSeconds).toBeGreaterThanOrEqual(12)
  expect(backup.entities.workouts[0].exercises[0].sets[0].weight).toBe(40)
  expect(parseSpottrBackup(text).entities.activeSession?.exercises[0].sets[0].timing).toEqual(set.timing)
  const legacy = structuredClone(backup)
  delete legacy.entities.activeSession.exercises[0].sets[0].timing
  expect(parseSpottrBackup(JSON.stringify(legacy)).version).toBe(1)
  const malformed = structuredClone(backup)
  malformed.entities.activeSession.exercises[0].sets[0].timing.durationSeconds = -1
  expect(() => parseSpottrBackup(JSON.stringify(malformed))).toThrow()
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'timed-backup.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect(page.getByRole('status').filter({ hasText: 'compatible and ready' })).toBeVisible()
  await enter(page, page.getByRole('button', { name: 'Restore backup' }))
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible()
  await page.reload()
  await enter(page, page.getByRole('button', { name: 'Resume Timed Row' }))
  await expect(weight).toHaveValue('43')
  await expect(page.getByText(`Duration 0:${String(set.timing.durationSeconds).padStart(2, '0')}`, { exact: true })).toBeVisible()
  await enter(page, page.getByRole('button', { name: 'Log Row set 2', exact: true }))
  await expect(page.getByText('2 of 2 sets logged · 0 skipped')).toBeVisible()
})
