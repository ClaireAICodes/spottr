import { test, expect } from '@playwright/test'

test('held native Save, History remount, discard and same-template equal-revision reopen preserve the new editor', async ({ page }) => {
  await page.goto('/spottr/#/gyms')
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Intent gym')
  await page.getByRole('button', { name: 'Save gym', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Intent gym' })).toBeVisible()
  await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
  await page.getByRole('button', { name: 'Add workout', exact: true }).click()
  await page.getByLabel('Workout name', { exact: true }).fill('Intent workout')
  await page.getByRole('button', { name: 'Create new exercise', exact: true }).click()
  await page.getByLabel('Exercise name', { exact: true }).fill('Intent row')
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Intent workout', exact: true }).click()
  const readDraft = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('spottr-drafts-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const value = await new Promise<{ editorIntentId: string; revision: number }>((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get('authoring'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    db.close(); return value
  })
  // History forces a real owner flush, then returns to a fresh planner mount.
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Back to workouts', exact: true }).click()
  const captured = await readDraft()
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      void navigator.locks.request('spottr-workout-gym-integrity', async () => {
        resolve()
        await new Promise<void>(release => { (window as unknown as { releaseIntentSave: () => void }).releaseIntentSave = release })
      })
    })
  })
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByLabel('Workout name', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Back to workouts', exact: true }).click()
  await expect(page.getByLabel('Workout name', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Intent workout', exact: true }).click()
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Back to workouts', exact: true }).click()
  const reopened = await readDraft()
  expect(reopened.revision).toBe(captured.revision)
  expect(reopened.editorIntentId).not.toBe(captured.editorIntentId)
  await page.evaluate(() => (window as unknown as { releaseIntentSave: () => void }).releaseIntentSave())
  await expect(page.getByLabel('Workout name', { exact: true })).toBeEnabled()
  await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('Intent workout')
  expect((await readDraft()).editorIntentId).toBe(reopened.editorIntentId)
  await page.getByLabel('Workout name', { exact: true }).fill('New intent stays editable')
  await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('New intent stays editable')
})
