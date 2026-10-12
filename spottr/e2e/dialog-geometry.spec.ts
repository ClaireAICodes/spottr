import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

for (const viewport of [{ width: 390, height: 667 }, { width: 390, height: 844 }, { width: 834, height: 844 }, { width: 1440, height: 844 }]) {
  test(`long-name confirmation remains keyboard and touch accessible ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Manage gyms', exact: true }).click()
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    // Names have no application length cap. Exercise wrapping, not a synthetic scroll offset.
    const name = 'Northside strength and conditioning training centre '.repeat(12).trim()
    await page.getByLabel('Gym name').fill(name)
    await page.getByLabel('Address (optional)').fill('Populated address with a readable field')
    await page.getByRole('button', { name: 'Save gym', exact: true }).click()
    const trigger = page.getByRole('button', { name: `Delete ${name}`, exact: true })
    await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    const keep = dialog.getByRole('button', { name: 'Keep gym', exact: true })
    const remove = dialog.getByRole('button', { name: 'Delete gym', exact: true })
    await expect(keep).toBeFocused()
    const receipts = []
    for (const button of [keep, remove]) {
      if (button === remove) await page.keyboard.press('Tab')
      await expect(button).toBeFocused()
      receipts.push(await button.evaluate(node => {
        const r = node.getBoundingClientRect()
        return { name: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height,
          focusVisible: node.matches(':focus-visible'),
          hits: [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 8, r.y + 8], [r.right - 8, r.bottom - 8]].map(([x, y]) => {
            const hit = document.elementFromPoint(x, y)
            return { x, y, destination: hit?.tagName, correct: !!hit && (hit === node || node.contains(hit)) }
          }) }
      }))
    }
    const dir = `evidence/dialog-${process.env.DIALOG_EVIDENCE_STAGE ?? 'after'}`
    await mkdir(dir, { recursive: true })
    await page.screenshot({ path: `${dir}/${viewport.width}x${viewport.height}.png` })
    await writeFile(`${dir}/${viewport.width}x${viewport.height}.json`, JSON.stringify({ viewport, identity: name, context: 'G02/C07', environment: 'Chromium; native safe-area evidence OPEN', receipts }, null, 2))
    for (const receipt of receipts) {
      expect(receipt.width).toBeGreaterThanOrEqual(44)
      expect(receipt.height).toBeGreaterThanOrEqual(44)
      expect(receipt.focusVisible).toBe(true)
      expect(receipt.hits.every(hit => hit.correct)).toBe(true)
    }
    await page.keyboard.press('Tab')
    await expect(keep).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(remove).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(keep).toBeFocused()
    const r = await keep.boundingBox()
    await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2)
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('article', { name, exact: true })).toBeVisible()
  })
}
