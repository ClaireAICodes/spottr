import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')
    context.fillStyle = '#236abb'
    context.fillRect(0, 0, 160, 90)
    return await new Promise(resolve => {
      canvas.toBlob((blob) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(blob)
      }, 'image/png')
    })
  })
  const bytes = Buffer.from(base64, 'base64')
  await mkdir('e2e/fixtures', { recursive: true })
  await writeFile('e2e/fixtures/owned-setup.png', bytes)
  console.log(`Created owned-setup.png: ${bytes.length} bytes`)
} finally {
  await browser.close()
}
