import { test, expect } from '@playwright/test'

test('owned WebM and MP4 fixtures are really resized, encoded, stored and playable; cancel/failure do not mutate', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  const result = await page.evaluate(async () => {
    const moduleUrl = '/spottr/src/exercises.ts'
    const { createExerciseService, createMemoryExerciseRepository } = await import(/* @vite-ignore */ moduleUrl)
    const fixture = async (mimeType: string) => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
      const ctx = canvas.getContext('2d')!
      const stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      const parts: Blob[] = []
      recorder.ondataavailable = (event) => parts.push(event.data)
      const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(parts, { type: mimeType })) })
      let frame = 0
      const draw = setInterval(() => {
        ctx.fillStyle = `hsl(${frame++ * 9} 80% 40%)`; ctx.fillRect(0, 0, 1280, 720)
        for (let i = 0; i < 80; i++) { ctx.fillStyle = `hsl(${i * 7} 80% 60%)`; ctx.fillRect((i * 31 + frame * 17) % 1280, (i * 43) % 720, 80, 80) }
      }, 33)
      recorder.start(); await new Promise((resolve) => setTimeout(resolve, 2200)); recorder.stop()
      const blob = await done; clearInterval(draw); stream.getTracks().forEach((track) => track.stop())
      return new File([blob], mimeType.startsWith('video/mp4') ? 'owned.mp4' : 'owned.webm', { type: mimeType.split(';')[0] })
    }
    const hash = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (n) => n.toString(16).padStart(2, '0')).join('')
    const service = createExerciseService(createMemoryExerciseRepository())
    const exercise = await service.create({ name: 'Synthetic owned motion', muscleGroup: '', equipment: '', notes: '' })
    const proofs = []
    const inputs = ['video/webm;codecs=vp8', 'video/mp4;codecs=avc1.42001E']
    for (const type of inputs) {
      if (!MediaRecorder.isTypeSupported(type)) { proofs.push({ input: type, unsupported: true }); continue }
      const file = await fixture(type)
      const started = performance.now()
      const media = await service.addMedia(exercise.id, file)
      const runtimeMs = performance.now() - started
      const video = document.createElement('video'); video.muted = true
      const url = URL.createObjectURL(media.blob); video.src = url
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('output decode failed')) })
      await video.play(); await new Promise((resolve) => setTimeout(resolve, 250)); video.pause()
      proofs.push({ input: type, output: media.mimeType, sourceBytes: file.size, outputBytes: media.size, sourceHash: await hash(file), outputHash: await hash(media.blob), width: video.videoWidth, height: video.videoHeight, duration: video.duration, playbackTime: video.currentTime, runtimeMs })
      URL.revokeObjectURL(url)
    }
    const before = JSON.stringify(await service.search())
    const abort = new AbortController()
    const file = await fixture(inputs[0])
    let cancelled = false
    try { await service.addMedia(exercise.id, file, { signal: abort.signal, onProgress: () => abort.abort() }) } catch (error) { cancelled = (error as Error).name === 'AbortError' }
    let failed = false
    try { await service.addMedia(exercise.id, new File(['corrupt'], 'broken.mp4', { type: 'video/mp4' })) } catch { failed = true }
    const pendingProofs = []
    for (const api of ['resume', 'play'] as const) {
      for (const mode of ['cancel', 'deadline', 'reject'] as const) {
        const originalResume = AudioContext.prototype.resume
        const originalPlay = HTMLMediaElement.prototype.play
        const originalTimer = window.setTimeout
        let entered = false
        const held = () => { entered = true; return mode === 'reject' ? Promise.reject(new Error('Browser API rejected')) : new Promise<void>(() => {}) }
        if (api === 'resume') AudioContext.prototype.resume = held
        else HTMLMediaElement.prototype.play = held
        if (mode === 'deadline') window.setTimeout = ((handler: TimerHandler, delay?: number) => originalTimer(handler, delay === 60000 ? 150 : delay)) as typeof window.setTimeout
        const controller = new AbortController()
        const pending = service.addMedia(exercise.id, file, { signal: controller.signal })
          .then(() => 'committed', (error: Error) => error.name === 'AbortError' ? 'cancelled' : error.message)
        if (mode === 'cancel') {
          while (!entered) await new Promise((resolve) => originalTimer(resolve, 10))
          controller.abort()
        }
        const outcome = await Promise.race([pending, new Promise<string>((resolve) => originalTimer(() => resolve('hung'), 500))])
        AudioContext.prototype.resume = originalResume; HTMLMediaElement.prototype.play = originalPlay; window.setTimeout = originalTimer
        pendingProofs.push({ api, mode, entered, outcome })
        if (outcome === 'hung') return { proofs, cancelled, failed, pendingProofs, unchanged: before === JSON.stringify(await service.search()), browser: navigator.userAgent }
      }
    }
    const fixtureBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader(); reader.onload = () => resolve((reader.result as string).split(',')[1]); reader.readAsDataURL(file)
    })
    return { proofs, cancelled, failed, pendingProofs, fixtureBase64, unchanged: before === JSON.stringify(await service.search()), browser: navigator.userAgent }
  })
  const { fixtureBase64, ...receipt } = result
  await testInfo.attach('codec-proof.json', { body: JSON.stringify(receipt, null, 2), contentType: 'application/json' })
  console.log(JSON.stringify(receipt))
  expect(result.proofs.filter((p) => !p.unsupported)).toHaveLength(2)
  for (const proof of result.proofs) {
    expect(proof.outputHash).not.toBe(proof.sourceHash)
    expect(proof.outputBytes!).toBeLessThan(proof.sourceBytes!)
    expect(proof.width!).toBeLessThanOrEqual(720)
    expect(proof.playbackTime!).toBeGreaterThan(0)
    expect(proof.runtimeMs!).toBeLessThan(60000)
  }
  expect(result.cancelled).toBe(true)
  expect(result.failed).toBe(true)
  expect(result.unchanged).toBe(true)
  expect(result.pendingProofs).toHaveLength(6)
  for (const proof of result.pendingProofs) {
    expect(proof.entered).toBe(true)
    expect(proof.outcome).toBe(proof.mode === 'cancel' ? 'cancelled' : proof.mode === 'reject' ? 'Browser API rejected' : 'Video preparation exceeded the 60 second budget. Choose a shorter clip.')
  }
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Natural upload')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  const picker = page.getByLabel('Add image or video — Natural upload', { exact: true })
  for (let i = 0; i < 30 && !(await picker.evaluate((node) => node === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(picker).toBeFocused()
  const choosing = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await choosing).setFiles({ name: 'owned.webm', mimeType: 'video/webm', buffer: Buffer.from(fixtureBase64!, 'base64') })
  await expect(page.getByText('owned.webm', { exact: true })).toBeVisible({ timeout: 10000 })
  await expect(picker).toBeEnabled()
  const video = page.getByRole('article', { name: 'Natural upload', exact: true }).locator('video')
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.videoWidth)).toBe(720)
  await testInfo.attach('natural-upload.png', { body: await page.screenshot(), contentType: 'image/png' })
})
