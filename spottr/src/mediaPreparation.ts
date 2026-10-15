export type MediaPreparationOptions = { signal?: AbortSignal; onProgress?: (fraction: number) => void }
const MAX_BYTES = 15 * 1024 * 1024
const BUDGET_MS = 60_000

export function detectVideoCapabilities() {
  return ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/mp4;codecs=avc1.42001E,mp4a.40.2']
    .filter((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type))
}

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new DOMException('Media preparation cancelled', 'AbortError')
}

function waitForVideo(video: HTMLVideoElement, event: 'loadedmetadata' | 'loadeddata', signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { video.removeEventListener(event, ready); video.removeEventListener('error', failed); signal.removeEventListener('abort', cancel) }
    const ready = () => { cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new Error('This video could not be decoded. Choose a playable WebM or MP4 video.')) }
    const cancel = () => { cleanup(); reject(signal.reason ?? new DOMException('Media preparation cancelled', 'AbortError')) }
    video.addEventListener(event, ready, { once: true }); video.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
  })
}

export async function compressExerciseVideo(file: File, options: MediaPreparationOptions = {}): Promise<Blob> {
  if (!['video/webm', 'video/mp4'].includes(file.type)) throw new Error('Choose a playable WebM or MP4 video')
  if (file.size > MAX_BYTES) throw new Error('Video exceeds the 15 MB source limit')
  const outputType = detectVideoCapabilities()[0]
  if (!outputType || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('This browser cannot compress video locally. Try a browser with canvas capture and MediaRecorder support.')
  }
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const deadline = setTimeout(() => controller.abort(new Error('Video preparation exceeded the 60 second budget. Choose a shorter clip.')), BUDGET_MS)
  const signal = controller.signal
  try {
    aborted(signal)
    for (const [attempt, bitrate] of [1_200_000, 500_000].entries()) {
      const blob = await encode(file, outputType, bitrate, signal, (fraction) => options.onProgress?.((attempt + fraction) / 2))
      aborted(signal)
      if (blob.size > 0 && blob.size <= MAX_BYTES && blob.size < file.size) {
        await verifyOutput(blob, signal)
        aborted(signal)
        options.onProgress?.(1)
        aborted(signal)
        return blob
      }
    }
    throw new Error('Video could not be compressed below its original size and the 15 MB limit. Choose a shorter or higher-resolution source.')
  } finally {
    clearTimeout(deadline)
    options.signal?.removeEventListener('abort', cancel)
  }
}

function waitForOperation(operation: Promise<void>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { cleanup(); reject(signal.reason ?? new DOMException('Media preparation cancelled', 'AbortError')) }
    const cleanup = () => signal.removeEventListener('abort', cancel)
    signal.addEventListener('abort', cancel, { once: true })
    operation.then(() => { cleanup(); resolve() }, (error) => { cleanup(); reject(error) })
    if (signal.aborted) cancel()
  })
}

async function encode(file: File, type: string, bitrate: number, signal: AbortSignal, progress: (fraction: number) => void) {
  const video = document.createElement('video')
  video.playsInline = true
  // MediaElementAudioSourceNode observes the element's mute state: muting here
  // records silence. The graph below connects only to the recording destination,
  // never audio.destination, so unmuted decoding does not play through speakers.
  video.muted = false
  const url = URL.createObjectURL(file)
  let stream: MediaStream | undefined
  let recorder: MediaRecorder | undefined
  let audio: AudioContext | undefined
  let frame = 0
  try {
    const metadata = waitForVideo(video, 'loadedmetadata', signal)
    video.src = url
    await metadata
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 50
      || !video.videoWidth || !video.videoHeight || video.videoWidth * video.videoHeight > 20_000_000) {
      throw new Error('Video must have valid dimensions and a finite duration up to 50 seconds for bounded local encoding.')
    }
    aborted(signal)
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2)
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot draw video for compression')
    stream = canvas.captureStream(30)
    // Route decoded audio to the encoder, not the speakers; do not silently strip it.
    audio = new AudioContext()
    const destination = audio.createMediaStreamDestination()
    audio.createMediaElementSource(video).connect(destination)
    await waitForOperation(audio.resume(), signal)
    destination.stream.getAudioTracks().forEach((track) => stream!.addTrack(track))
    aborted(signal)
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitrate, audioBitsPerSecond: 64_000 })
    const chunks: Blob[] = []
    let bytes = 0
    const recorded = new Promise<Blob>((resolve, reject) => {
      const cancel = () => reject(signal.reason ?? new DOMException('Media preparation cancelled', 'AbortError'))
      signal.addEventListener('abort', cancel, { once: true })
      recorder!.ondataavailable = ({ data }) => {
        bytes += data.size
        if (bytes > MAX_BYTES) { reject(new Error('Encoded video exceeds the 15 MB limit')); return }
        if (data.size) chunks.push(data)
      }
      recorder!.onerror = () => { signal.removeEventListener('abort', cancel); reject(new Error('The local video encoder failed')) }
      recorder!.onstop = () => { signal.removeEventListener('abort', cancel); resolve(new Blob(chunks, { type: recorder!.mimeType })) }
      video.onended = () => { if (recorder!.state !== 'inactive') recorder!.stop() }
      video.onerror = () => reject(new Error('Video decoding failed during compression'))
    })
    // Observe recorder failure immediately, including while play() is pending.
    void recorded.catch(() => undefined)
    const draw = () => {
      if (signal.aborted) return
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      progress(Math.min(0.99, video.currentTime / video.duration))
      frame = requestAnimationFrame(draw)
    }
    recorder.start(200)
    draw()
    await waitForOperation(video.play(), signal)
    return await recorded
  } finally {
    cancelAnimationFrame(frame)
    video.pause(); video.onended = null; video.onerror = null
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    stream?.getTracks().forEach((track) => track.stop())
    // close() must not hold cancellation hostage if a browser leaves it pending.
    if (audio) void audio.close().catch(() => undefined)
    video.removeAttribute('src'); video.load()
    URL.revokeObjectURL(url)
  }
}

async function verifyOutput(blob: Blob, signal: AbortSignal) {
  const video = document.createElement('video')
  const url = URL.createObjectURL(blob)
  try {
    const decoded = waitForVideo(video, 'loadeddata', signal)
    video.preload = 'auto'; video.src = url
    await decoded
    if (!video.videoWidth || !video.videoHeight) throw new Error('Encoded video has no playable frames')
  } finally {
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url)
  }
}
