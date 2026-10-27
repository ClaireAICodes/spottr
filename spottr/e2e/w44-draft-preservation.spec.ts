import { test, expect } from '@playwright/test'

test('opening History must not discard an unfinished workout', async ({ page }) => {
  await page.goto('/spottr/#/gyms')
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Draft safety gym')
  await page.getByRole('button', { name: 'Save gym', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Draft safety gym' })).toBeVisible()
  await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
  await page.getByRole('button', { name: 'Add workout', exact: true }).click()
  await page.getByLabel('Workout name', { exact: true }).fill('Keep my unfinished routine')
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Back to workouts', exact: true }).click()
  await expect(page.getByLabel('Workout name', { exact: true })).toHaveValue('Keep my unfinished routine')
})
