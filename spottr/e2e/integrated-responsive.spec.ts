import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots/thursday-morning')
const gymName = 'NorthNeighbourhoodStrengthAndConditioningGym'
const exerciseName = 'StandingSingleArmCableShoulderPress'
const workoutName = 'UpperBodyStrengthAndConditioningSession'

async function captureLayout(page: Page, stage: string, width: number) {
  const layout = await page.evaluate(() => {
    const clipped = [...document.querySelectorAll<HTMLElement>('main input, main select, main button, main h2, main h3, main h4')]
      .filter((element) => {
        const bounds = element.getBoundingClientRect()
        if (!bounds.width || !bounds.height || getComputedStyle(element).visibility === 'hidden') return false
        // File inputs intentionally use the standard visually-hidden pattern.
        if (element instanceof HTMLInputElement && element.type === 'file') return false
        let left = 0
        let right = window.innerWidth
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) {
            const parentBounds = parent.getBoundingClientRect()
            left = Math.max(left, parentBounds.left)
            right = Math.min(right, parentBounds.right)
          }
        }
        const clippedText = !element.matches('input, select') && element.scrollWidth > element.clientWidth + 1
        const unusablyNarrowNumber = element instanceof HTMLInputElement && element.type === 'number' && bounds.width < 60
        return bounds.left < left - 1 || bounds.right > right + 1 || clippedText || unusablyNarrowNumber
      })
      .map((element) => ({ tag: element.tagName, name: element.getAttribute('aria-label') ?? element.textContent?.trim(), className: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }))
    return { width: document.documentElement.scrollWidth, clipped }
  })
  expect(layout, stage).toEqual({ width, clipped: [] })
  await page.screenshot({ path: resolve(evidenceDir, `${width}-${stage}.png`), fullPage: true })
}

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

for (const width of [390, 834, 1440]) {
test(`critical workout journey remains usable without overflow at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 900 })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill(gymName)
  await captureLayout(page, 'gym-editor', width)
  await page.getByRole('button', { name: 'Save gym' }).click()
  await expect(page.getByRole('heading', { name: gymName })).toBeVisible()
  await captureLayout(page, 'gyms', width)
  await page.getByRole('button', { name: 'Back to home' }).click()
  await captureLayout(page, 'home', width)
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill(exerciseName)
  await captureLayout(page, 'exercise-editor', width)
  await page.getByRole('button', { name: 'Save exercise' }).click()
  await expect(page.getByRole('heading', { name: exerciseName })).toBeVisible()
  await captureLayout(page, 'exercises', width)
  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill(workoutName)
  await page.getByRole('button', { name: `Add ${exerciseName}` }).click()
  const templateExercise = page.getByRole('article', { name: `${exerciseName} sets` })
  await templateExercise.getByLabel('Set 1 weight').fill('40')
  await templateExercise.getByLabel('Set 1 reps').fill('6')
  await captureLayout(page, 'workout-editor', width)
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('article', { name: workoutName })).toBeVisible()
  await captureLayout(page, 'workouts', width)
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: `Start workout at ${gymName}` }).click()
  await captureLayout(page, 'workout-choices', width)
  await page.getByRole('button', { name: `Start ${workoutName}` }).click()
  await expect(page.getByRole('heading', { name: workoutName })).toBeVisible()
  await captureLayout(page, 'active-session', width)
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: `Resume ${workoutName}` }).click()
  await page.getByLabel(`${exerciseName} set 1 weight`).fill('42.5')
  await page.getByRole('button', { name: `Log ${exerciseName} set 1` }).click()
  await expect(page.getByText('1 of 1 sets logged')).toBeVisible()
  await captureLayout(page, 'offline-resumed', width)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByRole('heading', { name: 'Workout saved' })).toBeVisible()
  await expect(page.getByText('255 kg', { exact: true })).toBeVisible()
  await captureLayout(page, 'summary', width)
  await page.reload()
  await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
  await page.getByRole('button', { name: 'History', exact: true }).click()
  const history = page.getByRole('article', { name: `${workoutName} at ${gymName}` })
  await history.getByRole('button', { name: 'View details' }).click()
  await expect(history).toContainText('42.5 kg × 6 reps')
  await expect(history).toContainText('Completed')
  await captureLayout(page, 'history', width)
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('region', { name: 'Install Spottr' })).toContainText('Offline ready:')
  await captureLayout(page, 'settings', width)
  expect(pageErrors).toEqual([])
})
}
