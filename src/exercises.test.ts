import 'fake-indexeddb/auto'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createIndexedDbExerciseRepository } from './exerciseRepository'

describe('shared exercise library', () => {
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
})
