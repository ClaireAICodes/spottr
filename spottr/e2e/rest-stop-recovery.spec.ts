import { expect, test, type Page } from '@playwright/test'

async function startWorkout(page: Page) {
  await page.getByRole('button', { name: 'Start workout at Recovery Gym' }).click()
  await page.getByRole('button', { name: 'Start Recovery Workout' }).click()
  await page.getByRole('button', { name: 'Log Row set 1' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
}

async function setup(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Recovery Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()
  await page.getByRole('tab', { name: 'Train' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Row')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Recovery Workout')
  await page.getByRole('button', { name: 'Add Row' }).click()
  await page.getByRole('button', { name: 'Add set' }).click()
  await page.getByRole('button', { name: 'Save workout' }).click()
  await page.getByRole('tab', { name: 'Home' }).click()
  await startWorkout(page)
}

test('keyboard Stop restores live focus after a concurrent log settles', async ({ page }) => {
  await setup(page)
  // Gate the platform lock, not the service or repository. All writes remain real.
  await page.evaluate(() => {
    const request = navigator.locks.request.bind(navigator.locks)
    let count = 0
    const gates = window as unknown as { entered: number; releases: Array<() => void> }
    gates.entered = 0
    gates.releases = []
    navigator.locks.request = ((name: string, callback: LockGrantedCallback) => {
      if (name !== 'spottr-session-log') return request(name, callback)
      const index = count++
      return request(name, async (lock) => {
        gates.entered = index + 1
        await new Promise<void>((resolve) => { gates.releases[index] = resolve })
        return callback(lock)
      })
    }) as typeof navigator.locks.request
  })
  await page.getByRole('button', { name: 'Stop rest' }).focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => (window as unknown as { entered: number }).entered === 1)
  await expect(page.getByRole('button', { name: 'Stopping…' })).toBeDisabled()
  // Preserve the Stop keyboard focus while starting a permitted concurrent action.
  await page.getByRole('button', { name: 'Log Row set 2' }).evaluate((button: HTMLButtonElement) => button.click())
  await page.evaluate(() => (window as unknown as { releases: Array<() => void> }).releases[0]())
  await page.waitForFunction(() => (window as unknown as { entered: number }).entered === 2)
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeDisabled()
  await page.evaluate(() => (window as unknown as { releases: Array<() => void> }).releases[1]())
  await expect(page.getByText('2 of 2 sets logged')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeFocused()
  await page.screenshot({ path: 'evidence/screenshots/rest-stop-pending-focus-390.png' })
})

test('stale-tab Stop preserves a newer workout and a replacement rest period', async ({ page, context }) => {
  await setup(page)
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('button', { name: 'Resume Recovery Workout' }).click()
  await other.getByRole('button', { name: 'Stop rest' }).click()
  await other.getByRole('button', { name: 'Finish workout' }).click()
  await other.getByRole('button', { name: 'Finish and skip 1 set' }).click()
  await other.getByRole('button', { name: 'Back to home' }).click()
  await startWorkout(other)
  await page.getByRole('button', { name: 'Stop rest' }).click()
  await expect(page.getByRole('alert')).toContainText('Rest changed in another tab. Reload and resume before trying again.')
  await other.reload()
  await other.getByRole('button', { name: 'Resume Recovery Workout' }).click()
  await expect(other.getByRole('timer')).toBeVisible()
  await expect(other.getByText('1 of 2 sets logged')).toBeVisible()

  // The session is now the same in both tabs, but Stop/log replaces its period.
  await page.reload()
  await page.getByRole('button', { name: 'Resume Recovery Workout' }).click()
  await other.getByRole('button', { name: 'Stop rest' }).click()
  await other.getByRole('button', { name: 'Log Row set 2' }).click()
  await expect(other.getByRole('timer')).toBeVisible()
  await page.getByRole('button', { name: 'Stop rest' }).click()
  await expect(page.getByRole('alert')).toContainText('Rest changed in another tab. Reload and resume before trying again.')
  await other.reload()
  await other.getByRole('button', { name: 'Resume Recovery Workout' }).click()
  await expect(other.getByText('2 of 2 sets logged')).toBeVisible()
  await expect(other.getByRole('timer')).toBeVisible()
  await other.getByRole('button', { name: 'Stop rest' }).click()
  await expect(other.getByRole('timer')).toHaveCount(0)
})
