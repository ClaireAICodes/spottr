import { expect, test } from '@playwright/test'

for (const view of ['Workouts', 'History']) {
  test(`${view} keyboard settings retry keeps focus after repeated failure and success`, async ({ page }) => {
    await page.addInitScript(() => {
      const get = IDBObjectStore.prototype.get
      let failures = 2
      IDBObjectStore.prototype.get = function (key) {
        if (this.transaction.db.name === 'spottr-v1-settings' && this.name === 'settings' && failures-- > 0) {
          throw new DOMException('Injected settings read failure', 'UnknownError')
        }
        return get.call(this, key)
      }
    })
    await page.goto(view === 'History' ? '/#/history' : '/')
    if (view === 'Workouts') await page.getByRole('tab', { name: view, exact: true }).click()
    const retry = page.getByRole('button', { name: 'Retry saved settings' })
    await retry.focus()
    await page.keyboard.press('Enter')
    await expect(retry).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: view, exact: true, level: 1 })).toBeFocused()
    await expect(retry).toHaveCount(0)
    await expect(page.getByRole('heading', { name: view, exact: true, level: 1 })).toHaveJSProperty('tabIndex', -1)
    await expect.poll(() => page.getByRole('heading', { name: view, exact: true, level: 1 }).evaluate((node) => node.matches(':focus-visible'))).toBe(true)
    await page.screenshot({ path: `evidence/screenshots/settings-retry-${view.toLowerCase()}.png` })
  })
}

for (const view of ['Workouts', 'History']) {
  test(`${view} held settings retry cannot reclaim focus after navigation away and back`, async ({ page }) => {
    await page.addInitScript(() => {
      const get = IDBObjectStore.prototype.get
      let fail = true
      IDBObjectStore.prototype.get = function (key) {
        const isSettings = this.transaction.db.name === 'spottr-v1-settings' && this.name === 'settings'
        if (isSettings && fail) {
          fail = false
          throw new DOMException('Injected settings read failure', 'UnknownError')
        }
        const request = get.call(this, key)
        if (isSettings) {
          request.addEventListener('success', (event) => {
            event.stopImmediatePropagation()
            Object.assign(window, { releaseSettingsRead: () => request.onsuccess?.call(request, event) })
          }, { once: true })
        }
        return request
      }
    })
    await page.goto(view === 'History' ? '/#/history' : '/')
    if (view === 'Workouts') await page.getByRole('tab', { name: view, exact: true }).click()
    await page.getByRole('button', { name: 'Retry saved settings' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toHaveText('Loading saved settings…')
    const returnTab = page.getByRole('tab', { name: 'Workouts', exact: true })
    await returnTab.focus()
    await page.keyboard.press('ArrowLeft')
    if (view === 'History') {
      await page.goBack()
      await expect(page).toHaveURL(/#\/history$/)
      await returnTab.focus()
    } else await page.keyboard.press('ArrowRight')
    await expect(returnTab).toBeFocused()
    await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseSettingsRead'))).toBe('function')
    await page.evaluate(() => Reflect.get(window, 'releaseSettingsRead')())
    await expect(page.getByRole('status', { name: '', exact: true }).filter({ hasText: 'Loading saved settings' })).toHaveCount(0)
    await expect(returnTab).toBeFocused()
    await expect(page.getByRole('heading', { name: view, exact: true, level: 1 })).toBeVisible()
  })
}
