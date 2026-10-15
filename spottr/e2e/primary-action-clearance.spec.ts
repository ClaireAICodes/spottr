import { expect, test, type Locator, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

async function reach(page: Page, target: Locator) {
  // Require a fresh real Tab arrival, including when fill left target focused.
  if (await target.evaluate(node => node === document.activeElement)) await page.keyboard.press('Shift+Tab')
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(node => node === document.activeElement)) return
  }
  await expect(target).toBeFocused()
}

async function surface(page: Page, target: Locator, label: string, arrive = true) {
  if (arrive) await reach(page, target)
  const measurement = await target.evaluate(node => {
    const r = node.getBoundingClientRect()
    const nav = document.querySelector('.primary-nav')!.getBoundingClientRect()
    const points = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 2, r.y + r.height / 2], [r.right - 2, r.y + r.height / 2], [r.x + r.width / 2, r.top + 2], [r.x + r.width / 2, r.bottom - 2]]
    return {
      rect: { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      viewport: { width: innerWidth, height: innerHeight },
      unobstructed: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !(r.left < nav.right && r.right > nav.left && r.top < nav.bottom && r.bottom > nav.top),
      intersection: Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / (r.width * r.height),
      radius: getComputedStyle(node).borderRadius,
      focused: node === document.activeElement,
      focusVisible: node.matches(':focus-visible'),
      ringClear: r.top >= 7 && r.left >= 7 && r.right + 7 <= innerWidth && r.bottom + 7 <= innerHeight && !(r.left - 7 < nav.right && r.right + 7 > nav.left && r.top - 7 < nav.bottom && r.bottom + 7 > nav.top),
      hits: points.map(([x, y]) => { const hit = document.elementFromPoint(x, y); return { x, y, correct: !!hit && (node === hit || node.contains(hit)), destination: hit?.tagName } }),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }
  })
  await writeFile(test.info().outputPath(`${label}.json`), JSON.stringify(measurement, null, 2))
  await page.screenshot({ path: test.info().outputPath(`${label}.png`) })
  expect.soft(measurement.rect.width).toBeGreaterThanOrEqual(44)
  expect.soft(measurement.rect.height).toBeGreaterThanOrEqual(44)
  expect.soft(measurement.unobstructed).toBe(true)
  expect.soft(measurement.focusVisible).toBe(true)
  expect.soft(measurement.hits.every(hit => hit.correct)).toBe(true)
  expect.soft(measurement.overflow).toBe(false)
  if (label.includes('numeric')) expect.soft(measurement.ringClear).toBe(true)
  return measurement
}

for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }, { width: 834, height: 844 }, { width: 1440, height: 844 }, { width: 320, height: 844 }]) {
  test(`primary action clearance ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Manage gyms' }).click()
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('Northside repeated strength and conditioning training centre')
    await page.getByRole('button', { name: 'Save gym' }).click()
    const exercise = 'Repeated long strength and conditioning exercise name'
    await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
      await page.getByRole('textbox', { name: 'Exercise name', exact: true }).fill(exercise)
      await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
    }
    await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
    await page.getByRole('button', { name: 'Add workout' }).click()
    await page.getByLabel('Workout name').fill('Repeated long strength and conditioning workout name')
    const adds = page.getByRole('button', { name: `Add ${exercise}`, exact: true })
    await adds.nth(0).click()
    await adds.nth(1).click()
    const weights = page.getByRole('spinbutton', { name: /Set 1 weight/ })
    const reps = page.getByRole('spinbutton', { name: /Set 1 reps/ })
    for (let i = 0; i < 2; i++) {
      await weights.nth(i).fill('1234.5')
      await reps.nth(i).fill('123')
    }
    // Preserve the real fill-time clipping observation separately from Tab arrival.
    await writeFile(test.info().outputPath('numeric-fill.json'), JSON.stringify(await reps.nth(1).evaluate(node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, viewportHeight: innerHeight, focused: node === document.activeElement } }), null, 2))
    await page.screenshot({ path: test.info().outputPath('numeric-fill.png') })
    await surface(page, reps.nth(1), 'planner-numeric')
    await expect(reps.nth(1)).toHaveValue('123')
    // Actual native key editing, distinct from the fill simulation above.
    await page.keyboard.press('ArrowUp')
    await expect(reps.nth(1)).toHaveValue('124')
    await surface(page, reps.nth(1), 'planner-numeric-edited', false)
    const saveWorkout = page.getByRole('button', { name: 'Save workout', exact: true })
    await surface(page, saveWorkout, 'planner-save')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Edit Repeated long strength and conditioning workout name', exact: true })).toBeFocused()
    const selectedTab = page.getByRole('tab', { selected: true })
    await reach(page, selectedTab)
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Settings', exact: true })).toBeFocused()
    await page.getByLabel('Rest duration (seconds)').fill('600')
    await surface(page, page.getByRole('button', { name: 'Download backup', exact: true }), 'settings-download')
    const saveSettings = page.getByRole('button', { name: 'Save settings', exact: true })
    await surface(page, saveSettings, 'settings-save')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible()
    await expect(saveSettings).toBeFocused()
  })
}
