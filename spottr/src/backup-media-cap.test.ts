import { createSpottrBackup, parseSpottrBackup, restoreSpottrBackup } from './backup'
import { createExerciseService, createMemoryExerciseRepository, type Exercise } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createSessionService, createMemorySessionRepository } from './sessions'
import { createSettingsService, createMemorySettingsRepository } from './settings'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'

const timestamp = '2026-10-12T12:00:00.000Z'
function setup(count: number) {
  const blob = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1Pe'), (c) => c.charCodeAt(0))], { type: 'image/png' })
  const exercise: Exercise = {
    id: 'owned', name: 'Owned reference', muscleGroup: '', equipment: '', notes: '', createdAt: timestamp, updatedAt: timestamp,
    media: Array.from({ length: count }, (_, i) => ({ id: `media-${i}`, kind: 'image', name: `${i}.png`, mimeType: 'image/png', size: blob.size, blob, createdAt: timestamp })),
  }
  const exerciseService = createExerciseService(createMemoryExerciseRepository([exercise]))
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  return {
    exerciseService, workoutService,
    gymService: createGymService(createMemoryGymRepository()),
    sessionService: createSessionService(createMemorySessionRepository(), workoutService, exerciseService),
    settingsService: createSettingsService(createMemorySettingsRepository()),
    now: () => timestamp,
  }
}

it('accepts five but rejects six imported references before replacing any saved domain', async () => {
  const incoming = setup(5)
  const valid = await createSpottrBackup(incoming)
  expect(parseSpottrBackup(JSON.stringify(valid))).toEqual(valid)
  const excess = await createSpottrBackup(setup(6))
  expect(() => parseSpottrBackup(JSON.stringify(excess))).toThrow(/five.*remove.*source/i)
  const current = setup(1)
  const before = await createSpottrBackup(current)
  await expect(restoreSpottrBackup(excess, current)).rejects.toThrow(/five/i)
  expect(await createSpottrBackup(current)).toEqual(before)
})

it('retains all legacy bytes for read/export/reorder/removal and rollback after failed replacement', async () => {
  const legacy = setup(6)
  const before = await createSpottrBackup(legacy)
  expect(before.entities.exercises[0].media).toHaveLength(6)
  await legacy.exerciseService.moveMedia('owned', 'media-5', 'up')
  const reordered = await createSpottrBackup(legacy)
  expect(reordered.entities.exercises[0].media.map(({ id }) => id)).toEqual(['media-0', 'media-1', 'media-2', 'media-3', 'media-5', 'media-4'])
  expect(reordered.entities.exercises[0].media.map(({ content }) => content)).toEqual(before.entities.exercises[0].media.map(({ content }) => content))
  const replaceAll = legacy.workoutService.replaceAll.bind(legacy.workoutService)
  let calls = 0
  legacy.workoutService.replaceAll = async (workouts) => {
    if (++calls === 1) throw new Error('Owned replacement failure')
    await replaceAll(workouts)
  }
  await expect(restoreSpottrBackup(await createSpottrBackup(setup(0)), legacy)).rejects.toThrow(/restore failed/i)
  expect(await createSpottrBackup(legacy)).toEqual(reordered)
  await legacy.exerciseService.removeMedia('owned', 'media-5')
  const reduced = await createSpottrBackup(legacy)
  expect(reduced.entities.exercises[0].media).toHaveLength(5)
  expect(parseSpottrBackup(JSON.stringify(reduced))).toEqual(reduced)
})
