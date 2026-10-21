import { importExercise, parseSpottrBackup, type SpottrBackup } from './backup'
import { EXERCISE_IMAGE_MAX_PIXELS } from './exercises'

// This is a read-only incoming-file boundary. Never use it for trusted undo replay:
// legacy stored attachments must remain recoverable even on a different decoder.
export async function preflightBackupMedia(backup: SpottrBackup, signal: AbortSignal): Promise<SpottrBackup> {
  // Own the validated bytes, not a caller's mutable graph across async decoding.
  const incoming = parseSpottrBackup(JSON.stringify(backup))
  for (const exercise of incoming.entities.exercises) {
    for (const media of importExercise(exercise).media) {
      signal.throwIfAborted()
      const element = media.kind === 'image' ? new Image() : document.createElement('video')
      const video = element instanceof HTMLVideoElement ? element : null
      if (video && !video.canPlayType(media.mimeType)) {
        throw new Error('This backup contains a video format this browser does not support. Your saved data has not been changed.')
      }
      const url = URL.createObjectURL(media.blob)
      try {
        await new Promise<void>((resolve, reject) => {
          const fail = () => finish(new Error(`Backup ${media.kind} could not be decoded by this browser. Your saved data has not been changed.`))
          const abort = () => finish(signal.reason ?? new DOMException('Cancelled', 'AbortError'))
          const timer = window.setTimeout(fail, 15_000)
          const finish = (error?: unknown) => {
            window.clearTimeout(timer)
            signal.removeEventListener('abort', abort)
            element.onerror = null
            if (video) video.onloadeddata = null
            else element.onload = null
            if (error) reject(error)
            else resolve()
          }
          const decoded = () => {
            const width = video ? video.videoWidth : (element as HTMLImageElement).naturalWidth
            const height = video ? video.videoHeight : (element as HTMLImageElement).naturalHeight
            if (!width || !height || (!video && width * height > EXERCISE_IMAGE_MAX_PIXELS)
              || (video && (!Number.isFinite(video.duration) || video.duration <= 0))) { fail(); return }
            // Reading a real decoded frame also rejects unusable media resources.
            try {
              const canvas = document.createElement('canvas')
              canvas.width = 1; canvas.height = 1
              const context = canvas.getContext('2d')
              if (!context) { fail(); return }
              context.drawImage(element, 0, 0, 1, 1)
              context.getImageData(0, 0, 1, 1)
              finish()
            } catch { fail() }
          }
          signal.addEventListener('abort', abort, { once: true })
          element.onerror = fail
          if (video) { video.preload = 'auto'; video.onloadeddata = decoded }
          else element.onload = decoded
          element.src = url
          if (signal.aborted) abort()
        })
      } finally {
        if (video) { video.pause(); video.removeAttribute('src'); video.load() }
        else element.removeAttribute('src')
        URL.revokeObjectURL(url)
      }
    }
  }
  signal.throwIfAborted()
  return incoming
}
