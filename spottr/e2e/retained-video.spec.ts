import { test, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./fixtures/owned-motion-vp8.webm', import.meta.url))
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

test('owned video upload persists encoded bytes through reload and public backup export', async ({ page }, info) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Retained video acceptance')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  const picker = page.getByLabel('Add image or video — Retained video acceptance', { exact: true })
  for (let i = 0; i < 40 && !(await picker.evaluate(node => node === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(picker).toBeFocused()
  const choosing = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await choosing).setFiles(fixture)
  const card = page.getByRole('article', { name: 'Retained video acceptance', exact: true })
  const video = card.locator('video')
  await expect(video).toBeVisible({ timeout: 15000 })
  async function preview() {
    return video.evaluate(async (node: HTMLVideoElement) => {
      const bytes = new Uint8Array(await (await fetch(node.currentSrc || node.src)).arrayBuffer())
      await node.play()
      await new Promise<void>((resolve, reject) => {
        node.addEventListener('timeupdate', () => resolve(), { once: true })
        node.addEventListener('error', () => reject(new Error('Video playback failed')), { once: true })
      })
      node.pause()
      return { data: Array.from(bytes), width: node.videoWidth, height: node.videoHeight, playback: node.currentTime }
    })
  }
  const uploaded = await preview()
  const encoded = Buffer.from(uploaded.data)
  const source = await readFile(fixture)
  expect(encoded.length).toBeGreaterThan(0)
  expect(encoded.length).toBeLessThan(source.length)
  expect(hash(encoded)).not.toBe(hash(source))
  expect(uploaded.width).toBe(720)
  expect(uploaded.playback).toBeGreaterThan(0)
  async function downloadMedia(): Promise<{ id: string; size: number; content: { data: string } }> {
    await page.getByRole('tab', { name: 'Settings', exact: true }).click()
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download backup', exact: true }).click()
    const path = await (await pending).path()
    if (!path) throw new Error('Missing public backup download')
    const backup = JSON.parse(await readFile(path, 'utf8'))
    const exercise = backup.entities.exercises.find((item: { name: string }) => item.name === 'Retained video acceptance')
    expect(exercise).toBeTruthy()
    expect(exercise.media).toHaveLength(1)
    return exercise.media[0]
  }
  const before = await downloadMedia()
  expect(before.size).toBe(encoded.length)
  expect(hash(Buffer.from(before.content.data, 'base64'))).toBe(hash(encoded))
  await page.reload()
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await expect(video).toBeVisible()
  const reloaded = await preview()
  expect(reloaded.data.length).toBe(encoded.length)
  expect(hash(Buffer.from(reloaded.data))).toBe(hash(encoded))
  expect(reloaded.playback).toBeGreaterThan(0)
  const after = await downloadMedia()
  expect(after.id).toBe(before.id)
  expect(after.size).toBe(encoded.length)
  const exported = Buffer.from(after.content.data, 'base64')
  expect(exported.length).toBe(encoded.length)
  expect(hash(exported)).toBe(hash(encoded))
  const receipt = JSON.stringify({ mediaId: before.id, sourceBytes: source.length, sourceHash: hash(source), encodedBytes: encoded.length, encodedHash: hash(encoded), reloadedBytes: reloaded.data.length, reloadedHash: hash(Buffer.from(reloaded.data)), exportedBytes: exported.length, exportedHash: hash(exported), width: uploaded.width, height: uploaded.height, playback: reloaded.playback }, null, 2)
  const receiptPath = info.outputPath('retained-video-receipt.json')
  await writeFile(receiptPath, receipt)
  await info.attach('retained-video-receipt.json', { path: receiptPath, contentType: 'application/json' })
})
