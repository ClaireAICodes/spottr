import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { SpottrBackup } from '../src/backup'

async function backup(page: Page): Promise<SpottrBackup> {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('Missing backup download')
  return JSON.parse(await readFile(path, 'utf8'))
}

for (const width of [390, 834, 1440]) {
  test(`legacy six remains readable/exportable/reorderable until explicit removal at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    // Set up an inherited database, not an ingestion bypass or an assertion side channel.
    const original = await page.evaluate(async () => {
      const timestamp = '2026-10-12T12:00:00.000Z'
      const media = []
      const encoded: Record<string, string> = {}
      for (let i = 0; i < 6; i++) {
        const canvas = document.createElement('canvas')
        canvas.width = 16; canvas.height = 16
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'][i]
        ctx.fillRect(0, 0, 16, 16)
        const data = canvas.toDataURL('image/png').split(',')[1]
        const blob = new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'image/png' })
        encoded[`m${i}`] = data
        media.push({ id: `m${i}`, kind: 'image', name: `owned-${i}.png`, mimeType: blob.type, size: blob.size, blob, createdAt: timestamp })
      }
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('spottr-v1-exercises', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('exercises', { keyPath: 'id' })
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('exercises', 'readwrite')
          tx.objectStore('exercises').put({ id: 'legacy', name: 'Legacy reference', muscleGroup: '', equipment: '', notes: '', createdAt: timestamp, updatedAt: timestamp, media })
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onabort = () => { db.close(); reject(tx.error) }
        }
      })
      return encoded
    })
    await page.reload()
    async function library() {
      await page.getByRole('tab', { name: 'Train', exact: true }).click()
      return page.getByRole('article', { name: 'Legacy reference', exact: true })
    }
    let card = await library()
    await expect(card.getByLabel('Add image or video')).toBeDisabled()
    await expect(card.getByText(/6 saved media items.*five-item limit/i)).toBeVisible()
    await expect(card.locator('img')).toHaveCount(6)
    for (const image of await card.locator('img').all()) {
      await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(16)
    }
    await page.screenshot({ path: `evidence/screenshots/w42-legacy-six-${width}.png`, fullPage: true })
    const first = await backup(page)
    expect(Object.fromEntries(first.entities.exercises[0].media.map(m => [m.id, m.content.data]))).toEqual(original)
    expect(new Set(Object.values(original)).size).toBe(6)
    card = await library()
    await card.getByRole('button', { name: 'Move owned-5.png up — Legacy reference, media 6', exact: true }).click()
    await expect(card.getByRole('button', { name: 'Remove owned-5.png — Legacy reference, media 5', exact: true })).toBeEnabled()
    await page.reload()
    const reordered = await backup(page)
    expect(reordered.entities.exercises[0].media.map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm5', 'm4'])
    expect(Object.fromEntries(reordered.entities.exercises[0].media.map(m => [m.id, m.content.data]))).toEqual(original)
    card = await library()
    await card.getByRole('button', { name: 'Remove owned-5.png — Legacy reference, media 5', exact: true }).click()
    await expect(card.getByText(/6 saved media items/)).toHaveCount(0)
    await expect(card.getByLabel('Add image or video')).toBeDisabled()
    await card.getByRole('button', { name: 'Remove owned-4.png — Legacy reference, media 5', exact: true }).click()
    await expect(card.getByLabel('Add image or video')).toBeEnabled()
    await page.reload()
    const reduced = await backup(page)
    expect(reduced.entities.exercises[0].media.map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3'])
    for (const m of reduced.entities.exercises[0].media) expect(m.content.data).toBe(original[m.id])
  })
}
