import { test, expect } from '@playwright/test'

test.use({ hasTouch: true })

test('shell_editingText_hidesPillWithoutBlurringInput', async ({ page }) => {
  await page.goto('/spottr/')
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  const search = page.getByRole('searchbox', { name: 'Search exercises' })
  await search.click()
  await search.pressSequentially('Bench')
  await expect(search).toBeFocused()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden()
  expect(await search.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
  await search.press('Tab')
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
})

for (const [width, height] of [[320,667],[390,667],[390,844],[834,844],[1440,844]]) {
  test(`shell_${width}x${height}_floatingNavigationRemainsReachable`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/spottr/')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toBeVisible()
    const box = await nav.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(12)
    expect(box!.y + box!.height).toBeLessThanOrEqual(height - 12)
    for (const tab of await nav.getByRole('tab').all()) {
      const target = await tab.boundingBox()
      expect(target!.width).toBeGreaterThanOrEqual(44)
      expect(target!.height).toBeGreaterThanOrEqual(44)
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
    }
    await page.screenshot({ path: `evidence/w44-shell-${width}x${height}.png`, fullPage: true })
  })
}
