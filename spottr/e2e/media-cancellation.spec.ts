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

for (const exit of ['Cancel', 'departure'] as const) {
  test(`video preparation ${exit} before commit preserves an empty library attachment through reload and backup`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill('Preparation probe')
    await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
    const article = page.getByRole('article', { name: 'Preparation probe', exact: true })
    const picker = article.getByLabel('Add image or video — Preparation probe', { exact: true })
    await tabTo(page, picker)
    const choosing = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await (await choosing).setFiles(resolve('e2e/fixtures/owned-motion-vp8.webm'))
    const progress = article.getByRole('progressbar', { name: 'Preparing media — Preparation probe', exact: true })
    await expect(progress).toBeVisible()
    await expect.poll(() => progress.evaluate((node: HTMLProgressElement) => node.value)).toBeGreaterThan(0)
    if (exit === 'Cancel') {
      const cancel = article.getByRole('button', { name: 'Cancel media preparation — Preparation probe', exact: true })
      await tabTo(page, cancel)
      await page.keyboard.press('Enter')
      await expect(picker).toBeEnabled()
      await expect(picker).toBeFocused()
      await expect(article.getByRole('status')).toContainText('cancelled')
      await expect(article.getByRole('listitem')).toHaveCount(0)
    } else {
      await tabTo(page, page.getByRole('tab', { name: 'Exercises', exact: true }))
      await page.keyboard.press('End')
      await expect(page.getByRole('tab', { name: 'Settings', exact: true })).toBeFocused()
    }
    // Let real preparation settle; use a public export after returning/reloading,
    // not direct IndexedDB inspection or an injected service response.
    await page.waitForTimeout(2500)
    await page.reload()
    await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
    await expect(article.getByRole('listitem')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Settings', exact: true }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download backup', exact: true }).click()
    const backup = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
    expect(backup.entities.exercises).toHaveLength(1)
    expect(backup.entities.exercises[0].media).toEqual([])
  })
}
