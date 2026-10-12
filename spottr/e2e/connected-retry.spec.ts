import { expect, test, type Page } from '@playwright/test'

// Hold a real transaction, then abort it: no service or persisted result mocks.
async function holdDuplicate(page: Page) {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const transaction = original.apply(this, args)
      if (args[1] === 'readwrite' && transaction.objectStoreNames.contains('workouts')) {
        IDBDatabase.prototype.transaction = original
        let held = true
        Object.assign(window, { abortDuplicate: () => { held = false; transaction.abort() } })
        const keepAlive = () => {
          if (held) transaction.objectStore('workouts').get('__retry_hold__').onsuccess = keepAlive
        }
        keepAlive()
      }
      return transaction
    }
  })
}

for (const width of [390, 834, 1440]) {
  test(`connected duplicate retry preserves destination and keyboard focus at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Manage gyms' }).click()
    for (const name of ['North Gym', 'South Gym']) {
      await page.getByRole('button', { name: 'Add gym', exact: true }).click()
      await page.getByLabel('Gym name').fill(name)
      await page.getByRole('button', { name: 'Save gym', exact: true }).click()
      await expect(page.getByRole('article', { name, exact: true })).toBeVisible()
    }
    await page.getByRole('tab', { name: 'Train' }).click()
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill('Row')
    await page.getByRole('button', { name: 'Save exercise' }).click()
    await expect(page.getByRole('button', { name: 'Edit Row', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Plan' }).click()
    await page.getByRole('button', { name: 'Add workout' }).click()
    await page.getByLabel('Workout name').fill('Strength')
    await page.getByRole('combobox', { name: 'Gym', exact: true }).selectOption({ label: 'North Gym' })
    await page.getByRole('button', { name: 'Add Row', exact: true }).click()
    await page.getByLabel('Set 1 weight').fill('42')
    await page.getByLabel('Set 1 reps').fill('13')
    await page.getByRole('button', { name: 'Save workout' }).click()
    await expect(page.getByRole('article', { name: 'Strength', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Duplicate Strength', exact: true }).click()
    await page.getByLabel('Duplicate to gym').selectOption({ label: 'South Gym' })
    for (let attempt = 0; attempt < 2; attempt++) {
      await holdDuplicate(page)
      const submit = page.getByRole('button', { name: 'Create duplicate' })
      await submit.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('status')).toHaveText('Duplicating workout…')
      await expect(page.getByLabel('Duplicate to gym')).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Duplicating…' })).toBeDisabled()
      await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'abortDuplicate'))).toBe('function')
      await page.evaluate(() => { Reflect.get(window, 'abortDuplicate')(); Reflect.deleteProperty(window, 'abortDuplicate') })
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page.getByLabel('Duplicate to gym').locator('option:checked')).toHaveText('South Gym')
    }
    await page.getByRole('tab', { name: 'Home' }).click()
    await page.getByRole('tab', { name: 'Plan' }).click()
    await expect(page.getByRole('article')).toHaveCount(1)
    await page.getByRole('button', { name: 'Edit Strength', exact: true }).click()
    await expect(page.getByLabel('Set 1 weight')).toHaveValue('42')
    await expect(page.getByLabel('Set 1 reps')).toHaveValue('13')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Duplicate Strength', exact: true }).click()
    await page.getByLabel('Duplicate to gym').selectOption({ label: 'South Gym' })
    await page.getByRole('button', { name: 'Create duplicate' }).focus()
    await page.keyboard.press('Enter')
    const copy = page.getByRole('article', { name: 'Strength copy', exact: true })
    await expect(copy).toContainText('South Gym')
    await expect(copy.getByRole('button', { name: 'Edit Strength copy', exact: true })).toBeFocused()
    await page.screenshot({ path: `evidence/screenshots/connected-retry-${width}.png`, fullPage: true })
    await page.reload()
    await page.getByRole('tab', { name: 'Plan' }).click()
    await expect(page.getByRole('article')).toHaveCount(2)
    await expect(page.getByRole('article', { name: 'Strength', exact: true })).toContainText('North Gym')
    await expect(copy).toContainText('South Gym')
    await copy.getByRole('button', { name: 'Edit Strength copy', exact: true }).click()
    await expect(page.getByLabel('Set 1 weight')).toHaveValue('42')
    await expect(page.getByLabel('Set 1 reps')).toHaveValue('13')
    await expect(page.getByRole('combobox', { name: 'Gym', exact: true }).locator('option:checked')).toHaveText('South Gym')
  })
}
