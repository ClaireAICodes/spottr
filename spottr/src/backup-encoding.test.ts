import { createSpottrBackup } from './backup'
import { createExerciseService, createMemoryExerciseRepository, type Exercise } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createSessionService, createMemorySessionRepository } from './sessions'
import { createSettingsService, createMemorySettingsRepository } from './settings'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'

const timestamp = '2026-09-29T01:02:03.000Z'
function exportMedia(type: string) {
  const blob = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 255])], { type })
  const exercise: Exercise = {
    id: 'exercise-encoding', name: 'Encoding control', muscleGroup: '', equipment: '', notes: '',
    createdAt: timestamp, updatedAt: timestamp,
    media: [{ id: 'media-encoding', kind: type.startsWith('image/') ? 'image' : 'video',
      name: 'control', mimeType: type, size: blob.size, blob, createdAt: timestamp }],
  }
  const exerciseService = createExerciseService(createMemoryExerciseRepository([exercise]))
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  return createSpottrBackup({
    exerciseService, workoutService,
    gymService: createGymService(createMemoryGymRepository()),
    sessionService: createSessionService(createMemorySessionRepository(), workoutService, exerciseService),
    settingsService: createSettingsService(createMemorySettingsRepository()), now: () => timestamp,
  })
}

describe('public backup media encoding', () => {
  it('rejects a reader result without an explicit base64 payload', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'data:video/webm,not-base64' })
      this.dispatchEvent(new ProgressEvent('load'))
    })
    try {
      await expect(exportMedia('video/webm')).rejects.toThrow('Exercise media could not be encoded for backup')
    } finally {
      read.mockRestore()
    }
  })
  it.each(['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'image/png'])(
    'exports exact original bytes with MIME %s', async (type) => {
      const backup = await exportMedia(type)
      const media = backup.entities.exercises[0].media[0]
      expect(media.id).toBe('media-encoding')
      expect(media.size).toBe(7)
      expect(media.content.data).toBe('AAECAwQF/w==')
      expect(Array.from(atob(media.content.data), character => character.charCodeAt(0)))
        .toEqual([0, 1, 2, 3, 4, 5, 255])
    },
  )
})
