import { expect, test, type Page } from '@playwright/test'

// Keep the actual transaction alive until the test chooses commit or abort.
// Aborted writes never reach durable storage; application services are not mocked.
async function armWrite(page: Page, store: string) {
  await page.evaluate((storeName) => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const transaction = original.apply(this, args)
      if (args[1] === 'readwrite' && transaction.objectStoreNames.contains(storeName)) {
        IDBDatabase.prototype.transaction = original
        let held = true
        Object.assign(window, { releaseWrite: (abort: boolean) => {
          held = false
          if (abort) transaction.abort()
        } })
        const keepAlive = () => {
          if (!held) return
          transaction.objectStore(storeName).get('__recovery_hold__').onsuccess = keepAlive
        }
        keepAlive()
      }
      return transaction
    }
  }, store)
}

async function releaseWrite(page: Page, abort = true) {
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseWrite'))).toBe('function')
  await page.evaluate((shouldAbort) => {
    Reflect.get(window, 'releaseWrite')(shouldAbort)
    Reflect.deleteProperty(window, 'releaseWrite')
  }, abort)
}

async function gymSetup(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  for (const name of ['North Gym', 'South Gym']) {
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill(name)
    await page.getByRole('button', { name: 'Save gym', exact: true }).click()
    await expect(page.getByRole('article', { name, exact: true })).toBeVisible()
  }
}

async function templateSetup(page: Page) {
  await gymSetup(page)
  await page.getByRole('tab', { name: 'Train' }).click()
  for (const name of ['Row', 'Press']) {
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill(name)
    await page.getByRole('button', { name: 'Save exercise' }).click()
    await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Strength')
  await page.getByRole('button', { name: 'Add Row', exact: true }).click()
  await page.getByLabel('Set 1 weight').fill('42')
  await page.getByRole('button', { name: 'Add Press', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('article', { name: 'Strength', exact: true })).toBeVisible()
}

test('gym create failure announces pending, preserves input, cancels without commit and retries', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gymSetup(page)
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Recovery Gym')
  await page.getByLabel('Address (optional)').fill('12 River Road')
  await armWrite(page, 'gyms')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await expect(page.getByRole('status')).toHaveText('Saving gym…')
  await expect(page.getByLabel('Gym name')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await releaseWrite(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Gym name')).toHaveValue('Recovery Gym')
  await expect(page.getByLabel('Address (optional)')).toHaveValue('12 River Road')
  await page.screenshot({ path: 'evidence/screenshots/gym-recovery-failure-390.png', fullPage: true })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Recovery Gym')
  await armWrite(page, 'gyms')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await releaseWrite(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Save gym' }).click()
  await expect(page.getByRole('article', { name: 'Recovery Gym', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
})

for (const operation of ['update', 'select', 'delete'] as const) {
  test(`gym ${operation}: pending, abort, public noncommit, retry`, async ({ page }) => {
    await gymSetup(page)
    const south = page.getByRole('article', { name: 'South Gym', exact: true })
    if (operation === 'update') {
      await south.getByRole('button', { name: 'Edit South Gym' }).click()
      await page.getByLabel('Gym name').fill('South Changed')
    } else if (operation === 'delete') await south.getByRole('button', { name: 'Delete South Gym' }).click()
    await armWrite(page, operation === 'select' ? 'settings' : 'gyms')
    const submit = operation === 'update' ? page.getByRole('button', { name: 'Save changes' })
      : operation === 'select' ? south.getByRole('button', { name: 'Select', exact: true })
      : page.getByRole('button', { name: 'Delete gym', exact: true })
    await submit.click()
    await expect(page.getByRole('status')).toHaveText(operation === 'update' ? 'Saving gym…' : operation === 'select' ? 'Selecting gym…' : 'Deleting gym…')
    await releaseWrite(page)
    await expect(page.getByRole('alert')).toBeVisible()
    if (operation === 'update') {
      await expect(page.getByLabel('Gym name')).toHaveValue('South Changed')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    } else if (operation === 'delete') await page.getByRole('button', { name: 'Keep gym' }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Start workout at North Gym' })).toBeVisible()
    await page.getByRole('button', { name: 'Manage gyms' }).click()
    await expect(south).toBeVisible()
    if (operation === 'update') {
      await south.getByRole('button', { name: 'Edit South Gym' }).click()
      await page.getByLabel('Gym name').fill('South Changed')
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(page.getByRole('article', { name: 'South Changed', exact: true })).toBeVisible()
    } else if (operation === 'select') {
      await submit.click()
      await expect(south.getByText('Current gym')).toBeVisible()
    } else {
      await south.getByRole('button', { name: 'Delete South Gym' }).click()
      await page.getByRole('button', { name: 'Delete gym', exact: true }).click()
      await expect(south).toHaveCount(0)
    }
  })
}

test('template save keeps reordered and removed draft after abort; retry commits only intended targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await templateSetup(page)
  await page.getByRole('button', { name: 'Edit Strength', exact: true }).click()
  await page.getByLabel('Workout name').fill('Recovered Strength')
  await page.getByRole('article', { name: 'Row sets' }).getByRole('button', { name: 'Add set' }).click()
  await page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 2 weight').fill('17')
  await page.getByRole('article', { name: 'Row sets' }).getByRole('button', { name: 'Move set 2 up' }).click()
  await page.getByRole('article', { name: 'Press sets' }).getByRole('button', { name: 'Move exercise up' }).click()
  await page.getByRole('article', { name: 'Row sets' }).getByRole('button', { name: 'Remove set 2' }).click()
  await armWrite(page, 'workouts')
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('status')).toHaveText('Saving workout…')
  await expect(page.getByLabel('Workout name')).toBeDisabled()
  await releaseWrite(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Workout name')).toHaveValue('Recovered Strength')
  await expect(page.getByRole('article', { name: /sets$/ }).first()).toHaveAttribute('aria-label', 'Press sets')
  await expect(page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 weight')).toHaveValue('17')
  await page.screenshot({ path: 'evidence/screenshots/template-recovery-failure-390.png', fullPage: true })
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('article', { name: 'Recovered Strength', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Edit Recovered Strength' }).click()
  await expect(page.getByRole('article', { name: /sets$/ }).first()).toHaveAttribute('aria-label', 'Press sets')
  await expect(page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 weight')).toHaveValue('17')
  await expect(page.getByRole('article', { name: 'Row sets' }).getByRole('spinbutton')).toHaveCount(2)
})

for (const operation of ['duplicate', 'delete', 'variation'] as const) {
  test(`template ${operation}: pending, abort, preserved context, retry`, async ({ page }) => {
    await templateSetup(page)
    if (operation === 'duplicate') {
      await page.getByRole('button', { name: 'Duplicate Strength', exact: true }).click()
      await page.getByLabel('Duplicate to gym').selectOption({ label: 'South Gym' })
    } else if (operation === 'delete') await page.getByRole('button', { name: 'Delete Strength', exact: true }).click()
    else await page.getByRole('button', { name: 'Edit Strength', exact: true }).click()
    const submit = operation === 'duplicate' ? page.getByRole('button', { name: 'Create duplicate' })
      : operation === 'delete' ? page.getByRole('button', { name: 'Delete workout', exact: true })
      : page.getByRole('article', { name: 'Row sets' }).getByRole('button', { name: 'Duplicate for variation' })
    await armWrite(page, operation === 'variation' ? 'exercises' : 'workouts')
    await submit.click()
    await expect(page.getByRole('status')).toHaveText(operation === 'duplicate' ? 'Duplicating workout…' : operation === 'delete' ? 'Deleting workout…' : 'Creating exercise variation…')
    await releaseWrite(page)
    await expect(page.getByRole('alert')).toBeVisible()
    if (operation === 'duplicate') await expect(page.getByLabel('Duplicate to gym').locator('option:checked')).toHaveText('South Gym')
    if (operation === 'variation') await expect(page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 weight')).toHaveValue('42')
    const persisted = await page.context().newPage()
    await persisted.goto('/')
    await persisted.getByRole('tab', { name: 'Plan' }).click()
    await expect(persisted.getByRole('article', { name: 'Strength', exact: true })).toBeVisible()
    await expect(persisted.getByRole('article')).toHaveCount(1)
    await persisted.getByRole('button', { name: 'Edit Strength', exact: true }).click()
    await expect(persisted.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 weight')).toHaveValue('42')
    await expect(persisted.getByRole('button', { name: 'Add Row variation', exact: true })).toHaveCount(0)
    await persisted.close()
    await submit.click()
    if (operation === 'duplicate') {
      await expect(page.getByRole('article', { name: 'Strength copy', exact: true })).toContainText('South Gym')
    } else if (operation === 'delete') await expect(page.getByRole('article', { name: 'Strength', exact: true })).toHaveCount(0)
    else {
      await expect(page.getByRole('article', { name: 'Row variation sets' })).toBeVisible()
      await page.getByRole('button', { name: 'Save workout' }).click()
      await expect(page.getByRole('region', { name: 'Edit Strength', exact: true })).toHaveCount(0)
    }
    await page.reload()
    await page.getByRole('tab', { name: 'Plan' }).click()
    if (operation === 'duplicate') await expect(page.getByRole('article')).toHaveCount(2)
    else if (operation === 'delete') await expect(page.getByRole('article')).toHaveCount(0)
    else {
      await page.getByRole('button', { name: 'Edit Strength', exact: true }).click()
      await expect(page.getByRole('article', { name: 'Row variation sets' }).getByLabel('Set 1 weight')).toHaveValue('42')
    }
  })
}

test('new template failure retains draft, retries; cancelled structural edits never commit', async ({ page }) => {
  await templateSetup(page)
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('New draft')
  await page.getByRole('button', { name: 'Add Row', exact: true }).click()
  await page.getByLabel('Set 1 reps').fill('13')
  await armWrite(page, 'workouts')
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('status')).toHaveText('Saving workout…')
  await releaseWrite(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Workout name')).toHaveValue('New draft')
  await expect(page.getByLabel('Set 1 reps')).toHaveValue('13')
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('article', { name: 'New draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit Strength', exact: true }).click()
  await page.getByRole('article', { name: 'Press sets' }).getByRole('button', { name: 'Move exercise up' }).click()
  await page.getByRole('article', { name: 'Row sets' }).getByRole('button', { name: 'Remove Row' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit Strength', exact: true })).toBeFocused()
  await page.reload()
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.getByRole('button', { name: 'Edit Strength', exact: true }).click()
  await expect(page.getByRole('article', { name: /sets$/ }).first()).toHaveAttribute('aria-label', 'Row sets')
  await expect(page.getByRole('article', { name: /sets$/ })).toHaveCount(2)
  await expect(page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 weight')).toHaveValue('42')
})

for (const screen of ['gym', 'template'] as const) {
  test(`${screen} load: pending, announced read failure, retry without mutation`, async ({ page }) => {
    await templateSetup(page)
    await page.getByRole('tab', { name: 'Home' }).click()
    await page.evaluate((storeName) => {
      const original = IDBObjectStore.prototype.getAll
      IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
        const request = original.apply(this, args)
        if (this.name === storeName) {
          IDBObjectStore.prototype.getAll = original
          request.addEventListener('success', (event) => {
            event.stopImmediatePropagation()
            Object.assign(window, { failRead: () => request.onerror?.call(request, new Event('error')) })
          }, { once: true })
        }
        return request
      }
    }, screen === 'gym' ? 'gyms' : 'workouts')
    if (screen === 'gym') await page.getByRole('button', { name: 'Manage gyms' }).click()
    else await page.getByRole('tab', { name: 'Plan' }).click()
    await expect(page.getByRole('status')).toHaveText(screen === 'gym' ? 'Loading your gyms…' : 'Loading workouts…')
    await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'failRead'))).toBe('function')
    await page.evaluate(() => Reflect.get(window, 'failRead')())
    await expect(page.getByRole('alert')).toContainText('Your existing data has not been changed')
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(screen === 'gym' ? 2 : 1)
  })
}
