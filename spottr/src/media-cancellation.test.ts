import 'fake-indexeddb/auto'
import { createExerciseService, createMemoryExerciseRepository, EXERCISE_MEDIA_TOTAL_BYTES } from './exercises'
import { createIndexedDbExerciseRepository } from './exerciseRepository'

it.each(['memory', 'indexeddb'])('rejects a cancelled append without erasing committed media through %s storage', async (kind) => {
  const name = `media-cancellation-${crypto.randomUUID()}`
  const repository = kind === 'memory' ? createMemoryExerciseRepository() : createIndexedDbExerciseRepository(name)
  const service = createExerciseService(repository, { prepareImage: async (file) => file })
  try {
    const exercise = await service.create({ name: 'Cancellation control', muscleGroup: '', equipment: '', notes: '' })
    const owner = new AbortController()
    const committed = await service.addMedia(exercise.id, new File(['first'], 'first.png', { type: 'image/png' }), { signal: owner.signal })
    // Cancellation after successful commit cannot undo the already saved file.
    owner.abort()
    await expect(repository.addMedia(exercise.id, {
      ...committed, id: 'cancelled-second', name: 'second.png',
    }, EXERCISE_MEDIA_TOTAL_BYTES, owner.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect((await service.get(exercise.id))?.media.map(({ name }) => name)).toEqual(['first.png'])
    // A rejected append must not poison subsequent work.
    await service.addMedia(exercise.id, new File(['third'], 'third.png', { type: 'image/png' }))
    expect((await service.get(exercise.id))?.media.map(({ name }) => name)).toEqual(['first.png', 'third.png'])
  } finally {
    await repository.close?.()
    if (kind === 'indexeddb') indexedDB.deleteDatabase(name)
  }
})
