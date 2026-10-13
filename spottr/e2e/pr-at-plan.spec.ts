import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

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

test('keyboard PR at planned targets offers accept and decline, preserving targets and history on reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await enter(page, page.getByRole('button', { name: 'Manage gyms' }))
  await enter(page, page.getByRole('button', { name: 'Add gym', exact: true }))
  await type(page, page.getByLabel('Gym name'), 'North Gym')
  await enter(page, page.getByRole('button', { name: 'Save gym' }))
  await tab(page, 'Workouts')
  await enter(page, page.getByRole('button', { name: 'Add workout' }))
  await type(page, page.getByLabel('Workout name'), 'Planned Records')
  await enter(page, page.getByRole('button', { name: 'Create new exercise' }))
  await page.keyboard.type('Row')
  await enter(page, page.getByRole('button', { name: 'Save exercise' }))
  await type(page, page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' }), '40')
  await type(page, page.getByRole('spinbutton', { name: 'Set 1 reps — Row, exercise 1' }), '8')
  await enter(page, page.getByRole('button', { name: 'Add set — Row, exercise 1' }))
  await type(page, page.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 1' }), '45')
  await type(page, page.getByRole('spinbutton', { name: 'Set 2 reps — Row, exercise 1' }), '8')
  await enter(page, page.getByRole('button', { name: 'Save workout' }))
  await tab(page, 'Home')
  await enter(page, page.getByRole('button', { name: 'Start workout at North Gym' }))
  await enter(page, page.getByRole('button', { name: 'Start Planned Records', exact: true }))
  await enter(page, page.getByRole('button', { name: 'Log Row set 1', exact: true }))
  await enter(page, page.getByRole('button', { name: 'Stop rest' }))
  await enter(page, page.getByRole('button', { name: 'Log Row set 2', exact: true }))
  await enter(page, page.getByRole('button', { name: 'Finish workout' }))
  const first = page.getByRole('group', { name: 'Future target for Row set 1' })
  const second = page.getByRole('group', { name: 'Future target for Row set 2' })
  await expect(first).toContainText('Current target: 40 kg × 8 reps')
  await expect(second).toContainText('Current target: 45 kg × 8 reps')
  await enter(page, first.getByRole('button', { name: 'Use this target' }))
  await expect(first.getByRole('status')).toBeFocused()
  await expect(first).toContainText('Target updated')
  await enter(page, second.getByRole('button', { name: 'Keep current target' }))
  await expect(second.getByRole('status')).toBeFocused()
  await expect(second).toContainText('Current target kept')
  await page.reload()
  await tab(page, 'Settings')
  const downloading = page.waitForEvent('download')
  await enter(page, page.getByRole('button', { name: 'Download backup' }))
  const backup = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(backup.entities.workouts[0].exercises[0].sets.map((set: { weight: number; reps: number }) => [set.weight, set.reps])).toEqual([[40, 8], [45, 8]])
  expect(backup.entities.completedSessions[0].exercises[0].sets).toMatchObject([
    { targetWeight: 40, weight: 40, reps: 8, personalRecords: ['weight', 'set-volume'], targetDecision: 'accepted' },
    { targetWeight: 45, weight: 45, reps: 8, personalRecords: ['weight', 'set-volume'], targetDecision: 'declined' },
  ])
})
