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

async function choose(page: Page, picker: Locator, file: string) {
  await tabTo(page, picker)
  const choosing = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await choosing).setFiles(resolve(file))
}

async function holdWrite(page: Page) {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const tx = original.apply(this, args)
      if (args[1] === 'readwrite' && tx.objectStoreNames.contains('exercises')) {
        IDBDatabase.prototype.transaction = original
        let held = true
        Object.assign(window, { abortMediaWrite: () => { held = false; tx.abort() } })
        const pump = () => {
          if (held) tx.objectStore('exercises').get('__media_retry_hold__').onsuccess = pump
        }
        pump()
      }
      return tx
    }
  })
}

async function exportBackup(page: Page) {
  await tabTo(page, page.getByRole('tab', { name: 'Exercises', exact: true }))
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Settings', exact: true })).toBeFocused()
  const downloading = page.waitForEvent('download')
  await tabTo(page, page.getByRole('button', { name: 'Download backup', exact: true }))
  await page.keyboard.press('Enter')
  return JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
}

test('held repeated media write failures preserve committed content and allow a keyboard retry across reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Held retry')
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  const article = page.getByRole('article', { name: 'Held retry', exact: true })
  const picker = article.getByLabel('Add image or video — Held retry', { exact: true })
  await choose(page, picker, 'e2e/fixtures/owned-setup.png')
  await expect(article.getByRole('listitem')).toHaveCount(1)
  await expect(picker).toBeEnabled()
  const original = await exportBackup(page)
  const exercisesTab = page.getByRole('tab', { name: 'Exercises', exact: true })
  await tabTo(page, page.getByRole('tab', { name: 'Settings', exact: true }))
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await expect(exercisesTab).toBeFocused()

  for (let attempt = 0; attempt < 2; attempt++) {
    await holdWrite(page)
    await choose(page, picker, 'e2e/fixtures/owned-motion-vp8.webm')
    await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'abortMediaWrite')), { timeout: 15000 }).toBe('function')
    await expect(picker).toBeDisabled()
    await expect(article.getByRole('status')).toHaveText('Saving prepared media…')
    await expect(article.getByRole('listitem')).toHaveCount(1)
    await page.evaluate(() => {
      Reflect.get(window, 'abortMediaWrite')()
      Reflect.deleteProperty(window, 'abortMediaWrite')
    })
    await expect(page.getByRole('alert')).toContainText('owned-motion-vp8.webm:')
    await expect(picker).toBeEnabled()
    await expect(picker).toBeFocused()
    await expect(article.getByRole('listitem')).toHaveCount(1)
    const failed = await exportBackup(page)
    expect(failed.entities).toEqual(original.entities)
    await tabTo(page, page.getByRole('tab', { name: 'Settings', exact: true }))
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    await expect(exercisesTab).toBeFocused()
  }

  await choose(page, picker, 'e2e/fixtures/owned-motion-vp8.webm')
  await expect(article.getByRole('listitem')).toHaveCount(2)
  await expect(picker).toBeEnabled()
  await expect(picker).toBeFocused()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const successful = await exportBackup(page)
  expect(successful.entities.exercises).toHaveLength(1)
  expect(successful.entities.exercises[0].id).toBe(original.entities.exercises[0].id)
  expect(successful.entities.exercises[0].media[0]).toEqual(original.entities.exercises[0].media[0])
  expect(successful.entities.exercises[0].media.map((media: { name: string }) => media.name)).toEqual(['owned-setup.png', 'owned-motion-vp8.webm'])
  await page.reload()
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await expect(article.getByRole('listitem')).toHaveCount(2)
  const reloaded = await exportBackup(page)
  delete successful.exportedAt
  delete reloaded.exportedAt
  expect(reloaded).toEqual(successful)
})
