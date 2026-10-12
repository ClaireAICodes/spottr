import { expect, test, type Locator } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { SpottrBackup } from '../src/backup'

test('public restore preserves keyboard focus with repeated set and overlapping exercise identities', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('North')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('tab', { name: 'Train' }).click()
  for (const name of ['Row', 'Squat']) {
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill(name)
    await page.getByRole('button', { name: 'Save exercise' }).click()
  }
  await page.getByRole('tab', { name: 'Settings' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const backup: SpottrBackup = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  backup.entities.workouts = [{
    id: 'collision', name: 'Collision', gymId: backup.entities.gyms[0].id,
    createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z',
    exercises: [
      { id: 'shared', exerciseId: backup.entities.exercises.find(e => e.name === 'Row')!.id, sets: [{ id: 'shared', kind: 'working', weight: 42, reps: 12 }, { id: 'other', kind: 'drop', weight: 17, reps: 8 }] },
      { id: 'squat-entry', exerciseId: backup.entities.exercises.find(e => e.name === 'Squat')!.id, sets: [{ id: 'other', kind: 'working', weight: 60, reps: 5 }, { id: 'shared', kind: 'working', weight: 25, reps: 8 }] },
    ],
  }]
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'collision.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByRole('status').filter({ hasText: 'compatible and ready' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore backup' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible()
  await page.getByRole('tab', { name: 'Plan', exact: true }).click()
  async function enter(name: string) {
    const target = page.getByRole('button', { name, exact: true })
    for (let i = 0; i < 90 && !await target.evaluate(node => node === document.activeElement); i++) await page.keyboard.press('Tab')
    await expect(target).toBeFocused()
    await page.keyboard.press('Enter')
  }
  await enter('Edit Collision')
  await enter('Move set 1 down — Row, exercise 1')
  await expect(page.getByRole('button', { name: 'Move set 2 up — Row, exercise 1', exact: true })).toBeFocused()
  await enter('Move exercise down — Row, exercise 1')
  await expect(page.getByRole('button', { name: 'Move exercise up — Row, exercise 2', exact: true })).toBeFocused()
  await enter('Move exercise up — Row, exercise 2')
  await expect(page.getByRole('button', { name: 'Move exercise down — Row, exercise 1', exact: true })).toBeFocused()
  await enter('Remove set 2 — Row, exercise 1')
  await expect(page.getByRole('combobox', { name: 'Set 1 type — Row, exercise 1', exact: true })).toBeFocused()
  await enter('Move exercise down — Row, exercise 1')
  await expect(page.getByRole('button', { name: 'Move exercise up — Row, exercise 2', exact: true })).toBeFocused()
  await enter('Remove Squat — Squat, exercise 1')
  await expect(page.getByRole('button', { name: 'Add set — Row, exercise 1', exact: true })).toBeFocused()
  await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1', exact: true })).toHaveValue('17')
})

for (const width of [390, 834, 1440]) {
  test(`keyboard planner reorder/remove/save/cancel associations at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    // Setup uses public UI; all planner interactions below use keyboard only.
    await page.getByRole('button', { name: 'Manage gyms' }).click()
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('North')
    await page.getByRole('button', { name: 'Save gym' }).click()
    await page.getByRole('tab', { name: 'Train' }).click()
    for (const name of ['Row', 'Squat']) {
      await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
      await page.getByLabel('Exercise name').fill(name)
      await page.getByRole('button', { name: 'Save exercise' }).click()
    }
    async function tabTo(target: Locator) {
      await expect(target).toBeVisible()
      for (let i = 0; i < 90; i++) {
        if (await target.evaluate(node => node === document.activeElement)) return
        await page.keyboard.press('Tab')
      }
      throw new Error('Keyboard destination not reached')
    }
    async function enter(name: string) {
      const target = page.getByRole('button', { name, exact: true })
      await tabTo(target)
      await page.keyboard.press('Enter')
    }
    await tabTo(page.getByRole('tab', { name: 'Train' }))
    await page.keyboard.press('ArrowRight')
    await enter('Add workout')
    await expect(page.getByLabel('Workout name')).toBeFocused()
    await page.keyboard.type('Strength')
    await enter('Add Row')
    const weight = page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1', exact: true })
    await tabTo(weight)
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('42')
    await enter('Add set — Row, exercise 1')
    const second = page.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 1', exact: true })
    await tabTo(second)
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('17')
    await enter('Add Squat')
    await enter('Move exercise down — Row, exercise 1')
    await expect(page.getByRole('button', { name: 'Move exercise up — Row, exercise 2', exact: true })).toBeFocused()
    await enter('Move set 1 down — Row, exercise 2')
    await expect(page.getByRole('button', { name: 'Move set 2 up — Row, exercise 2', exact: true })).toBeFocused()
    await expect(page.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 2', exact: true })).toHaveValue('42')
    await enter('Remove set 2 — Row, exercise 2')
    await expect(page.getByRole('combobox', { name: 'Set 1 type — Row, exercise 2', exact: true })).toBeFocused()
    await enter('Remove Squat — Squat, exercise 1')
    await expect(page.getByRole('button', { name: 'Add set — Row, exercise 1', exact: true })).toBeFocused()
    await page.screenshot({ path: test.info().outputPath(`planner-remove-${width}.png`) })
    await enter('Save workout')
    await expect(page.getByRole('button', { name: 'Edit Strength', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('combobox', { name: 'Gym', exact: true }).locator('option:checked')).toHaveText('North')
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1', exact: true })).toHaveValue('17')
    await expect(page.getByRole('article', { name: 'Squat sets', exact: true })).toHaveCount(0)
    await enter('Remove Row — Row, exercise 1')
    await expect(page.getByRole('searchbox', { name: 'Search shared exercises' })).toBeFocused()
    await enter('Cancel')
    await expect(page.getByRole('button', { name: 'Edit Strength', exact: true })).toBeFocused()
    await page.screenshot({ path: test.info().outputPath(`planner-saved-${width}.png`) })
    await page.reload()
    await tabTo(page.getByRole('tab', { name: 'Home' }))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await enter('Edit Strength')
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1', exact: true })).toHaveValue('17')
    await expect(page.getByRole('article', { name: 'Squat sets', exact: true })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: 'Gym', exact: true }).locator('option:checked')).toHaveText('North')
    await enter('Save workout')
    await expect(page.getByRole('button', { name: 'Edit Strength', exact: true })).toBeFocused()
  })
}
