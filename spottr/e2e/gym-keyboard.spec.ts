import { expect, test, type Locator } from '@playwright/test'

for (const order of ['creation', 'reverse'] as const) {
test(`keyboard creates, selects and edits repeated long-name gyms in ${order} order`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // Control the ID generator, not storage: real IndexedDB still orders its keys.
  await page.addInitScript((displayOrder) => {
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ] as const
    let index = 0
    const original = crypto.randomUUID.bind(crypto)
    crypto.randomUUID = () => ids[displayOrder === 'creation' ? index++ : 1 - index++] ?? original()
  }, order)
  await page.goto('/')
  async function tabTo(name: string, target: Locator = page.getByRole('button', { name, exact: true })) {
    for (let i = 0; i < 40; i++) {
      if (await target.evaluate((node) => node === document.activeElement)) return
      await page.keyboard.press('Tab')
    }
    throw new Error(`Keyboard could not reach ${name}`)
  }
  await tabTo('Manage gyms')
  await page.keyboard.press('Enter')
  const name = 'Northside Strength and Conditioning Training Centre'
  for (const address of ['First location', 'Second location']) {
    await tabTo('Add gym')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Gym name')).toBeFocused()
    await page.keyboard.type(name)
    await page.keyboard.press('Tab')
    await page.keyboard.type(address)
    await tabTo('Save gym')
    await page.keyboard.press('Enter')
    const saved = page.getByRole('article').filter({ has: page.getByText(address, { exact: true }) })
    await expect(saved.getByRole('button', { name: /^Edit / })).toBeFocused()
  }
  const articles = page.getByRole('article')
  const first = articles.filter({ has: page.getByText('First location', { exact: true }) })
  const second = articles.filter({ has: page.getByText('Second location', { exact: true }) })
  const secondPosition = order === 'creation' ? 2 : 1
  await expect(articles.nth(secondPosition - 1)).toContainText('Second location')
  for (const [article, position, selected] of [[first, 3 - secondPosition, true], [second, secondPosition, false]] as const) {
    await expect(article.getByRole('button', { name: `Edit ${name}, gym ${position}`, exact: true })).toBeVisible()
    await expect(article.getByRole('button', { name: `Delete ${name}, gym ${position}`, exact: true })).toBeVisible()
    await expect(article.getByRole('button', { name: `${selected ? 'Selected' : 'Select'} ${name}, gym ${position}`, exact: true })).toBeVisible()
  }
  await tabTo('Select second location', second.getByRole('button', { name: /^Select / }))
  await page.keyboard.press('Enter')
  await expect(second.getByRole('button', { name: /^Edit / })).toBeFocused()
  await expect(second.getByRole('button', { name: /^Selected / })).toBeDisabled()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Address (optional)')).toHaveValue('Second location')
  await tabTo('Save changes')
  await page.keyboard.press('Enter')
  await expect(second.getByRole('button', { name: /^Edit / })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath(`gym-keyboard-${order}-mobile.png`) })
  await page.reload()
  await expect(page.getByRole('button', { name: `Start workout at ${name}`, exact: true })).toBeVisible()
  await tabTo('Manage gyms')
  await page.keyboard.press('Enter')
  await expect(second.getByRole('button', { name: /^Selected / })).toBeDisabled()
  await tabTo('Edit second location', second.getByRole('button', { name: /^Edit / }))
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Address (optional)')).toHaveValue('Second location')
})
}
