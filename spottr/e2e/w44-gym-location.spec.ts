import { test, expect } from '@playwright/test'

for (const width of [320, 390, 834, 1440]) {
  test(`manual offline fallback and granted location survive reload at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 1.3521, longitude: 103.8198, accuracy: 12 })
    await page.goto('./#/gyms')
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('Granted location gym')
    await page.getByRole('button', { name: 'Use current location', exact: true }).click()
    await expect(page.getByText('Current location added. You can still enter a readable address.')).toBeVisible()
    await page.getByRole('button', { name: 'Save gym', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Granted location gym' }).getByText('Location saved')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('article', { name: 'Granted location gym' }).getByText('Location saved')).toBeVisible()
    // Public browser boundary: simulate denied permission, not native iPhone permission proof.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', { value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1 } as GeolocationPositionError),
      } })
    })
    await page.reload()
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('Manual offline gym')
    await page.getByLabel('Address (optional)').fill('Retained manual address')
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Use current location', exact: true }).click()
    await expect(page.getByText('Location unavailable. Enter details manually.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry location' })).toBeVisible()
    const save = page.getByRole('button', { name: 'Save gym', exact: true })
    await expect(save).toBeEnabled()
    await save.scrollIntoViewIfNeeded()
    const box = await save.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `evidence/run569/gps-fallback-${width}.png`, fullPage: true })
    await save.click()
    await expect(page.getByRole('article', { name: 'Manual offline gym' })).toContainText('Retained manual address')
    await context.setOffline(false)
    await page.reload()
    await expect(page.getByRole('article', { name: 'Manual offline gym' })).toContainText('Retained manual address')
    expect(errors).toEqual([])
  })
}
