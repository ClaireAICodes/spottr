import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots')

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

test('captures 390px shell and verifies keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(5)
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Train' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Train' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Home' })).toBeFocused()
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-shell-390x844.png'), fullPage: true })
})

test('captures desktop shell without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
  await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Resume your session' })).toBeVisible()
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-shell-1440x900.png'), fullPage: true })
})
