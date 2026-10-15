import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate(node => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Audio proof control not keyboard reachable')
}

async function exportBackup(page: Page) {
  const settings = page.getByRole('tab', { name: 'Settings', exact: true })
  if (await settings.getAttribute('aria-selected') !== 'true') {
    await tabTo(page, page.getByRole('tab', { selected: true }))
    await page.keyboard.press('End')
  }
  await expect(settings).toBeFocused()
  await tabTo(page, page.getByRole('button', { name: 'Download backup', exact: true }))
  const downloading = page.waitForEvent('download')
  await page.keyboard.press('Enter')
  return JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
}

// Original synthetic moving rectangles and a 440 Hz sine at gain 0.25.
// No external assets, microphone, user data, policy overrides or preparation mocks.
test('natural upload preserves decoded moving video and known non-silent audio across export and reload', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  const source = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
    const draw = canvas.getContext('2d')!
    const stream = canvas.captureStream(30)
    const audio = new AudioContext()
    await audio.resume()
    const oscillator = audio.createOscillator(); oscillator.frequency.value = 440
    const gain = audio.createGain(); gain.gain.value = 0.25
    const destination = audio.createMediaStreamDestination()
    oscillator.connect(gain).connect(destination)
    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track))
    const type = 'video/webm;codecs=vp8,opus'
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
    const parts: Blob[] = []
    recorder.ondataavailable = event => parts.push(event.data)
    const stopped = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(parts, { type })) })
    let frame = 0
    const paint = () => {
      draw.fillStyle = `hsl(${frame++ * 9} 80% 40%)`; draw.fillRect(0, 0, 1280, 720)
      for (let i = 0; i < 80; i++) {
        draw.fillStyle = `hsl(${i * 7} 80% 60%)`
        draw.fillRect((i * 31 + frame * 17) % 1280, (i * 43) % 720, 80, 80)
      }
    }
    paint(); const drawing = setInterval(paint, 33)
    oscillator.start(); recorder.start()
    await new Promise(resolve => setTimeout(resolve, 2400))
    recorder.stop(); const blob = await stopped
    clearInterval(drawing); oscillator.stop(); stream.getTracks().forEach(track => track.stop()); await audio.close()
    return new Promise<string>(resolve => {
      const reader = new FileReader(); reader.onload = () => resolve((reader.result as string).split(';base64,')[1]); reader.readAsDataURL(blob)
    })
  })
  const input = Buffer.from(source, 'base64')
  const inputPath = testInfo.outputPath('owned-tone-motion.webm')
  await writeFile(inputPath, input)

  // Decode the actual container audio, not a track flag or an analyser fed by our generator.
  const signalProof = async (base64: string) => page.evaluate(async data => {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    const audio = new AudioContext()
    try {
      const buffer = await audio.decodeAudioData(bytes.buffer)
      const samples = buffer.getChannelData(0)
      const windows = [0.4, 1.0, 1.6].map(start => {
        const from = Math.floor(start * buffer.sampleRate), count = Math.floor(0.2 * buffer.sampleRate)
        let energy = 0
        for (let i = 0; i < count; i++) energy += samples[from + i] ** 2
        const power = (frequency: number) => {
          let real = 0, imaginary = 0
          for (let i = 0; i < count; i++) {
            const phase = 2 * Math.PI * frequency * i / buffer.sampleRate
            real += samples[from + i] * Math.cos(phase); imaginary += samples[from + i] * Math.sin(phase)
          }
          return 2 * Math.hypot(real, imaginary) / count
        }
        return { start, rms: Math.sqrt(energy / count), tone440: power(440), off880: power(880) }
      })
      return { duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, windows }
    } finally { await audio.close() }
  }, base64)
  const inputSignal = await signalProof(source)
  for (const window of inputSignal.windows) {
    expect(window.rms).toBeGreaterThan(0.1)
    expect(window.tone440).toBeGreaterThan(0.15)
    expect(window.off880).toBeLessThan(window.tone440 / 10)
  }
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Audio preservation')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  const article = page.getByRole('article', { name: 'Audio preservation', exact: true })
  const picker = article.getByLabel('Add image or video — Audio preservation', { exact: true })
  await tabTo(page, picker)
  const choosing = page.waitForEvent('filechooser')
  const started = Date.now()
  await page.keyboard.press('Enter')
  await (await choosing).setFiles(inputPath)
  await expect(article.getByRole('listitem')).toHaveCount(1)
  await expect(picker).toBeEnabled()
  const elapsedMs = Date.now() - started
  const playback = await article.locator('video').evaluate(async (video: HTMLVideoElement) => {
    video.muted = true
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16
    const context = canvas.getContext('2d')!
    const frame = () => { context.drawImage(video, 0, 0, 16, 16); return Array.from(context.getImageData(0, 0, 16, 16).data) }
    await video.play()
    await new Promise<void>(resolve => video.requestVideoFrameCallback(() => resolve()))
    const firstTime = video.currentTime, first = frame()
    await new Promise<void>(resolve => {
      const next = () => video.currentTime > firstTime + 0.3 ? resolve() : video.requestVideoFrameCallback(next)
      video.requestVideoFrameCallback(next)
    })
    const result = { firstTime, lastTime: video.currentTime, changed: JSON.stringify(first) !== JSON.stringify(frame()), width: video.videoWidth, height: video.videoHeight }
    video.pause(); return result
  })
  const before = await exportBackup(page)
  const media = before.entities.exercises.find((exercise: { name: string }) => exercise.name === 'Audio preservation').media[0]
  const output = Buffer.from(media.content.data, 'base64')
  await writeFile(testInfo.outputPath('encoded-tone-motion.webm'), output)
  const outputSignal = await signalProof(media.content.data)
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  const receipt = { provenance: 'Original synthetic canvas motion + Web Audio 440 Hz sine, gain 0.25; no third-party media', input: { mime: 'video/webm;codecs=vp8,opus', bytes: input.length, sha256: hash(input), signal: inputSignal }, output: { mime: media.mimeType, bytes: output.length, sha256: hash(output), signal: outputSignal }, elapsedMs, playback, browser: await page.evaluate(() => navigator.userAgent) }
  await writeFile(testInfo.outputPath('audio-content-proof.json'), JSON.stringify(receipt, null, 2))
  console.log(JSON.stringify(receipt))
  expect(output.length).toBeLessThan(input.length)
  expect(output.length).toBeLessThanOrEqual(15 * 1024 * 1024)
  expect(hash(output)).not.toBe(hash(input))
  expect(elapsedMs).toBeLessThan(60000)
  expect(playback.width).toBeLessThanOrEqual(720)
  expect(playback.lastTime - playback.firstTime).toBeGreaterThan(0.3)
  expect(playback.changed).toBe(true)
  for (let i = 0; i < outputSignal.windows.length; i++) {
    const window = outputSignal.windows[i], original = inputSignal.windows[i]
    expect(window.rms).toBeGreaterThan(0.1)
    expect(window.tone440).toBeGreaterThan(0.15)
    expect(window.off880).toBeLessThan(window.tone440 / 10)
    expect(window.rms / original.rms).toBeGreaterThan(0.7)
    expect(window.rms / original.rms).toBeLessThan(1.3)
  }
  expect(Math.abs(outputSignal.duration - inputSignal.duration)).toBeLessThan(0.3)
  await page.reload()
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await expect(article.locator('video')).toHaveCount(1)
  const after = await exportBackup(page)
  delete before.exportedAt; delete after.exportedAt
  expect(after).toEqual(before)
})
