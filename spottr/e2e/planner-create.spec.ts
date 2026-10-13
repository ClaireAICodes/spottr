import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { SpottrBackup } from '../src/backup'

async function reach(page: Page, target: Locator) {
  for (let step = 0; step < 100; step++) {
    if (await target.evaluate((node) => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}
async function enter(page: Page, target: Locator) {
  await reach(page, target)
  await page.keyboard.press('Enter')
}
async function type(page: Page, target: Locator, value: string) {
  await reach(page, target)
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(value)
}

async function navigateTab(page: Page, name: 'Workouts' | 'Settings') {
  // Only the selected roving tab participates in natural Tab navigation.
  await reach(page, page.getByRole('tab', { selected: true }))
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: 'Home', exact: true })).toBeFocused()
  if (name === 'Settings') {
    await page.keyboard.press('End')
  } else {
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Exercises', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowRight')
  }
  await expect(page.getByRole('tab', { name, exact: true })).toBeFocused()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
}

test('keyboard empty-library and mid-draft creation preserves targets, cancel focus and persisted shared references', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await enter(page, page.getByRole('button', { name: 'Manage gyms' }))
  await enter(page, page.getByRole('button', { name: 'Add gym', exact: true }))
  await type(page, page.getByLabel('Gym name'), 'North')
  await enter(page, page.getByRole('button', { name: 'Save gym' }))
  await navigateTab(page, 'Workouts')
  await enter(page, page.getByRole('button', { name: 'Add workout' }))
  await type(page, page.getByLabel('Workout name'), 'Strength')
  await enter(page, page.getByRole('button', { name: 'Create new exercise' }))
  await expect(page.getByLabel('Exercise name')).toBeFocused()
  await page.keyboard.type('Discard me')
  await enter(page, page.getByRole('button', { name: 'Cancel exercise' }))
  await expect(page.getByRole('button', { name: 'Create new exercise' })).toBeFocused()
  await expect(page.getByLabel('Workout name')).toHaveValue('Strength')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Row')
  await type(page, page.getByLabel('Muscle group'), 'Back')
  await type(page, page.getByLabel('Equipment'), 'Cable')
  await type(page, page.getByLabel('Setup notes'), 'Keep shoulders down')
  await enter(page, page.getByRole('button', { name: 'Save exercise' }))
  await expect(page.getByRole('combobox', { name: 'Set 1 type — Row, exercise 1' })).toBeFocused()
  await type(page, page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' }), '42')
  await type(page, page.getByRole('spinbutton', { name: 'Set 1 reps — Row, exercise 1' }), '12')
  await enter(page, page.getByRole('button', { name: 'Add set — Row, exercise 1' }))
  await type(page, page.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 1' }), '17')
  await type(page, page.getByRole('spinbutton', { name: 'Set 2 reps — Row, exercise 1' }), '8')
  await enter(page, page.getByRole('button', { name: 'Create new exercise' }))
  await page.keyboard.type('Discard mid-draft')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Create new exercise' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Squat')
  await enter(page, page.getByRole('button', { name: 'Save exercise' }))
  await expect(page.getByRole('combobox', { name: 'Set 1 type — Squat, exercise 2' })).toBeFocused()
  await expect(page.getByLabel('Workout name')).toHaveValue('Strength')
  await expect(page.getByRole('combobox', { name: 'Gym', exact: true }).locator('option:checked')).toHaveText('North')
  await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' })).toHaveValue('42')
  await expect(page.getByRole('spinbutton', { name: 'Set 1 reps — Row, exercise 1' })).toHaveValue('12')
  await expect(page.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 1' })).toHaveValue('17')
  await enter(page, page.getByRole('button', { name: 'Save workout' }))
  await expect(page.getByRole('button', { name: 'Edit Strength' })).toBeFocused()
  await page.reload()
  await navigateTab(page, 'Workouts')
  await enter(page, page.getByRole('button', { name: 'Edit Strength' }))
  await expect(page.getByRole('article', { name: 'Row sets' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Squat sets' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' })).toHaveValue('42')
  await expect(page.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 1' })).toHaveValue('17')
  await enter(page, page.getByRole('button', { name: 'Cancel', exact: true }))
  await navigateTab(page, 'Settings')
  const downloading = page.waitForEvent('download')
  await enter(page, page.getByRole('button', { name: 'Download backup' }))
  const backup: SpottrBackup = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(backup.entities.exercises.map((entry) => entry.name).sort()).toEqual(['Row', 'Squat'])
  const workout = backup.entities.workouts[0]
  expect(workout.name).toBe('Strength')
  expect(workout.gymId).toBe(backup.entities.gyms[0].id)
  expect(workout.exercises.map((entry) => backup.entities.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name)).toEqual(['Row', 'Squat'])
  expect(workout.exercises[0].sets.map(({ weight, reps }) => ({ weight, reps }))).toEqual([{ weight: 42, reps: 12 }, { weight: 17, reps: 8 }])
})
