import { expect, test, type Page } from '@playwright/test'

async function records(page: Page, name: string, store: string) {
  return page.evaluate(async ({ name, store }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const values = await new Promise<{ id: string; name: string; editorIntentId?: string; numericBuffers?: Record<string, string> }[]>((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    db.close(); return values
  }, { name, store })
}

async function prepare(page: Page) {
  await page.goto('/spottr/#/gyms')
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Recovery gym')
  await page.getByRole('button', { name: 'Save gym', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Recovery gym' })).toBeVisible()
  await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
  await page.getByRole('button', { name: 'Add workout', exact: true }).click()
  await page.getByLabel('Workout name', { exact: true }).fill('Reload workout')
  await page.getByRole('button', { name: 'Create new exercise', exact: true }).click()
  await page.getByLabel('Exercise name', { exact: true }).fill('Reload row')
  await page.getByLabel('Setup notes').fill('Keep nested notes')
}

// Fault only the native storage boundary, not service IDs, queues, or reads.
// The one-shot flag survives page.reload so the recovered page is unmodified.
async function installFault(page: Page) {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === 'drafts' && value.saved && sessionStorage.getItem('failWorkoutReceipt') === 'armed') {
        sessionStorage.removeItem('failWorkoutReceipt'); throw new Error('Workout receipt unavailable after commit')
      }
      if (this.name === 'drafts' && value.created && sessionStorage.getItem('failReceipt') === 'armed') {
        sessionStorage.removeItem('failReceipt'); throw new Error('Receipt storage unavailable after commit')
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key)
    }
    const remove = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function(key) {
      if (this.name === 'drafts' && key === 'authoring' && sessionStorage.getItem('failCleanup') === 'armed') {
        sessionStorage.removeItem('failCleanup'); throw new Error('Cleanup unavailable after commit')
      }
      return remove.call(this, key)
    }
  })
}

test('ordinary reload and original Save reconcile a committed workout after native cleanup failure', async ({ page }) => {
  await installFault(page)
  await prepare(page)
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => sessionStorage.setItem('failCleanup', 'armed'))
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Cleanup unavailable')
  const original = await records(page, 'spottr-v1-workouts', 'workouts')
  expect(original).toHaveLength(1)
  await page.reload()
  await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('Reload workout')
  await expect(page.getByRole('status').filter({ hasText: 'Workout operation' })).toContainText('committed')
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit Reload workout', exact: true })).toBeVisible()
  expect((await records(page, 'spottr-v1-workouts', 'workouts')).map(record => record.id)).toEqual(original.map(record => record.id))
})

test('invalid empty workout can be corrected after ordinary reload and saves once', async ({ page }) => {
  await prepare(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel exercise', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Add at least one exercise')
  expect(await records(page, 'spottr-v1-workouts', 'workouts')).toHaveLength(0)
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('Reload workout')
  await page.getByRole('button', { name: 'Create new exercise', exact: true }).click()
  await page.getByLabel('Exercise name', { exact: true }).fill('Corrected row')
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit Reload workout', exact: true })).toBeVisible()
  expect(await records(page, 'spottr-v1-workouts', 'workouts')).toHaveLength(1)
  expect((await records(page, 'spottr-drafts-v1', 'drafts')).filter(value => value.id === 'authoring')).toHaveLength(0)
})

test('later update reconciles its atomic outcome after lost receipt and ordinary reload', async ({ page }) => {
  await installFault(page)
  await prepare(page)
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => sessionStorage.setItem('failCleanup', 'armed'))
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Cleanup unavailable')
  const original = await records(page, 'spottr-v1-workouts', 'workouts')
  await page.getByLabel('Workout name', { exact: true }).fill('Later committed workout')
  await page.evaluate(() => sessionStorage.setItem('failWorkoutReceipt', 'armed'))
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Workout receipt unavailable')
  await page.reload()
  await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('Later committed workout')
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit Later committed workout', exact: true })).toBeVisible()
  expect((await records(page, 'spottr-v1-workouts', 'workouts')).map(value => ({ id: value.id, name: value.name }))).toEqual([{ id: original[0].id, name: 'Later committed workout' }])
  expect((await records(page, 'spottr-drafts-v1', 'drafts')).filter(value => value.id === 'authoring')).toHaveLength(0)
})

for (const action of ['nested', 'variation']) test(`ordinary reload reconciles indeterminate ${action} into the original library target`, async ({ page }) => {
  await installFault(page)
  await prepare(page)
  if (action === 'variation') {
    await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.evaluate(() => sessionStorage.setItem('failReceipt', 'armed'))
  const actionButton = () => action === 'nested' ? page.getByRole('button', { name: 'Save exercise', exact: true }) : page.getByRole('button', { name: 'Duplicate for variation — Reload row, exercise 1', exact: true })
  await actionButton().click()
  await expect(page.getByRole('alert')).toContainText('Receipt storage unavailable')
  const committed = await records(page, 'spottr-v1-exercises', 'exercises')
  expect(committed).toHaveLength(action === 'nested' ? 1 : 2)
  await page.reload()
  if (action === 'nested') {
    await expect(page.getByLabel('Exercise name', { exact: true })).toHaveValue('Reload row')
    await expect(page.getByLabel('Setup notes')).toHaveValue('Keep nested notes')
  } else await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('Reload workout')
  await expect(page.getByRole('status').filter({ hasText: 'Library operation' })).toContainText('pending or unknown')
  await actionButton().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('article', { name: action === 'nested' ? 'Reload row sets' : 'Reload row variation sets' })).toBeVisible()
  expect((await records(page, 'spottr-v1-exercises', 'exercises')).map(record => record.id).sort()).toEqual(committed.map(record => record.id).sort())
  await page.getByLabel('Workout name', { exact: true }).fill('Later parent edits stay editable')
  await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('Later parent edits stay editable')
})
