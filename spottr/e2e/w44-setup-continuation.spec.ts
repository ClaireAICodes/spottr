import { expect, test } from '@playwright/test'

test('Home offers a useful first gym action on an empty dataset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 })
  await page.goto('/spottr/#/home')
  const add = page.getByRole('button', { name: 'Add your first gym', exact: true })
  await expect(add).toBeEnabled()
  await add.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'evidence/run572/empty-home-390x667.png', fullPage: true })
  await add.click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await expect(page.getByLabel('Gym name')).toBeVisible()
})

test('Home continues from a saved gym into workout authoring instead of a disabled Start', async ({ page }) => {
  await page.goto('/spottr/#/gyms')
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Continuation Gym')
  await page.getByRole('button', { name: 'Save gym', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Continuation Gym', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Home', exact: true }).click()
  const create = page.getByRole('button', { name: 'Create workout', exact: true })
  await expect(create).toBeEnabled()
  await create.click()
  await expect(page.getByRole('tab', { name: 'Workouts', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Add workout', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add workout', exact: true }).click()
  await expect(page.getByLabel('Workout name', { exact: true })).toBeVisible()
})
