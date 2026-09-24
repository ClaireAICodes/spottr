import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots')

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

test('persists a two-gym journey with manual fallback and destructive confirmation', async ({ context, page }) => {
  await context.clearPermissions()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Northside')
  await page.getByLabel('Address (optional)').fill('12 River Road')
  await page.getByRole('button', { name: 'Save gym' }).click()

  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Downtown')
  await page.getByLabel('Address (optional)').fill('8 Market Street')
  await page.getByRole('button', { name: 'Use current location' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter an address manually instead')
  await page.getByRole('button', { name: 'Save gym' }).click()

  const downtown = page.getByRole('article', { name: 'Downtown' })
  await downtown.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Gym name').fill('Downtown Strength')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('article', { name: 'Downtown Strength' }).getByRole('button', { name: 'Select' }).click()
  await expect(page.getByRole('article', { name: 'Downtown Strength' }).getByText('Current gym')).toBeVisible()
  await page.reload()

  await expect(page.getByRole('button', { name: 'Start workout at Downtown Strength' })).toBeVisible()
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('article', { name: 'Downtown Strength' }).getByText('Current gym')).toBeVisible()

  await page.getByRole('button', { name: 'Delete Northside' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete Northside?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep gym' }).click()
  await expect(page.getByRole('article', { name: 'Northside' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete Northside' }).click()
  await page.getByRole('dialog', { name: 'Delete Northside?' }).getByRole('button', { name: 'Delete gym' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start workout at Downtown Strength' })).toBeVisible()
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article', { name: 'Northside' })).toHaveCount(0)
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(horizontalOverflow).toBe(0)
  const remainingDelete = page.getByRole('button', { name: 'Delete Downtown Strength' })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(remainingDelete).toBeVisible()
  const actionIsAboveNavigation = await page.evaluate(() => {
    const action = document.querySelector<HTMLButtonElement>('[aria-label="Delete Downtown Strength"]')
    const navigation = document.querySelector<HTMLElement>('.primary-nav')
    return Boolean(action && navigation && action.getBoundingClientRect().bottom <= navigation.getBoundingClientRect().top)
  })
  expect(actionIsAboveNavigation).toBe(true)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-gyms-390x844.png') })
})
