import 'fake-indexeddb/auto'
import {
  EXERCISE_MEDIA_TOTAL_BYTES,
  EXERCISE_IMAGE_SOURCE_MAX_BYTES,
  EXERCISE_VIDEO_MAX_BYTES,
  compressExerciseImage,
  createExerciseService,
  createMemoryExerciseRepository,
} from './exercises'
import { createIndexedDbExerciseRepository } from './exerciseRepository'

describe('shared exercise library', () => {
  it('exerciseVariation_duplicate_createsAnIndependentSharedIdentity', async () => {
    const service = createExerciseService(createMemoryExerciseRepository(), {
      createId: (() => {
        let value = 0
        return () => `exercise-${++value}`
      })(),
      now: () => '2026-09-23T01:15:00.000Z',
      prepareImage: async (file) => file,
    })
    const original = await service.create({
      name: 'Back Squat',
      muscleGroup: 'Legs',
      equipment: 'Barbell',
      notes: 'Standard stance',
    })
    await service.addMedia(original.id, new File(['setup'], 'setup.png', { type: 'image/png' }))

    const variation = await service.duplicate(original.id, 'Pause Squat')
    await service.update(variation.id, { ...variation, notes: 'Two-second pause' })

    expect(variation).toMatchObject({
      id: 'exercise-3',
      name: 'Pause Squat',
      muscleGroup: 'Legs',
      equipment: 'Barbell',
      notes: 'Standard stance',
      media: [],
    })
    expect(await service.get(original.id)).toMatchObject({
      id: 'exercise-1',
      name: 'Back Squat',
      notes: 'Standard stance',
      media: [expect.objectContaining({ name: 'setup.png' })],
    })
  })

  it('exerciseLibrary_createSearchEdit_returnsMatchingSharedExercises', async () => {
    const service = createExerciseService(createMemoryExerciseRepository(), {
      createId: () => 'exercise-1',
      now: () => '2026-09-22T07:15:00.000Z',
    })

    const created = await service.create({
      name: '  Incline Dumbbell Press  ',
      muscleGroup: ' Chest ',
      equipment: ' Dumbbells ',
      notes: ' 30 degree bench ',
    })
    expect(created).toMatchObject({
      id: 'exercise-1',
      name: 'Incline Dumbbell Press',
      muscleGroup: 'Chest',
      equipment: 'Dumbbells',
      notes: '30 degree bench',
    })
    await expect(service.search('dumbbell')).resolves.toEqual([created])
    await expect(service.search('chest')).resolves.toEqual([created])

    const edited = await service.update('exercise-1', {
      name: 'Incline Barbell Press',
      muscleGroup: 'Chest',
      equipment: 'Barbell',
      notes: '',
    })
    expect(edited.name).toBe('Incline Barbell Press')
    await expect(service.search('dumbbell')).resolves.toEqual([])
    await expect(service.search('barbell')).resolves.toEqual([edited])
  })

  it('does not let an earlier exercise save repopulate a restored library', async () => {
    const repository = createMemoryExerciseRepository()
    const originalSave = repository.save.bind(repository)
    let releaseSave!: () => void
    let markSaveStarted!: () => void
    const saveStarted = new Promise<void>((resolve) => { markSaveStarted = resolve })
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve })
    repository.save = async (exercise) => {
      markSaveStarted()
      await saveGate
      await originalSave(exercise)
    }
    const service = createExerciseService(repository, {
      createId: () => 'earlier-exercise',
      now: () => '2026-09-29T12:00:00.000Z',
    })
    const restoredExercise = {
      id: 'restored-exercise',
      name: 'Restored Exercise',
      muscleGroup: 'Back',
      equipment: 'Cable',
      notes: '',
      createdAt: '2026-09-29T11:00:00.000Z',
      updatedAt: '2026-09-29T11:00:00.000Z',
      media: [],
    }

    const earlierSave = service.create({ name: 'Earlier Exercise', muscleGroup: '', equipment: '', notes: '' })
    await saveStarted
    const replacement = service.replaceAll([restoredExercise])
    releaseSave()
    await Promise.all([earlierSave, replacement])

    await expect(service.search()).resolves.toEqual([restoredExercise])
  })

  it('exerciseLibrary_reload_restoresPersistedExercise', async () => {
    const databaseName = `spottr-exercises-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbExerciseRepository(databaseName)
    const firstService = createExerciseService(firstRepository, {
      createId: () => 'persistent-exercise',
      now: () => '2026-09-22T07:30:00.000Z',
    })
    await firstService.create({
      name: 'Cable Row',
      muscleGroup: 'Back',
      equipment: 'Cable',
      notes: 'Neutral grip',
    })
    await firstRepository.close?.()

    const reloadedRepository = createIndexedDbExerciseRepository(databaseName)
    const reloadedService = createExerciseService(reloadedRepository)
    await expect(reloadedService.search('neutral')).resolves.toEqual([
      expect.objectContaining({ id: 'persistent-exercise', name: 'Cable Row' }),
    ])
    await reloadedRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })

  it('exerciseMedia_addReorderRemove_keepsAnExplicitOrder', async () => {
    const service = createExerciseService(createMemoryExerciseRepository(), {
      createId: (() => {
        let value = 0
        return () => `id-${++value}`
      })(),
      now: () => '2026-09-22T13:15:00.000Z',
      prepareImage: async (file) => file,
    })
    const exercise = await service.create({ name: 'Deadlift', muscleGroup: 'Back', equipment: 'Barbell', notes: '' })
    const image = await service.addMedia(exercise.id, new File(['image'], 'setup.png', { type: 'image/png' }))
    const video = await service.addMedia(exercise.id, new File(['video'], 'rep.mp4', { type: 'video/mp4' }))

    expect((await service.get(exercise.id))?.media.map((item) => item.id)).toEqual([image.id, video.id])
    await service.moveMedia(exercise.id, video.id, 'up')
    expect((await service.get(exercise.id))?.media.map((item) => item.id)).toEqual([video.id, image.id])
    await service.removeMedia(exercise.id, video.id)
    expect((await service.get(exercise.id))?.media.map((item) => item.id)).toEqual([image.id])
  })

  it('reports accurate media storage usage after additions and removals', async () => {
    const service = createExerciseService(createMemoryExerciseRepository(), {
      prepareImage: async (file) => file,
    })
    const exercise = await service.create({ name: 'Deadlift', muscleGroup: '', equipment: '', notes: '' })
    const image = await service.addMedia(exercise.id, new File(['1234'], 'setup.png', { type: 'image/png' }))
    await service.addMedia(exercise.id, new File(['123456'], 'rep.mp4', { type: 'video/mp4' }))

    expect(await service.getMediaStorageUsage()).toEqual({ bytes: 10, count: 2, limitBytes: EXERCISE_MEDIA_TOTAL_BYTES })
    await service.removeMedia(exercise.id, image.id)
    expect(await service.getMediaStorageUsage()).toEqual({ bytes: 6, count: 1, limitBytes: EXERCISE_MEDIA_TOTAL_BYTES })
  })

  it('exerciseMedia_image_passesThroughCompressionBeforeStorage', async () => {
    const compressed = new Blob(['small'], { type: 'image/jpeg' })
    const prepareImage = vi.fn(async () => compressed)
    const service = createExerciseService(createMemoryExerciseRepository(), {
      createId: () => 'media-id',
      prepareImage,
    })
    const exercise = await service.create({ name: 'Press', muscleGroup: '', equipment: '', notes: '' })

    const media = await service.addMedia(exercise.id, new File(['original image'], 'form.png', { type: 'image/png' }))

    expect(prepareImage).toHaveBeenCalledOnce()
    expect(media).toMatchObject({ kind: 'image', mimeType: 'image/jpeg', size: compressed.size })
    expect(media.blob).toBe(compressed)
  })

  it('exerciseMedia_rejectsPreparedImageOverTwoMegabytesWithoutPersisting', async () => {
    const prepared = new Blob(
      [new Uint8Array((2 * 1024 * 1024) + 1)],
      { type: 'image/jpeg' },
    )
    const repository = createMemoryExerciseRepository()
    const service = createExerciseService(repository, {
      prepareImage: async () => prepared,
    })
    const exercise = await service.create({ name: 'Press', muscleGroup: '', equipment: '', notes: '' })

    await expect(service.addMedia(
      exercise.id,
      new File(['source'], 'form.png', { type: 'image/png' }),
    )).rejects.toThrow(/2 MB image limit/i)
    await expect(service.get(exercise.id)).resolves.toMatchObject({ media: [] })
  })

  it('exerciseMedia_capsVideoAndTotalStorageWithActionableErrors', async () => {
    const repository = createMemoryExerciseRepository()
    const service = createExerciseService(repository, { prepareImage: async (file) => file })
    const exercise = await service.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })

    await expect(service.addMedia(exercise.id, new File(
      [new Uint8Array(EXERCISE_VIDEO_MAX_BYTES + 1)],
      'too-large.mp4',
      { type: 'video/mp4' },
    ))).rejects.toThrow(/video.*limit/i)

    await repository.addMedia(exercise.id, {
      id: 'existing',
      kind: 'video',
      name: 'existing.mp4',
      mimeType: 'video/mp4',
      size: EXERCISE_MEDIA_TOTAL_BYTES - 2,
      blob: new Blob(['x'], { type: 'video/mp4' }),
      createdAt: '2026-09-22T13:15:00.000Z',
    }, EXERCISE_MEDIA_TOTAL_BYTES)
    await expect(service.addMedia(
      exercise.id,
      new File(['more'], 'more.png', { type: 'image/png' }),
    )).rejects.toThrow(/storage.*limit/i)
    await expect(service.addMedia(
      exercise.id,
      new File(['text'], 'notes.txt', { type: 'text/plain' }),
    )).rejects.toThrow(/image or video/i)
  })

  it('exerciseMedia_rejectsOversizedOrUnsafeImageDimensionsBeforeDecode', async () => {
    await expect(compressExerciseImage(new File(
      [new Uint8Array(EXERCISE_IMAGE_SOURCE_MAX_BYTES + 1)],
      'huge.png',
      { type: 'image/png' },
    ))).rejects.toThrow(/10 MB source limit/i)

    const unsafePngHeader = new Uint8Array(33)
    unsafePngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    new DataView(unsafePngHeader.buffer).setUint32(8, 13)
    unsafePngHeader.set([0x49, 0x48, 0x44, 0x52], 12)
    new DataView(unsafePngHeader.buffer).setUint32(16, 10_000)
    new DataView(unsafePngHeader.buffer).setUint32(20, 10_000)
    new DataView(unsafePngHeader.buffer).setUint32(29, 0xaf55763a)
    await expect(compressExerciseImage(new File(
      [unsafePngHeader],
      'unsafe.png',
      { type: 'image/png' },
    ))).rejects.toThrow(/20 megapixel safety limit/i)

    const malformedPng = new Uint8Array(24)
    malformedPng.set([0x89, 0x50, 0x4e, 0x47])
    await expect(compressExerciseImage(new File(
      [malformedPng],
      'malformed.png',
      { type: 'image/png' },
    ))).rejects.toThrow(/PNG image is invalid/i)
  })

  it('exerciseMedia_reload_restoresBlobAndOrderFromIndexedDb', async () => {
    const databaseName = `spottr-media-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbExerciseRepository(databaseName)
    const firstService = createExerciseService(firstRepository, {
      createId: (() => {
        let value = 0
        return () => `persistent-${++value}`
      })(),
      prepareImage: async (file) => file,
    })
    const exercise = await firstService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    await firstService.addMedia(exercise.id, new File(['first'], 'first.png', { type: 'image/png' }))
    await firstService.addMedia(exercise.id, new File(['second'], 'second.mp4', { type: 'video/mp4' }))
    await firstRepository.close?.()

    const reloadedRepository = createIndexedDbExerciseRepository(databaseName)
    const restored = await createExerciseService(reloadedRepository).get(exercise.id)
    expect(restored?.media.map(({ name }) => name)).toEqual(['first.png', 'second.mp4'])
    expect(restored?.media[0]).toMatchObject({ kind: 'image', size: 5 })
    await reloadedRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })

  it('exerciseMedia_concurrentIndexedDbAdds_cannotExceedTheTotalCapOrLoseAWrite', async () => {
    const databaseName = `spottr-media-concurrency-${crypto.randomUUID()}`
    const repository = createIndexedDbExerciseRepository(databaseName)
    const setup = createExerciseService(repository, { createId: () => 'exercise-id' })
    const exercise = await setup.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    const first = createExerciseService(repository, { createId: () => 'first-media' })
    const second = createExerciseService(repository, { createId: () => 'second-media' })
    const video = () => new File([new Uint8Array(EXERCISE_VIDEO_MAX_BYTES)], 'rep.mp4', { type: 'video/mp4' })

    const results = await Promise.allSettled([
      first.addMedia(exercise.id, video()),
      second.addMedia(exercise.id, video()),
    ])

    expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((await setup.get(exercise.id))?.media).toHaveLength(1)
    await repository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })
})
