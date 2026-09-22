export type Exercise = {
  id: string
  name: string
  muscleGroup: string
  equipment: string
  notes: string
  createdAt: string
  updatedAt: string
  media: ExerciseMedia[]
}

export type ExerciseDraft = Pick<Exercise, 'name' | 'muscleGroup' | 'equipment' | 'notes'>

export type ExerciseMedia = {
  id: string
  kind: 'image' | 'video'
  name: string
  mimeType: string
  size: number
  blob: Blob
  createdAt: string
}

export const EXERCISE_VIDEO_MAX_BYTES = 15 * 1024 * 1024
export const EXERCISE_IMAGE_SOURCE_MAX_BYTES = 10 * 1024 * 1024
export const EXERCISE_IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const EXERCISE_MEDIA_TOTAL_BYTES = 25 * 1024 * 1024
export const EXERCISE_IMAGE_MAX_PIXELS = 20_000_000

export interface ExerciseRepository {
  list(): Promise<Exercise[]>
  get(id: string): Promise<Exercise | null>
  save(exercise: Exercise): Promise<void>
  addMedia(exerciseId: string, media: ExerciseMedia, totalLimit: number): Promise<void>
  moveMedia(exerciseId: string, mediaId: string, direction: 'up' | 'down'): Promise<void>
  removeMedia(exerciseId: string, mediaId: string): Promise<void>
  close?(): Promise<void>
}

export type ExerciseService = ReturnType<typeof createExerciseService>

type ExerciseServiceOptions = {
  createId?: () => string
  now?: () => string
  prepareImage?: (file: File) => Promise<Blob>
}

export function createExerciseService(repository: ExerciseRepository, options: ExerciseServiceOptions = {}) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())
  const prepareImage = options.prepareImage ?? compressExerciseImage

  function withMedia(exercise: Exercise): Exercise {
    return { ...exercise, media: exercise.media ?? [] }
  }

  async function requireExercise(id: string) {
    const exercise = await repository.get(id)
    if (!exercise) throw new Error('Exercise not found')
    return withMedia(exercise)
  }

  function normalize(draft: ExerciseDraft): ExerciseDraft {
    const name = draft.name.trim()
    if (!name) throw new Error('Exercise name is required')
    return {
      name,
      muscleGroup: draft.muscleGroup.trim(),
      equipment: draft.equipment.trim(),
      notes: draft.notes.trim(),
    }
  }

  return {
    async search(query = '') {
      const normalizedQuery = query.trim().toLocaleLowerCase()
      const exercises = await repository.list()
      return exercises
        .map(withMedia)
        .filter((exercise) => !normalizedQuery || [
          exercise.name,
          exercise.muscleGroup,
          exercise.equipment,
          exercise.notes,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
        .sort((left, right) => left.name.localeCompare(right.name))
    },

    async create(draft: ExerciseDraft) {
      const normalized = normalize(draft)
      const timestamp = now()
      const exercise: Exercise = {
        id: createId(),
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp,
        media: [],
      }
      await repository.save(exercise)
      return exercise
    },

    async update(id: string, draft: ExerciseDraft) {
      const current = await requireExercise(id)
      const exercise: Exercise = { ...current, ...normalize(draft), updatedAt: now() }
      await repository.save(exercise)
      return exercise
    },

    async get(id: string) {
      const exercise = await repository.get(id)
      return exercise ? withMedia(exercise) : null
    },

    async addMedia(exerciseId: string, file: File) {
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null
      if (!kind) throw new Error('Choose an image or video file')
      if (kind === 'video' && file.size > EXERCISE_VIDEO_MAX_BYTES) {
        throw new Error('Video exceeds the 15 MB per-video limit')
      }
      const blob = kind === 'image' ? await prepareImage(file) : file
      if (kind === 'image' && blob.size > EXERCISE_IMAGE_MAX_BYTES) {
        throw new Error('Image could not be compressed below the 2 MB image limit')
      }
      const media: ExerciseMedia = {
        id: createId(),
        kind,
        name: file.name,
        mimeType: blob.type || file.type,
        size: blob.size,
        blob,
        createdAt: now(),
      }
      await repository.addMedia(exerciseId, media, EXERCISE_MEDIA_TOTAL_BYTES)
      return media
    },

    async moveMedia(exerciseId: string, mediaId: string, direction: 'up' | 'down') {
      await repository.moveMedia(exerciseId, mediaId, direction)
      return requireExercise(exerciseId)
    },

    async removeMedia(exerciseId: string, mediaId: string) {
      await repository.removeMedia(exerciseId, mediaId)
      return requireExercise(exerciseId)
    },
  }
}

export async function compressExerciseImage(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Choose a JPEG or PNG image')
  }
  if (file.size > EXERCISE_IMAGE_SOURCE_MAX_BYTES) {
    throw new Error('Image exceeds the 10 MB source limit')
  }
  const dimensions = await readSafeImageDimensions(file)
  if (dimensions.width * dimensions.height > EXERCISE_IMAGE_MAX_PIXELS) {
    throw new Error('Image dimensions exceed the 20 megapixel safety limit')
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('This browser cannot prepare images for local storage')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!blob) throw new Error('The image could not be compressed')
  return blob
}

async function readSafeImageDimensions(file: File) {
  const buffer = typeof file.arrayBuffer === 'function'
    ? await file.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('The image could not be read'))
      reader.readAsArrayBuffer(file)
    })
  const bytes = new Uint8Array(buffer)
  if (file.type === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const validHeader = bytes.length >= 33
      && signature.every((value, index) => bytes[index] === value)
      && bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13
      && bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52
    if (!validHeader) {
      throw new Error('The PNG image is invalid')
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (crc32(bytes.subarray(12, 29)) !== view.getUint32(29)) throw new Error('The PNG header checksum is invalid')
    const dimensions = { width: view.getUint32(16), height: view.getUint32(20) }
    if (!dimensions.width || !dimensions.height) throw new Error('The PNG image dimensions are invalid')
    return dimensions
  }

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('The JPEG image is invalid')
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('The JPEG marker sequence is invalid')
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9) throw new Error('The JPEG ended before its frame header')
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (marker === 0x00 || marker === 0xd8) throw new Error('The JPEG marker ordering is invalid')
    if (offset + 2 > bytes.length) throw new Error('The JPEG segment is truncated')
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) throw new Error('The JPEG segment length is invalid')
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) throw new Error('The JPEG frame header is invalid')
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const components = bytes[offset + 7]
      if (!components || length !== 8 + (3 * components)) throw new Error('The JPEG frame components are invalid')
      const dimensions = { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) }
      if (!dimensions.width || !dimensions.height) throw new Error('The JPEG image dimensions are invalid')
      return dimensions
    }
    if (marker === 0xda) break
    offset += length
  }
  throw new Error('The JPEG image dimensions could not be read safely')
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function createMemoryExerciseRepository(initialExercises: Exercise[] = []): ExerciseRepository {
  const cloneExercise = (exercise: Exercise): Exercise => ({
    ...exercise,
    media: (exercise.media ?? []).map((media) => ({ ...media })),
  })
  const exercises = new Map(initialExercises.map((exercise) => [exercise.id, cloneExercise(exercise)]))

  return {
    async list() {
      return [...exercises.values()].map(cloneExercise)
    },
    async get(id) {
      const exercise = exercises.get(id)
      return exercise ? cloneExercise(exercise) : null
    },
    async save(exercise) {
      const current = exercises.get(exercise.id)
      exercises.set(exercise.id, cloneExercise({ ...exercise, media: current?.media ?? exercise.media }))
    },
    async addMedia(exerciseId, media, totalLimit) {
      const exercise = exercises.get(exerciseId)
      if (!exercise) throw new Error('Exercise not found')
      const total = [...exercises.values()].reduce(
        (sum, item) => sum + (item.media ?? []).reduce((mediaSum, entry) => mediaSum + entry.size, 0),
        0,
      )
      if (total + media.size > totalLimit) {
        throw new Error('Local media storage limit of 25 MB reached. Remove media before adding another file.')
      }
      exercise.media = [...(exercise.media ?? []), { ...media }]
    },
    async moveMedia(exerciseId, mediaId, direction) {
      const exercise = exercises.get(exerciseId)
      if (!exercise) throw new Error('Exercise not found')
      const index = exercise.media.findIndex(({ id }) => id === mediaId)
      if (index < 0) throw new Error('Exercise media not found')
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= exercise.media.length) return
      ;[exercise.media[index], exercise.media[target]] = [exercise.media[target], exercise.media[index]]
    },
    async removeMedia(exerciseId, mediaId) {
      const exercise = exercises.get(exerciseId)
      if (!exercise) throw new Error('Exercise not found')
      const remaining = exercise.media.filter(({ id }) => id !== mediaId)
      if (remaining.length === exercise.media.length) throw new Error('Exercise media not found')
      exercise.media = remaining
    },
  }
}
