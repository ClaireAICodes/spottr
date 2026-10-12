import { expect, test, type Page } from '@playwright/test'

// Intercept transaction lifetime only. All writes and verification use real
// IndexedDB and public UI; no repository/service result or database assertions.
async function hold(page: Page, store: string) {
  await page.evaluate((storeName) => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const tx = original.apply(this, args)
      if (args[1] === 'readwrite' && tx.objectStoreNames.contains(storeName)) {
        IDBDatabase.prototype.transaction = original
        let held = true
        Object.assign(window, { release: (abort: boolean) => { held = false; if (abort) tx.abort() } })
        const pump = () => { if (held) tx.objectStore(storeName).get('__hold__').onsuccess = pump }
        pump()
      }
      return tx
    }
  }, store)
}
async function release(page: Page, abort: boolean) {
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'release'))).toBe('function')
  await page.evaluate((value) => { Reflect.get(window, 'release')(value); Reflect.deleteProperty(window, 'release') }, abort)
}
async function setup(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  for (const name of ['North Gym', 'South Gym']) {
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill(name)
    await page.getByRole('button', { name: 'Save gym', exact: true }).click()
    await expect(page.getByRole('article', { name, exact: true })).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Row')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  await expect(page.getByRole('button', { name: 'Edit Row', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Strength')
  await page.getByRole('combobox', { name: 'Gym', exact: true }).selectOption({ label: 'North Gym' })
  await page.getByRole('button', { name: 'Add Row', exact: true }).click()
  await page.getByLabel('Set 1 weight').fill('42')
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('article', { name: 'Strength', exact: true })).toBeVisible()
}
const operations = ['gym create', 'gym update', 'gym select', 'gym delete', 'template create', 'template update', 'template duplicate', 'template delete', 'template variation'] as const
type Operation = typeof operations[number]
const isGym = (op: Operation) => op.startsWith('gym')
async function destination(page: Page, op: Operation) {
  await page.getByRole('tab', { name: isGym(op) ? 'Home' : 'Plan' }).click()
  if (isGym(op)) await page.getByRole('button', { name: 'Manage gyms' }).click()
}
async function prepare(page: Page, op: Operation) {
  await destination(page, op)
  if (op === 'gym create') {
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('New Gym')
  } else if (op === 'gym update') {
    await page.getByRole('button', { name: 'Edit South Gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('Changed Gym')
  } else if (op === 'gym delete') await page.getByRole('button', { name: 'Delete South Gym', exact: true }).click()
  else if (op === 'template create' || op === 'template update' || op === 'template variation') {
    await page.getByRole('button', { name: op === 'template create' ? 'Add workout' : 'Edit Strength', exact: true }).click()
    if (op !== 'template variation') await page.getByLabel('Workout name').fill('Changed Strength')
    if (op === 'template create') await page.getByRole('button', { name: 'Add Row', exact: true }).click()
  } else if (op === 'template duplicate') {
    await page.getByRole('button', { name: 'Duplicate Strength', exact: true }).click()
    await page.getByLabel('Duplicate to gym').selectOption({ label: 'South Gym' })
  } else if (op === 'template delete') await page.getByRole('button', { name: 'Delete Strength', exact: true }).click()
}
function submit(page: Page, op: Operation) {
  if (op === 'gym select') return page.getByRole('article', { name: 'South Gym', exact: true }).getByRole('button', { name: 'Select', exact: true })
  const name = op === 'gym create' ? 'Save gym' : op === 'gym update' ? 'Save changes' : op === 'gym delete' ? 'Delete gym' : op === 'template duplicate' ? 'Create duplicate' : op === 'template delete' ? 'Delete workout' : op === 'template variation' ? /Duplicate for variation/ : 'Save workout'
  return page.getByRole('button', { name, exact: typeof name === 'string' })
}
function store(op: Operation) { return op === 'gym select' ? 'settings' : isGym(op) ? 'gyms' : op === 'template variation' ? 'exercises' : 'workouts' }
async function verify(page: Page, op: Operation, committed: boolean, reload = true) {
  if (reload) await page.reload()
  await destination(page, op)
  if (isGym(op)) {
    await expect(page.getByRole('article')).toHaveCount(op === 'gym create' && committed ? 3 : op === 'gym delete' && committed ? 1 : 2)
    await expect(page.getByRole('article', { name: committed && op === 'gym update' ? 'Changed Gym' : 'South Gym', exact: true })).toHaveCount(committed && op === 'gym delete' ? 0 : 1)
    if (op === 'gym select') await expect(page.getByRole('article', { name: committed ? 'South Gym' : 'North Gym', exact: true })).toContainText('Current gym')
  } else {
    await expect(page.getByRole('article')).toHaveCount(committed && (op === 'template create' || op === 'template duplicate') ? 2 : committed && op === 'template delete' ? 0 : 1)
    if (committed && op === 'template duplicate') await expect(page.getByRole('article', { name: 'Strength copy', exact: true })).toContainText('South Gym')
    if (!(committed && op === 'template delete')) {
      await page.getByRole('button', { name: committed && op === 'template update' ? 'Edit Changed Strength' : 'Edit Strength', exact: true }).click()
      await expect(page.getByLabel('Set 1 weight')).toHaveValue('42')
      await expect(page.getByRole('article', { name: 'Row sets', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add Row variation', exact: true })).toHaveCount(committed && op === 'template variation' ? 1 : 0)
    }
  }
}
for (const [index, op] of operations.entries()) {
  if (op !== 'template variation') test(`${op}: committed write survives refresh abort and read-only retry`, async ({ page }) => {
    await setup(page)
    await prepare(page, op)
    await page.evaluate((storeName) => {
      const originalRead = IDBObjectStore.prototype.getAll
      const originalTransaction = IDBDatabase.prototype.transaction
      Object.assign(window, { writes: 0 })
      IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
        if (args[1] === 'readwrite') Reflect.set(window, 'writes', Reflect.get(window, 'writes') + 1)
        return originalTransaction.apply(this, args)
      }
      IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
        const request = originalRead.apply(this, args)
        if (this.name === storeName && this.transaction.mode === 'readonly') {
          IDBObjectStore.prototype.getAll = originalRead
          this.transaction.abort()
        }
        return request
      }
    }, isGym(op) ? 'gyms' : 'workouts')
    await submit(page, op).click()
    await expect(page.getByRole('alert')).toContainText('could not be loaded')
    const writes = await page.evaluate(() => Reflect.get(window, 'writes'))
    expect(writes).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Try again', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveCount(0)
    expect(await page.evaluate(() => Reflect.get(window, 'writes'))).toBe(writes)
    const focus = op === 'gym delete' ? 'Back to Home' : op === 'template delete' ? 'Add workout' : op === 'gym create' ? 'Edit New Gym' : op === 'gym update' ? 'Edit Changed Gym' : op === 'gym select' ? 'Edit South Gym' : op === 'template duplicate' ? 'Edit Strength copy' : 'Edit Changed Strength'
    await expect(page.getByRole('button', { name: focus, exact: true })).toBeFocused()
    await verify(page, op, true)
  })
  test(`${op}: repeated abort then keyboard retry`, async ({ page }) => {
    await page.setViewportSize({ width: [390, 834, 1440][index % 3], height: 844 })
    await setup(page)
    await prepare(page, op)
    for (let attempt = 0; attempt < 2; attempt++) {
      await hold(page, store(op))
      await submit(page, op).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('status')).toBeVisible()
      const pendingName = op.includes('delete') ? 'Deleting…' : op === 'template duplicate' ? 'Duplicating…' : op === 'gym select' ? 'Select' : op === 'template variation' ? /Duplicate for variation/ : 'Saving…'
      await expect(page.getByRole('button', { name: pendingName, exact: typeof pendingName === 'string' })).toBeDisabled()
      await release(page, true)
      await expect(page.getByRole('alert')).toBeVisible()
      if (op === 'gym create' || op === 'gym update') await expect(page.getByLabel('Gym name')).toHaveValue(op === 'gym create' ? 'New Gym' : 'Changed Gym')
      if (op === 'template create' || op === 'template update') await expect(page.getByLabel('Workout name')).toHaveValue('Changed Strength')
      if (op === 'template duplicate') await expect(page.getByLabel('Duplicate to gym').locator('option:checked')).toHaveText('South Gym')
    }
    await submit(page, op).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveCount(0)
    if (op === 'template variation') {
      await expect(page.getByRole('combobox', { name: 'Set 1 type — Row variation, exercise 1', exact: true })).toBeFocused()
      await expect(page.getByLabel('Set 1 weight')).toHaveValue('42')
      await page.getByRole('button', { name: 'Save workout', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Edit Strength', exact: true })).toBeFocused()
      await page.reload()
      await destination(page, op)
      await page.getByRole('button', { name: 'Edit Strength', exact: true }).click()
      await expect(page.getByRole('article', { name: 'Row variation sets', exact: true })).toBeVisible()
      await expect(page.getByLabel('Set 1 weight')).toHaveValue('42')
      await expect(page.getByRole('button', { name: 'Add Row variation', exact: true })).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Add Row', exact: true })).toHaveCount(1)
      await page.getByRole('tab', { name: 'Exercises' }).click()
      await expect(page.getByRole('article')).toHaveCount(2)
      await expect(page.getByRole('button', { name: 'Edit Row', exact: true })).toBeVisible()
      return
    } else {
      const focus = op === 'gym delete' ? 'Back to Home' : op === 'template delete' ? 'Add workout' : op === 'gym create' ? 'Edit New Gym' : op === 'gym update' ? 'Edit Changed Gym' : op === 'gym select' ? 'Edit South Gym' : op === 'template duplicate' ? 'Edit Strength copy' : 'Edit Changed Strength'
      await expect(page.getByRole('button', { name: focus, exact: true })).toBeFocused()
    }
    await verify(page, op, true)
  })
  for (const abort of [true, false]) {
    test(`${op}: ${op.includes('delete') ? 'contain dialog' : 'navigate'} during held write then ${abort ? 'abort' : 'commit'}, return and reload`, async ({ page }) => {
      await page.setViewportSize({ width: [390, 834, 1440][index % 3], height: 844 })
      await setup(page)
      await prepare(page, op)
      await hold(page, store(op))
      await submit(page, op).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('status')).toBeVisible()
      if (op.includes('delete')) {
        const dialog = page.getByRole('dialog')
        for (const key of ['Tab', 'Shift+Tab', 'Escape', 'Tab']) {
          await page.keyboard.press(key)
          await expect(dialog).toBeVisible()
          await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
        }
        await page.screenshot({ path: `evidence/screenshots/pending-${op.replace(' ', '-')}-${[390, 834, 1440][index % 3]}.png`, fullPage: true })
        await release(page, abort)
        if (abort) {
          await expect(page.getByRole('alert')).toBeVisible()
          await page.keyboard.press('Tab')
          await expect(page.getByRole('button', { name: isGym(op) ? 'Keep gym' : 'Keep workout', exact: true })).toBeFocused()
          await page.keyboard.press('Shift+Tab')
          await expect(submit(page, op)).toBeFocused()
          await page.keyboard.press('Escape')
          await expect(dialog).toHaveCount(0)
          await expect(page.getByRole('button', { name: isGym(op) ? 'Delete South Gym' : 'Delete Strength', exact: true })).toBeFocused()
        } else {
          await expect(dialog).toHaveCount(0)
          await expect(page.getByRole('button', { name: isGym(op) ? 'Back to Home' : 'Add workout', exact: true })).toBeFocused()
        }
        await verify(page, op, !abort)
        return
      }
      await page.getByRole('tab', { name: 'Exercises' }).click()
      await expect(page.getByRole('tab', { name: 'Exercises' })).toHaveAttribute('aria-selected', 'true')
      await release(page, abort)
      await verify(page, op, !abort, false)
      await verify(page, op, !abort)
    })
  }
}
