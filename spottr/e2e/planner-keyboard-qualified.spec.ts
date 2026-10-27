import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../src/settings'

const stamp = '2026-10-05T00:00:00.000Z'
function fixture(collision: boolean) {
  return {
    format: 'spottr-backup', version: 1, exportedAt: stamp, settings: DEFAULT_SETTINGS,
    entities: {
      gyms: [{ id: 'north', name: 'North', address: '', createdAt: stamp, updatedAt: stamp }], selectedGymId: 'north',
      exercises: ['Row', 'Squat'].map(name => ({ id: name.toLowerCase(), name, muscleGroup: '', equipment: '', notes: '', media: [], createdAt: stamp, updatedAt: stamp })),
      workouts: [{ id: 'template', name: collision ? 'Collision' : 'Strength', gymId: 'north', createdAt: stamp, updatedAt: stamp,
        exercises: [
          { id: 'shared', exerciseId: 'row', sets: [{ id: 'shared', kind: 'working', weight: 42, reps: 12 }, { id: 'other', kind: 'drop', weight: 17, reps: 8 }] },
          { id: 'squat-entry', exerciseId: 'squat', sets: [{ id: 'other', kind: 'working', weight: 60, reps: 5 }, ...(collision ? [{ id: 'shared', kind: 'working', weight: 25, reps: 8 }] : [])] },
        ] }], activeSession: null, completedSessions: [],
    },
  }
}
async function setup(page: Page, collision: boolean) {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'keyboard.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture(collision))) })
  await expect(page.getByRole('status').filter({ hasText: 'compatible and ready' })).toContainText('replaces all data')
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Replace all saved data', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Replace all saved data', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toContainText('Your previous Spottr data was replaced', { timeout: 15000 })
  await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
  await expect(page.getByRole('button', { name: collision ? 'Edit Collision' : 'Edit Strength', exact: true })).toBeVisible()
}
async function enter(page: Page, name: string) {
  const target = page.getByRole('button', { name, exact: true })
  for (let i = 0; i < 90; i++) {
    const state = await target.evaluate(el => ({ focused: el === document.activeElement, preceding: document.activeElement !== document.body && !!document.activeElement && !!(document.activeElement.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) }))
    if (state.focused) break
    await page.keyboard.press(state.preceding ? 'Shift+Tab' : 'Tab')
  }
  await expect(target).toBeFocused()
  await page.keyboard.press('Enter')
}
async function focused(page: Page, role: 'button' | 'combobox', name: string) {
  const target = page.getByRole(role, { name, exact: true })
  await expect(target).toBeFocused()
  expect(await target.evaluate(el => el.isConnected)).toBe(true)
}

test.describe('imported overlapping identities', () => {
  test.beforeEach(async ({ page }) => { await setup(page, true) })
  test('oracle rejects wrong scoped destination and wrong row association', async ({ page }, info) => {
    await enter(page, 'Edit Collision')
    await enter(page, 'Move set 1 down — Row, exercise 1')
    await focused(page, 'button', 'Move set 2 up — Row, exercise 1')
    const failures: string[] = []
    for (const assertion of [
      () => expect(page.getByRole('button', { name: 'Move set 2 up — Squat, exercise 2', exact: true })).toBeFocused({ timeout: 100 }),
      () => expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1', exact: true })).toHaveValue('42', { timeout: 100 }),
    ]) {
      try { await assertion() } catch (error) { failures.push(String(error)) }
    }
    await info.attach('negative-control-failures', { body: failures.join('\n\n'), contentType: 'text/plain' })
    expect(failures).toHaveLength(2)
  })
  test('contiguous natural keyboard collision journey', async ({ page }) => {
    await enter(page, 'Edit Collision')
    await enter(page, 'Move set 1 down — Row, exercise 1')
    await focused(page, 'button', 'Move set 2 up — Row, exercise 1')
    await enter(page, 'Move exercise down — Row, exercise 1')
    await focused(page, 'button', 'Move exercise up — Row, exercise 2')
    await enter(page, 'Move exercise up — Row, exercise 2')
    await focused(page, 'button', 'Move exercise down — Row, exercise 1')
    await enter(page, 'Remove set 2 — Row, exercise 1')
    await focused(page, 'combobox', 'Set 1 type — Row, exercise 1')
    await enter(page, 'Move exercise down — Row, exercise 1')
    await focused(page, 'button', 'Move exercise up — Row, exercise 2')
    await enter(page, 'Remove Squat — Squat, exercise 1')
    await focused(page, 'button', 'Add set — Row, exercise 1')
    await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1', exact: true })).toHaveValue('17')
  })
})

test.describe('save and cancel associations', () => {
  test.beforeEach(async ({ page }) => { await setup(page, false) })
  test('contiguous natural keyboard reorder save reopen cancel journey', async ({ page }) => {
    await enter(page, 'Edit Strength')
    await enter(page, 'Move exercise down — Row, exercise 1')
    await focused(page, 'button', 'Move exercise up — Row, exercise 2')
    await enter(page, 'Move set 1 down — Row, exercise 2')
    await focused(page, 'button', 'Move set 2 up — Row, exercise 2')
    await expect(page.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 2', exact: true })).toHaveValue('42')
    await enter(page, 'Remove set 2 — Row, exercise 2')
    await focused(page, 'combobox', 'Set 1 type — Row, exercise 2')
    await enter(page, 'Remove Squat — Squat, exercise 1')
    await focused(page, 'button', 'Add set — Row, exercise 1')
    await enter(page, 'Save workout')
    await focused(page, 'button', 'Edit Strength')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('article', { name: 'Squat sets', exact: true })).toHaveCount(0)
    await expect(page.getByRole('article', { name: 'Row sets', exact: true }).getByRole('spinbutton', { name: /weight/ })).toHaveValue('17')
    await enter(page, 'Cancel')
    await focused(page, 'button', 'Edit Strength')
  })
})
