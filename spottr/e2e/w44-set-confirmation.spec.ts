import { expect, test } from '@playwright/test'

for (const [width, height] of [[320, 667], [390, 667]]) {
  test(`timed confirmation survives reload and saves actuals at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    // Observe real entrance motion without disabling or pausing it.
    await page.addInitScript(() => {
      const observations: unknown[] = []
      Object.assign(window, { confirmationMotion: observations })
      document.addEventListener('animationstart', event => {
        const target = event.target
        if (!(target instanceof HTMLElement) || !target.matches('.confirm-dialog')) return
        const sample = () => ({
          transform: getComputedStyle(target).transform,
          controls: Array.from(target.querySelectorAll('input, button'), el => {
            const { x, y, width, height } = el.getBoundingClientRect()
            return { label: el.getAttribute('aria-label') || el.textContent, x, y, width, height }
          }),
          animations: target.getAnimations().map(animation => ({
            playState: animation.playState, currentTime: animation.currentTime,
          })),
        })
        const observation = { name: event.animationName, before: sample(), frames: [] as unknown[], after: null as unknown }
        observations.push(observation)
        const frame = () => {
          observation.frames.push(sample())
          if (target.getAnimations().some(animation => animation.playState === 'running')) requestAnimationFrame(frame)
          else observation.after = sample()
        }
        requestAnimationFrame(frame)
      }, true)
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/spottr/')
    await page.getByRole('tab', { name: 'Gyms', exact: true }).click()
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('North Gym')
    await page.getByRole('button', { name: 'Save gym', exact: true }).click()
    await page.getByRole('button', { name: 'Back to home' }).click()
    await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill('Row')
    await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
    await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
    await page.getByRole('button', { name: 'Add workout', exact: true }).click()
    await page.getByLabel('Workout name').fill('Training')
    await page.getByRole('button', { name: 'Add Row', exact: true }).click()
    await page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 weight').fill('40')
    await page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 reps').fill('8')
    await page.getByRole('button', { name: 'Save workout', exact: true }).click()
    await page.getByRole('tab', { name: 'Home', exact: true }).click()
    await page.getByRole('button', { name: 'Start workout at North Gym' }).click()
    await page.getByRole('button', { name: 'Start Training', exact: true }).click()
    await page.getByRole('button', { name: 'Start Row set 1', exact: true }).click()
    await page.getByRole('button', { name: 'Complete Row set 1', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Confirm Row set 1' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading')).toBeFocused()
    await expect(page.getByRole('timer', { name: 'Rest timer' })).toHaveCount(0)
    // Visibility/focus do not imply that transformed geometry has settled.
    await expect.poll(() => dialog.evaluate(el => el.getAnimations({ subtree: true })
      .filter(animation => animation.playState === 'running' || animation.pending).length)).toBe(0)
    const motion = await page.evaluate(() => (window as unknown as { confirmationMotion: Array<{
      name: string; before: { transform: string; animations: Array<{ playState: string }> }; after: unknown
    }> }).confirmationMotion)
    console.log(JSON.stringify({ kind: 'confirmation-motion', width, height, motion,
      settled: await dialog.locator('input, button').evaluateAll(elements => elements.map(el => {
        const { x, y, width, height } = el.getBoundingClientRect()
        return { x, y, width, height }
      })) }))
    expect(motion.some(observation => observation.name === 'sheet-arrive'
      && observation.before.transform !== 'none'
      && observation.before.animations.some(animation => animation.playState === 'running'))).toBe(true)
    for (const control of await dialog.locator('input, button').all()) {
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(52)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(height)
      if (await control.getAttribute('type') === 'number') {
        expect(await control.evaluate(el => getComputedStyle(el).fontSize)).toBe('16px')
      }
    }
    await page.keyboard.press('Tab')
    await expect(dialog.getByLabel('Actual weight (kg)')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Log set', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByLabel('Actual weight (kg)')).toBeFocused()
    await dialog.getByRole('button', { name: 'Back to set' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByLabel('Row set 1 weight (kg)', { exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Log Row set 1', exact: true }).click()
    await expect(dialog).toBeVisible()
    await page.screenshot({ path: `evidence/t-b91e166e-confirm-${width}.png` })
    await page.reload()
    await page.getByRole('button', { name: 'Resume Training', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Confirm Row set 1' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Actual weight (kg)').fill('1e2')
    await dialog.getByRole('button', { name: 'Log set', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Enter a weight of zero or more.')
    await expect(dialog.getByLabel('Actual weight (kg)')).toHaveValue('1e2')
    await expect(page.getByRole('timer', { name: 'Rest timer' })).toHaveCount(0)
    await page.screenshot({ path: `evidence/run587-exponent-${width}.png` })
    await dialog.getByLabel('Actual weight (kg)').fill('40')
    await dialog.getByLabel('Actual reps').fill('0')
    await dialog.getByRole('button', { name: 'Retry log set', exact: true }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('timer', { name: 'Rest timer' })).toHaveCount(0)
    for (const control of await dialog.locator('input, button, [role="alert"]').all()) {
      const box = await control.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.y + box!.height).toBeLessThanOrEqual(height)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      if (await control.getAttribute('role') !== 'alert') expect(box!.height).toBeGreaterThanOrEqual(52)
    }
    console.log(JSON.stringify({ width, height, controls: await dialog.locator('input, button').evaluateAll(elements => elements.map(el => ({ label: el.getAttribute('type') === 'number' ? el.parentElement!.textContent : el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))) }))
    await page.screenshot({ path: `evidence/run552-error-${width}.png` })
    await dialog.getByLabel('Actual reps').fill('7')
    await dialog.getByRole('button', { name: 'Retry log set', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('timer', { name: 'Rest timer' })).toBeVisible()
    await page.screenshot({ path: `evidence/t-b91e166e-rest-${width}.png` })
    await page.getByRole('button', { name: 'Exit workout' }).click()
    await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
    await page.getByRole('article', { name: 'Training' }).getByRole('button', { name: 'Edit Training', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Row sets' }).getByLabel('Set 1 reps')).toHaveValue('8')
    expect(errors).toEqual([])
  })
}
