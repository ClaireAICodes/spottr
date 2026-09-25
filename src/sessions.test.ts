import 'fake-indexeddb/auto'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createIndexedDbSessionRepository } from './sessionRepository'
import { createMemorySessionRepository, createSessionService } from './sessions'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

async function createTrainingContext() {
  const gymService = createGymService(createMemoryGymRepository(), { createId: () => 'gym-1' })
  const gym = await gymService.create({ name: 'North Gym', address: '' })
  let exerciseId = 0
  const exerciseService = createExerciseService(createMemoryExerciseRepository(), {
    createId: () => `exercise-${++exerciseId}`,
  })
  const squat = await exerciseService.create({ name: 'Back Squat', muscleGroup: 'Legs', equipment: 'Barbell', notes: '' })
  const row = await exerciseService.create({ name: 'Cable Row', muscleGroup: 'Back', equipment: 'Cable', notes: '' })
  let workoutId = 0
  const workoutService = createWorkoutService(createMemoryWorkoutRepository(), {
    createId: () => `workout-${++workoutId}`,
  })
  const template = await workoutService.create({
    name: 'Lower Strength',
    gymId: gym.id,
    exercises: [
      { exerciseId: squat.id, sets: [{ kind: 'warm-up', weight: 20, reps: 10 }, { kind: 'working', weight: 80, reps: 5 }] },
      { exerciseId: row.id, sets: [{ kind: 'working', weight: 45, reps: 10 }] },
    ],
  })
  return { gym, exerciseService, workoutService, template }
}

describe('active workout session service', () => {
  it('completes a partial workout into durable history with skipped work excluded from volume', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    const timestamps = ['2026-09-25T01:00:00.000Z', '2026-09-25T01:15:00.000Z', '2026-09-25T02:30:00.000Z']
    const service = createSessionService(repository, context.workoutService, context.exerciseService, {
      createId: () => crypto.randomUUID(),
      now: () => timestamps.shift()!,
    })
    const started = await service.start(context.template.id, context.gym.name)

    await service.logSet(started.exercises[0].id, started.exercises[0].sets[0].id, { weight: 22.5, reps: 9 })
    const completed = await service.complete()

    expect(completed).toMatchObject({
      name: 'Lower Strength',
      gymId: context.gym.id,
      gymName: 'North Gym',
      startedAt: '2026-09-25T01:00:00.000Z',
      endedAt: '2026-09-25T02:30:00.000Z',
      summary: {
        completedExercises: 1,
        skippedExercises: 1,
        completedSets: 1,
        skippedSets: 2,
        volume: 202.5,
        durationSeconds: 5400,
      },
    })
    expect(completed.exercises[0].sets[0]).toMatchObject({ completedAt: '2026-09-25T01:15:00.000Z', skippedAt: null })
    expect(completed.exercises[0].sets[1].skippedAt).toBe('2026-09-25T02:30:00.000Z')
    expect(completed.exercises[1].sets[0].skippedAt).toBe('2026-09-25T02:30:00.000Z')
    expect(await service.getActive()).toBeNull()
    expect(await service.listHistory()).toEqual([completed])
    expect(await service.getHistory(completed.id)).toEqual(completed)

    completed.summary.volume = 999
    const listed = await service.listHistory()
    listed[0].summary.volume = 888
    expect((await service.getHistory(completed.id))?.summary.volume).toBe(202.5)
  })

  it('starts an independent snapshot and resumes logged sets without mutating the template', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    let id = 0
    const service = createSessionService(repository, context.workoutService, context.exerciseService, {
      createId: () => `session-${++id}`,
      now: () => '2026-09-24T13:15:00.000Z',
    })

    const started = await service.start(context.template.id)
    const firstSet = started.exercises[0].sets[0]
    const logged = await service.logSet(started.exercises[0].id, firstSet.id, { weight: 22.5, reps: 9 })

    expect(logged).toMatchObject({ name: 'Lower Strength', gymId: context.gym.id })
    expect(logged.exercises.map(({ name }) => name)).toEqual(['Back Squat', 'Cable Row'])
    expect(logged.exercises[0].sets[0]).toMatchObject({
      targetWeight: 20,
      targetReps: 10,
      weight: 22.5,
      reps: 9,
      completedAt: '2026-09-24T13:15:00.000Z',
    })
    const templateAfterLogging = await context.workoutService.get(context.template.id)
    expect(templateAfterLogging).toEqual(context.template)

    await context.workoutService.update(context.template.id, {
      name: 'Changed template',
      gymId: context.gym.id,
      exercises: [{ exerciseId: context.template.exercises[1].exerciseId, sets: [{ kind: 'working', weight: 99, reps: 1 }] }],
    })
    const resumed = await createSessionService(repository, context.workoutService, context.exerciseService).getActive()
    expect(resumed).toEqual(logged)
  })

  it('persists the active snapshot and fast set log across an IndexedDB reopen', async () => {
    const context = await createTrainingContext()
    const databaseName = `spottr-sessions-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbSessionRepository(databaseName)
    const firstService = createSessionService(firstRepository, context.workoutService, context.exerciseService, {
      createId: () => 'session-1',
      now: () => '2026-09-24T13:15:00.000Z',
    })
    const started = await firstService.start(context.template.id)
    await firstService.logSet(started.exercises[0].id, started.exercises[0].sets[0].id, { weight: 25, reps: 8 })
    await firstRepository.close?.()

    const reopenedRepository = createIndexedDbSessionRepository(databaseName)
    const restored = await createSessionService(reopenedRepository, context.workoutService, context.exerciseService).getActive()

    expect(restored?.exercises[0].sets[0]).toMatchObject({ weight: 25, reps: 8, completedAt: '2026-09-24T13:15:00.000Z' })
    await reopenedRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })

  it('persists completed history across an IndexedDB reopen and sorts it newest first', async () => {
    const context = await createTrainingContext()
    const databaseName = `spottr-history-${crypto.randomUUID()}`
    const timestamps = [
      '2026-09-24T01:00:00.000Z',
      '2026-09-24T02:00:00.000Z',
      '2026-09-25T01:00:00.000Z',
      '2026-09-25T02:00:00.000Z',
    ]
    const firstRepository = createIndexedDbSessionRepository(databaseName)
    const firstService = createSessionService(firstRepository, context.workoutService, context.exerciseService, {
      now: () => timestamps.shift()!,
    })
    await firstService.start(context.template.id, context.gym.name)
    const older = await firstService.complete()
    await context.workoutService.update(context.template.id, {
      name: 'Newer Strength',
      gymId: context.gym.id,
      exercises: context.template.exercises,
    })
    await firstService.start(context.template.id, context.gym.name)
    const newer = await firstService.complete()
    await firstRepository.close?.()

    const reopenedRepository = createIndexedDbSessionRepository(databaseName)
    const reopenedService = createSessionService(reopenedRepository, context.workoutService, context.exerciseService)

    expect((await reopenedService.listHistory()).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: newer.id, name: 'Newer Strength' },
      { id: older.id, name: 'Lower Strength' },
    ])
    expect(await reopenedService.getHistory(older.id)).toMatchObject({
      name: 'Lower Strength',
      gymName: 'North Gym',
      summary: { completedSets: 0, skippedSets: 3, volume: 0 },
    })
    await reopenedRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })

  it('keeps every set when fast logs overlap', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    const service = createSessionService(repository, context.workoutService, context.exerciseService)
    const started = await service.start(context.template.id)
    const exercise = started.exercises[0]

    await Promise.all([
      service.logSet(exercise.id, exercise.sets[0].id, { weight: 20, reps: 10 }),
      service.logSet(exercise.id, exercise.sets[1].id, { weight: 82.5, reps: 5 }),
    ])

    expect((await service.getActive())?.exercises[0].sets.map(({ completedAt }) => Boolean(completedAt))).toEqual([true, true])
  })

  it('keeps overlapping logs from separate IndexedDB service instances', async () => {
    const context = await createTrainingContext()
    const databaseName = `spottr-session-tabs-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbSessionRepository(databaseName)
    const secondRepository = createIndexedDbSessionRepository(databaseName)
    const firstService = createSessionService(firstRepository, context.workoutService, context.exerciseService)
    const secondService = createSessionService(secondRepository, context.workoutService, context.exerciseService)
    const started = await firstService.start(context.template.id)
    const exercise = started.exercises[0]

    await Promise.all([
      firstService.logSet(exercise.id, exercise.sets[0].id, { weight: 20, reps: 10 }),
      secondService.logSet(exercise.id, exercise.sets[1].id, { weight: 82.5, reps: 5 }),
    ])

    expect((await firstService.getActive())?.exercises[0].sets.map(({ completedAt }) => Boolean(completedAt))).toEqual([true, true])
    await firstRepository.close?.()
    await secondRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })

  it('does not overwrite a set already logged by another IndexedDB service instance', async () => {
    const context = await createTrainingContext()
    const databaseName = `spottr-session-same-set-tabs-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbSessionRepository(databaseName)
    const secondRepository = createIndexedDbSessionRepository(databaseName)
    const firstService = createSessionService(firstRepository, context.workoutService, context.exerciseService, {
      now: () => '2026-09-24T13:15:00.000Z',
    })
    const secondService = createSessionService(secondRepository, context.workoutService, context.exerciseService, {
      now: () => '2026-09-24T13:16:00.000Z',
    })
    const started = await firstService.start(context.template.id)
    const exercise = started.exercises[0]
    const set = exercise.sets[0]

    const outcomes = await Promise.allSettled([
      firstService.logSet(exercise.id, set.id, { weight: 20, reps: 10 }),
      secondService.logSet(exercise.id, set.id, { weight: 30, reps: 6 }),
    ])

    expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'rejected'])
    expect((await firstService.getActive())?.exercises[0].sets[0]).toMatchObject({
      weight: 20,
      reps: 10,
      completedAt: '2026-09-24T13:15:00.000Z',
    })
    await firstRepository.close?.()
    await secondRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })

  it('allows only one active start across IndexedDB service instances', async () => {
    const context = await createTrainingContext()
    const databaseName = `spottr-session-start-tabs-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbSessionRepository(databaseName)
    const secondRepository = createIndexedDbSessionRepository(databaseName)
    const firstService = createSessionService(firstRepository, context.workoutService, context.exerciseService)
    const secondService = createSessionService(secondRepository, context.workoutService, context.exerciseService)

    const outcomes = await Promise.allSettled([
      firstService.start(context.template.id),
      secondService.start(context.template.id),
    ])

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1)
    await firstRepository.close?.()
    await secondRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })
})
