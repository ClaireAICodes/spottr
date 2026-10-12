import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate(node => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Public keyboard target not reached')
}

async function measure(page: Page, target: Locator, context: string, identity: string) {
  return target.evaluate((node, data) => {
    const r = node.getBoundingClientRect()
    const points = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 8, r.y + 8], [r.right - 8, r.bottom - 8]]
    const hits = points.map(([x, y]) => {
      const hit = document.elementFromPoint(x, y)
      return { x, y, destination: hit?.tagName, correct: !!hit && (node === hit || node.contains(hit)) }
    })
    return { ...data, viewport: { width: innerWidth, height: innerHeight }, x: r.x, y: r.y, width: r.width, height: r.height, focusVisible: node.matches(':focus-visible') || !!node.querySelector(':focus-visible'), hits, enabled: !node.querySelector(':disabled'), state: 'populated; keyboard revealed', environment: 'Chromium emulation; zero native safe-area evidence' }
  }, { context, identity })
}

for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }, { width: 834, height: 844 }, { width: 1440, height: 844 }]) {
  test(`planner action words and hits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Manage gyms' }).click()
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill('Northside Strength and Conditioning')
    await page.getByRole('button', { name: 'Save gym' }).click()
    await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill('Long populated exercise reference')
    await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
    await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
    await page.getByRole('button', { name: 'Add workout' }).click()
    const name = 'Northside repeated strength and conditioning workout'
    await page.getByLabel('Workout name').fill(name)
    await page.getByRole('button', { name: 'Add Long populated exercise reference', exact: true }).click()
    await page.getByRole('button', { name: 'Save workout', exact: true }).click()
    const action = page.getByRole('button', { name: `Duplicate ${name}`, exact: true })
    await tabTo(page, action)
    const receipt = await measure(page, action, 'G04/C11', name)
    const wordLines = await action.evaluate(node => {
      const text = [...node.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent?.includes('Duplicate'))!
      const range = document.createRange()
      const start = text.textContent!.indexOf('Duplicate')
      range.setStart(text, start)
      range.setEnd(text, start + 'Duplicate'.length)
      return range.getClientRects().length
    })
    await writeFile(test.info().outputPath('geometry.json'), JSON.stringify({ ...receipt, wordLines }, null, 2))
    await page.screenshot({ path: test.info().outputPath('planner.png') })
    expect(wordLines).toBe(1)
    expect(receipt.width).toBeGreaterThanOrEqual(44)
    expect(receipt.height).toBeGreaterThanOrEqual(44)
    expect(receipt.hits.every(hit => hit.correct)).toBe(true)
    await page.mouse.click(receipt.hits[0].x, receipt.hits[0].y)
    await expect(page.getByLabel('Duplicate to gym')).toBeVisible()
  })

  test(`library visible picker keyboard geometry ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
    const name = 'Northside Strength and Conditioning Training Centre'
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
      await page.getByLabel('Exercise name').fill(`${name} ${i + 1}`)
      await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Populated reference notes for the lower library card.')
      await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
      await expect(page.getByRole('button', { name: `Edit ${name} ${i + 1}`, exact: true })).toBeFocused()
    }
    const input = page.getByLabel(`Add image or video — ${name} 3`, { exact: true })
    for (let i = 0; i < 4; i++) {
      await input.setInputFiles({ name: `form-${i}.webm`, mimeType: 'video/webm', buffer: await readFile(resolve('e2e/fixtures/owned-motion-vp8.webm')) })
      await expect(page.getByRole('article', { name: `${name} 3`, exact: true }).getByRole('listitem')).toHaveCount(i + 1)
    }
    await tabTo(page, input)
    const label = input.locator('..')
    const receipt = await measure(page, label, 'G03/C10', `${name} 3 / visible picker`)
    await writeFile(test.info().outputPath('geometry.json'), JSON.stringify(receipt, null, 2))
    await page.screenshot({ path: test.info().outputPath('picker.png') })
    expect(receipt.width).toBeGreaterThanOrEqual(44)
    expect(receipt.height).toBeGreaterThanOrEqual(44)
    expect(receipt.focusVisible).toBe(true)
    expect(receipt.hits.every(hit => hit.correct)).toBe(true)
    const chooser = page.waitForEvent('filechooser')
    await page.mouse.click(receipt.hits[0].x, receipt.hits[0].y)
    await (await chooser).setFiles({ name: 'form.webm', mimeType: 'video/webm', buffer: await readFile(resolve('e2e/fixtures/owned-motion-vp8.webm')) })
    await expect(page.getByRole('article', { name: `${name} 3`, exact: true }).getByRole('listitem')).toHaveCount(5)
  })
}
