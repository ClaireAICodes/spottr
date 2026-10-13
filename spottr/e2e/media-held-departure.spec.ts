import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate(node => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Public media action could not be reached by keyboard')
}

test('departure during the second held media write preserves only the already committed first file', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Held preparation')
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  const article = page.getByRole('article', { name: 'Held preparation', exact: true })
  const picker = article.getByLabel('Add image or video — Held preparation', { exact: true })

  // Hold transaction lifetime, not service results. The first real write commits;
  // the second real write stays uncommitted until explicitly released below.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    let writes = 0
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const tx = original.apply(this, args)
      if (args[1] === 'readwrite' && tx.objectStoreNames.contains('exercises') && ++writes === 2) {
        IDBDatabase.prototype.transaction = original
        let held = true
        Object.assign(window, { releaseMediaWrite: () => { held = false } })
        const pump = () => {
          if (held) tx.objectStore('exercises').get('__media_boundary_hold__').onsuccess = pump
        }
        pump()
      }
      return tx
    }
  })
  await tabTo(page, picker)
  const choosing = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await choosing).setFiles([
    resolve('e2e/fixtures/owned-setup.png'),
    resolve('e2e/fixtures/owned-motion-vp8.webm'),
  ])
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseMediaWrite')), { timeout: 15000 }).toBe('function')
  await expect(article.getByRole('listitem')).toHaveCount(1)
  await expect(article.getByRole('listitem')).toContainText('owned-setup.png')

  await tabTo(page, page.getByRole('tab', { name: 'Exercises', exact: true }))
  await page.keyboard.press('End')
  const settings = page.getByRole('tab', { name: 'Settings', exact: true })
  await expect(settings).toBeFocused()
  await page.evaluate(() => {
    Reflect.get(window, 'releaseMediaWrite')()
    Reflect.deleteProperty(window, 'releaseMediaWrite')
  })
  // Export queues behind pending service writes: its completion is a bounded
  // settlement barrier, not a guessed delay or a direct database assertion.
  const downloading = page.waitForEvent('download')
  await tabTo(page, page.getByRole('button', { name: 'Download backup', exact: true }))
  await page.keyboard.press('Enter')
  const backup = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(backup.entities.exercises[0].media.map((media: { name: string }) => media.name)).toEqual(['owned-setup.png'])
  await page.reload()
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await expect(article.getByRole('listitem')).toHaveCount(1)
  await expect(article.getByRole('listitem')).toContainText('owned-setup.png')
})
