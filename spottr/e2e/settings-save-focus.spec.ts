import { expect, test } from '@playwright/test'

for (const failure of [false, true]) {
  for (const departure of ['stay', 'tab', 'pointer', 'navigation'] as const) {
    test(`held Settings ${failure ? 'failure/retry' : 'success'} ${departure}`, async ({ page }) => {
      await page.addInitScript(({ failure }) => {
        const transaction = IDBDatabase.prototype.transaction
        let held = false
        Object.assign(window, { settingsWrites: 0 })
        IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
          const tx = transaction.apply(this, args)
          if (this.name === 'spottr-v1-settings' && args[1] === 'readwrite') {
            Reflect.set(window, 'settingsWrites', Reflect.get(window, 'settingsWrites') + 1)
            if (!held) {
              held = true
              const type = failure ? 'abort' : 'complete'
              tx.addEventListener(type, event => {
                event.stopImmediatePropagation()
                Object.assign(window, { releaseSave: () => failure ? tx.onabort?.call(tx, event) : tx.oncomplete?.call(tx, event) })
              }, { once: true })
              if (failure) {
                const put = IDBObjectStore.prototype.put
                const store = tx.objectStore('settings')
                store.put = function (...values: Parameters<IDBObjectStore['put']>) {
                  const request = put.apply(this, values)
                  request.addEventListener('success', () => tx.abort(), { once: true })
                  return request
                }
                const objectStore = tx.objectStore.bind(tx)
                tx.objectStore = name => name === 'settings' ? store : objectStore(name)
              }
            }
          }
          return tx
        } as IDBDatabase['transaction']
      }, { failure })
      await page.goto('/')
      await page.getByRole('tab', { name: 'Settings', exact: true }).click()
      await page.getByLabel('Rest duration (seconds)').fill('120')
      const save = page.getByRole('button', { name: 'Save settings', exact: true })
      for (let i = 0; i < 25 && !(await save.evaluate(n => n === document.activeElement)); i++) await page.keyboard.press('Tab')
      await expect(save).toBeFocused()
      await page.keyboard.press('Enter')
      const pending = page.getByRole('button', { name: 'Saving…', exact: true })
      await expect(pending).toBeDisabled()
      await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseSave'))).toBe('function')
      await page.keyboard.press('Enter')
      expect(await page.evaluate(() => Reflect.get(window, 'settingsWrites'))).toBe(1)
      if (departure === 'tab') await page.keyboard.press('Tab')
      if (departure === 'pointer') await page.getByLabel('Weight unit').click()
      if (departure === 'navigation') await page.getByRole('tab', { name: 'History', exact: true }).click()
      const destination = await page.evaluate(() => { const n = document.activeElement; return { tag: n?.tagName, text: n?.textContent, id: n?.id } })
      await page.evaluate(() => Reflect.get(window, 'releaseSave')())
      if (departure !== 'navigation') {
        await expect(save).toBeEnabled()
        if (failure) await expect(page.getByRole('alert')).toContainText('cancelled')
        else await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible()
      }
      if (departure === 'stay') {
        await expect(save).toBeFocused()
        expect(await save.evaluate(n => n.matches(':focus-visible'))).toBe(true)
        if (failure) {
          await page.keyboard.press('Enter')
          await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible()
          await expect(save).toBeFocused()
        }
        await page.reload()
        await page.getByRole('tab', { name: 'Settings', exact: true }).click()
        await expect(page.getByLabel('Rest duration (seconds)')).toHaveValue('120')
      } else {
        await expect.poll(() => page.evaluate(() => { const n = document.activeElement; return { tag: n?.tagName, text: n?.textContent, id: n?.id } })).toEqual(destination)
      }
      await page.screenshot({ path: test.info().outputPath('settled.png') })
    })
  }
}
