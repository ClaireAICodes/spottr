import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280; canvas.height = 720
    const context = canvas.getContext('2d')
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 8_000_000 })
    const chunks = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const done = new Promise(resolve => { recorder.onstop = resolve })
    let frame = 0
    const draw = setInterval(() => {
      context.fillStyle = `hsl(${frame++ * 9} 80% 40%)`; context.fillRect(0, 0, 1280, 720)
      for (let i = 0; i < 80; i++) {
        context.fillStyle = `hsl(${i * 7} 80% 60%)`
        context.fillRect((i * 31 + frame * 17) % 1280, (i * 43) % 720, 80, 80)
      }
    }, 33)
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 2200)); recorder.stop()
    await done; clearInterval(draw); stream.getTracks().forEach(track => track.stop())
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }))
    })
  })
  const bytes = Buffer.from(base64, 'base64')
  await mkdir('e2e/fixtures', { recursive: true })
  await writeFile('e2e/fixtures/owned-motion-vp8.webm', bytes)
  console.log(JSON.stringify({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), browser: browser.version() }))
} finally { await browser.close() }
