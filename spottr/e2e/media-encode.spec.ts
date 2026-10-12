import { test, expect } from '@playwright/test'

test('owned WebM and MP4 fixtures are really resized, encoded, stored and playable; cancel/failure do not mutate', async ({ page }, testInfo) => {
  await page.goto('./')
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
    return { proofs, cancelled, failed, unchanged: before === JSON.stringify(await service.search()), browser: navigator.userAgent }
  })
  await testInfo.attach('codec-proof.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  console.log(JSON.stringify(result))
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
})
