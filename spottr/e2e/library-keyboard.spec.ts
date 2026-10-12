import { expect, test, type Locator } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

for (const order of ['creation', 'reverse'] as const) {
  test(`keyboard saves repeated library destinations in ${order} order`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript((order) => {
      let index = 0
      const original = crypto.randomUUID.bind(crypto)
      const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'] as const
      crypto.randomUUID = () => ids[order === 'creation' ? index++ : 1 - index++] ?? original()
    }, order)
    await page.goto('/')
    async function tabTo(target: Locator) {
      for (let i = 0; i < 60; i++) {
        if (await target.evaluate((node) => node === document.activeElement)) return
        await page.keyboard.press('Tab')
      }
      throw new Error('Keyboard could not reach public action')
    }
    await tabTo(page.getByRole('tab', { selected: true }))
    await page.keyboard.press('ArrowRight')
    const name = 'Northside Strength and Conditioning Training Centre'
    for (const notes of ['First destination', 'Second destination']) {
      await tabTo(page.getByRole('button', { name: 'Add exercise', exact: true }))
      await page.keyboard.press('Enter')
      await expect(page.getByLabel('Exercise name')).toBeFocused()
      await page.keyboard.type(name)
      await tabTo(page.getByRole('textbox', { name: 'Notes', exact: true }))
      await page.keyboard.type(notes)
      await tabTo(page.getByRole('button', { name: 'Save exercise', exact: true }))
      await page.keyboard.press('Enter')
      const saved = page.getByRole('article').filter({ has: page.getByText(notes, { exact: true }) })
      await expect(saved.getByRole('button', { name: /^Edit / })).toBeFocused()
    }
    const articles = page.getByRole('article')
    const second = articles.filter({ has: page.getByText('Second destination', { exact: true }) })
    const position = order === 'creation' ? 2 : 1
    await expect(articles.nth(position - 1)).toContainText('Second destination')
    await expect(second.getByRole('button', { name: `Edit ${name}, exercise ${position}`, exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Second destination')
    await tabTo(page.getByRole('button', { name: 'Save changes', exact: true }))
    await page.keyboard.press('Enter')
    await expect(second.getByRole('button', { name: /^Edit / })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`library-${order}-mobile.png`) })
    await page.reload()
    await tabTo(page.getByRole('tab', { selected: true }))
    await page.keyboard.press('ArrowRight')
    await expect(second).toBeVisible()
    // Public picker uploads identical files; observe order/actions only through UI.
    const picker = second.getByLabel(/^Add image or video/)
    for (let i = 0; i < 2; i++) {
      await picker.setInputFiles({ name: 'same.webm', mimeType: 'video/webm', buffer: await readFile(resolve('e2e/fixtures/owned-motion-vp8.webm')) })
      await expect(second.getByRole('listitem')).toHaveCount(i + 1)
    }
    const context = `${name}, exercise ${position}`
    await expect(second.getByRole('button', { name: `Move same.webm up — ${context}, media 2`, exact: true })).toBeEnabled()
    await tabTo(second.getByRole('button', { name: `Remove same.webm — ${context}, media 2`, exact: true }))
    await page.keyboard.press('Enter')
    await expect(second.getByRole('listitem')).toHaveCount(1)
    await expect(articles.filter({ has: page.getByText('First destination', { exact: true }) }).getByRole('listitem')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`library-${order}-media-mobile.png`) })
    await page.reload()
    await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
    await expect(second.getByRole('listitem')).toHaveCount(1)
  })
}
