import { test, expect } from '@playwright/test'

// Public rendered seam admitted on t_c92db14c; adapted from Reviewer500's
// five-layout geometry probe. Native pointer events, no forced clicks/focus.
for (const [width, height] of [[390, 844], [390, 667], [834, 844], [1440, 844], [320, 844]]) {
  test(`Home controls own their full hit area and activate at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height })
    async function tabTo(locator: ReturnType<typeof page.getByRole>) {
      await expect(locator).toBeEnabled()
      for (let i = 0; i < 160; i++) {
        if (await locator.evaluate(e => e === document.activeElement)) return
        const back = await locator.evaluate(e => !!(document.activeElement && document.activeElement !== document.body && (document.activeElement.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_PRECEDING)))
        await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
      }
      throw new Error('Keyboard target unreachable')
    }
    async function act(name: string) {
      await tabTo(page.getByRole('button', { name, exact: true }))
      await page.keyboard.press('Enter')
    }
    async function tab(name: string) {
      await tabTo(page.getByRole('tab', { selected: true }))
      await page.keyboard.press('Home')
      for (let i = 0; i < ['Home', 'Exercises', 'Workouts', 'History', 'Settings'].indexOf(name); i++) await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
    }
    async function geometry(name: string) {
      const target = page.getByRole('button', { name, exact: true })
      await tabTo(target)
      return target.evaluate(e => {
        const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2
        return [[x, y], [r.left + 1, y], [r.right - 1, y], [x, r.top + 1], [x, r.bottom - 1]].map(([x, y]) => {
          const h = document.elementFromPoint(x, y)
          return { x, y, hit: h?.tagName, owned: !!h && (h === e || e.contains(h)) }
        })
      })
    }
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.goto('/spottr/')
    await act('Manage gyms'); await act('Add gym')
    await page.getByLabel('Gym name').fill('Geometry Gym')
    await act('Save gym'); await act('Back to Home'); await tab('Exercises')
    await act('Add exercise'); await page.getByLabel('Exercise name').fill('Owned Row'); await act('Save exercise')
    await tab('Workouts'); await act('Add workout')
    await page.getByLabel('Workout name').fill('Owned coherent geometry workout with long readable name')
    await act('Add Owned Row'); await act('Save workout'); await tab('Home')
    const startName = 'Start workout at Geometry Gym'
    const start = await geometry(startName)
    const manage = await geometry('Manage gyms')
    await testInfo.attach('native-hit-ownership', { body: JSON.stringify({ start, manage }, null, 2), contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath('home.png') })
    await noOverflow()
    // Click the formerly intercepted Manage gyms right midpoint, even on RED.
    await page.mouse.click(manage[2].x, manage[2].y)
    await expect.soft(page.getByRole('button', { name: 'Add gym', exact: true })).toBeVisible()
    if (await page.getByRole('button', { name: 'Back to Home', exact: true }).isVisible()) await act('Back to Home')
    const currentStart = await geometry(startName)
    await page.mouse.click(currentStart[2].x, currentStart[2].y)
    await expect.soft(page.getByRole('button', { name: 'Start Owned coherent geometry workout with long readable name', exact: true })).toBeVisible()
    expect.soft(start.every(p => p.owned), JSON.stringify(start)).toBe(true)
    expect.soft(manage.every(p => p.owned), JSON.stringify(manage)).toBe(true)
    // Stop the RED slice before downstream actions when the pointer was blocked.
    if (!start.every(p => p.owned) || !manage.every(p => p.owned)) return
    await act('Start Owned coherent geometry workout with long readable name')
    await expect(page.getByRole('heading', { name: 'Owned coherent geometry workout with long readable name', exact: true })).toBeFocused()
    for (const [label, value] of [['Owned Row set 1 weight (kg)', '1234.5'], ['Owned Row set 1 reps', '123']]) {
      const field = page.getByLabel(label, { exact: true })
      await tabTo(field)
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(value)
      await expect(field).toHaveValue(value)
      expect(await field.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight })).toBe(true)
      await noOverflow()
      await page.screenshot({ path: testInfo.outputPath(label.includes('weight') ? 'weight.png' : 'reps.png') })
    }
    await act('Log Owned Row set 1'); await act('Stop rest'); await act('Finish workout')
    await expect(page.getByRole('heading', { name: 'Workout saved', exact: true })).toBeFocused()
    await noOverflow()
  })
}
