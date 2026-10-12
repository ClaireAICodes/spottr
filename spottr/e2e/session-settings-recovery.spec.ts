import { expect, test, type Page } from '@playwright/test'

async function prepareWorkout(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Recovery Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  for (const name of ['Row', 'Press']) {
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill(name)
    await page.getByRole('button', { name: 'Save exercise' }).click()
  }
  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Recovery Strength')
  await page.getByRole('button', { name: 'Add Row', exact: true }).click()
  await page.getByRole('button', { name: 'Add Press', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout' }).click()
  await page.getByRole('tab', { name: 'Home' }).click()
}

async function start(page: Page) {
  await page.getByRole('button', { name: 'Start workout at Recovery Gym' }).click()
  await page.getByRole('button', { name: 'Start Recovery Strength', exact: true }).click()
}

test('failed settings read leaves keyboard exit and retry, preserving saved workout progress', async ({ page }) => {
  await prepareWorkout(page)
  await start(page)
  await page.getByLabel('Row set 1 weight').fill('81')
  await page.getByRole('button', { name: 'Log Row set 1', exact: true }).click()
  await page.getByRole('button', { name: 'Skip exercise Press', exact: true }).click()
  await expect(page.getByText('1 of 2 sets logged · 1 skipped')).toBeVisible()
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get
    let fail = true
    IDBObjectStore.prototype.get = function (key) {
      if (this.transaction.db.name === 'spottr-v1-settings' && this.name === 'settings' && fail) {
        fail = false
        throw new DOMException('Injected settings read failure', 'UnknownError')
      }
      return get.call(this, key)
    }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Resume Recovery Strength' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Your saved settings could not be loaded')
  const exit = page.getByRole('button', { name: 'Exit workout', exact: true })
  await expect(exit).toBeFocused()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await page.screenshot({ path: 'evidence/screenshots/settings-failure-exit.png' })
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Resume Recovery Strength' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Retry saved settings' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Recovery Strength', exact: true })).toBeFocused()
  await expect(page.getByText('1 of 2 sets logged · 1 skipped')).toBeVisible()
  await expect(page.getByLabel('Row set 1 weight')).toHaveValue('81')
  await expect(page.getByRole('timer', { name: 'Rest timer' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
})

for (const entry of ['resume', 'new session']) {
  test(`held settings read permits keyboard exit on ${entry} and focuses execution after resolution`, async ({ page }) => {
    await prepareWorkout(page)
    if (entry === 'resume') {
      await start(page)
      await page.getByLabel('Row set 1 weight').fill('63')
      await page.getByRole('button', { name: 'Log Row set 1', exact: true }).click()
      await page.getByRole('button', { name: 'Skip exercise Press', exact: true }).click()
      await expect(page.getByText('1 of 2 sets logged · 1 skipped')).toBeVisible()
    }
    await page.addInitScript(() => {
      const get = IDBObjectStore.prototype.get
      IDBObjectStore.prototype.get = function (key) {
        const request = get.call(this, key)
        if (this.transaction.db.name === 'spottr-v1-settings' && this.name === 'settings') {
          request.addEventListener('success', (event) => {
            event.stopImmediatePropagation()
            Object.assign(window, { releaseSettingsRead: () => request.onsuccess?.call(request, event) })
          }, { once: true })
        }
        return request
      }
    })
    await page.reload()
    const resume = page.getByRole('button', { name: 'Resume Recovery Strength' })
    if (entry === 'resume') await resume.click()
    else await start(page)
    await expect(page.getByRole('status')).toHaveText('Loading saved settings…')
    await expect(page.getByRole('button', { name: 'Exit workout', exact: true })).toBeFocused()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await page.screenshot({ path: `evidence/screenshots/settings-pending-${entry.replace(' ', '-')}.png` })
    await page.keyboard.press('Enter')
    await expect(resume).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Exit workout', exact: true })).toBeFocused()
    await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseSettingsRead'))).toBe('function')
    await page.evaluate(() => Reflect.get(window, 'releaseSettingsRead')())
    await expect(page.getByRole('heading', { name: 'Recovery Strength', exact: true })).toBeFocused()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
    if (entry === 'resume') {
      await expect(page.getByText('1 of 2 sets logged · 1 skipped')).toBeVisible()
      await expect(page.getByLabel('Row set 1 weight')).toHaveValue('63')
      await expect(page.getByRole('timer', { name: 'Rest timer' })).toBeVisible()
    } else {
      await expect(page.getByText('0 of 2 sets logged')).toBeVisible()
    }
    await page.screenshot({ path: `evidence/screenshots/settings-resolved-${entry.replace(' ', '-')}.png` })
  })
}
