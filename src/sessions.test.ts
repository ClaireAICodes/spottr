import 'fake-indexeddb/auto'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createIndexedDbSessionRepository } from './sessionRepository'
import { createMemorySessionRepository, createSessionService, type WorkoutSession } from './sessions'
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
  return { gym, gymService, exerciseService, workoutService, template }
}

describe('active workout session service', () => {
  it('detects weight and set-volume PRs from completed history while excluding skipped sets', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    const timestamps = [
      '2026-09-23T01:00:00.000Z',
      '2026-09-23T01:10:00.000Z',
      '2026-09-23T02:00:00.000Z',
      '2026-09-24T01:00:00.000Z',
      '2026-09-24T01:10:00.000Z',
      '2026-09-24T01:20:00.000Z',
    ]
    const service = createSessionService(repository, context.workoutService, context.exerciseService, {
      now: () => timestamps.shift()!,
    })
    const seeded = await service.start(context.template.id, context.gym.name)
    await service.logSet(seeded.exercises[0].id, seeded.exercises[0].sets[1].id, { weight: 80, reps: 8 })
    await service.complete()
    await context.workoutService.update(context.template.id, {
      name: context.template.name,
      gymId: context.template.gymId,
      exercises: [{
        ...context.template.exercises[0],
        sets: [
          { ...context.template.exercises[0].sets[0], weight: 85, reps: 5 },
          { ...context.template.exercises[0].sets[1], weight: 80, reps: 10 },
        ],
      }],
    })

    const current = await service.start(context.template.id, context.gym.name)
    const weightRecord = await service.logSet(current.exercises[0].id, current.exercises[0].sets[0].id, { weight: 85, reps: 5 })
    const volumeRecord = await service.logSet(current.exercises[0].id, current.exercises[0].sets[1].id, { weight: 80, reps: 10 })

    expect(weightRecord.exercises[0].sets[0].personalRecords).toEqual(['weight'])
    expect(volumeRecord.exercises[0].sets[1].personalRecords).toEqual(['set-volume'])
  })

  it('persists accepted and declined future-target decisions and applies only accepted targets on the next load', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    const service = createSessionService(repository, context.workoutService, context.exerciseService, {
      now: () => '2026-09-24T13:15:00.000Z',
    })
    const first = await service.start(context.template.id, context.gym.name)
    await service.logSet(first.exercises[0].id, first.exercises[0].sets[0].id, { weight: 25, reps: 9 })
    const firstCompleted = await service.complete()

    const accepted = await service.decideFutureTarget(firstCompleted.id, first.exercises[0].id, first.exercises[0].sets[0].id, 'accept')
    expect(accepted.exercises[0].sets[0].targetDecision).toBe('accepted')
    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0]).toMatchObject({ weight: 25, reps: 9 })

    const next = await service.start(context.template.id, context.gym.name)
    expect(next.exercises[0].sets[0]).toMatchObject({ targetWeight: 25, targetReps: 9 })
    await service.logSet(next.exercises[0].id, next.exercises[0].sets[0].id, { weight: 27.5, reps: 8 })
    const nextCompleted = await service.complete()
    const declined = await service.decideFutureTarget(nextCompleted.id, next.exercises[0].id, next.exercises[0].sets[0].id, 'decline')

    expect(declined.exercises[0].sets[0].targetDecision).toBe('declined')
    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0]).toMatchObject({ weight: 25, reps: 9 })
    const reloadedService = createSessionService(repository, context.workoutService, context.exerciseService)
    expect((await reloadedService.getHistory(nextCompleted.id))?.exercises[0].sets[0].targetDecision).toBe('declined')
  })

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

  it('preserves the gym name when completing a baseline-format active session', async () => {
    const context = await createTrainingContext()
    const seedService = createSessionService(createMemorySessionRepository(), context.workoutService, context.exerciseService, {
      now: () => '2026-09-24T13:15:00.000Z',
    })
    const started = await seedService.start(context.template.id)
    const { gymName: _legacyMissingGymName, ...legacySession } = started
    const repository = createMemorySessionRepository(legacySession as WorkoutSession)
    const service = createSessionService(repository, context.workoutService, context.exerciseService, {
      now: () => '2026-09-24T14:15:00.000Z',
      resolveGymName: async (gymId) => (await context.gymService.get(gymId))?.name ?? null,
    })

    const completed = await service.complete()

    expect(completed.gymName).toBe('North Gym')
  })

  it('rejects delayed legacy completion when another caller replaces the active session', async () => {
    const context = await createTrainingContext()
    const seedService = createSessionService(createMemorySessionRepository(), context.workoutService, context.exerciseService, {
      createId: () => 'original-session',
      now: () => '2026-09-24T13:15:00.000Z',
    })
    const started = await seedService.start(context.template.id)
    const { gymName: _legacyMissingGymName, ...legacySession } = started
    const databaseName = `spottr-session-completion-race-${crypto.randomUUID()}`
    const delayedRepository = createIndexedDbSessionRepository(databaseName)
    const competingRepository = createIndexedDbSessionRepository(databaseName)
    await delayedRepository.createActive(legacySession as WorkoutSession)
    let confirmGymLookupStarted!: () => void
    const gymLookupStarted = new Promise<void>((resolve) => {
      confirmGymLookupStarted = resolve
    })
    let resumeGymLookup!: (gymName: string | null) => void
    const delayedGymName = new Promise<string | null>((resolve) => {
      resumeGymLookup = resolve
    })
    const delayedService = createSessionService(delayedRepository, context.workoutService, context.exerciseService, {
      now: () => '2026-09-24T14:15:00.000Z',
      resolveGymName: () => {
        confirmGymLookupStarted()
        return delayedGymName
      },
    })
    const competingService = createSessionService(competingRepository, context.workoutService, context.exerciseService, {
      createId: () => 'replacement-session',
      now: () => '2026-09-24T14:16:00.000Z',
    })

    const delayedCompletion = delayedService.complete()
    await gymLookupStarted
    await competingService.complete()
    const replacement = await competingService.start(context.template.id, context.gym.name)
    resumeGymLookup(context.gym.name)

    await expect(delayedCompletion).rejects.toThrow('Active session changed before completion')
    expect(await competingService.getActive()).toEqual(replacement)
    await delayedRepository.close?.()
    await competingRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
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

  it('filters malformed IndexedDB values out of completed history', async () => {
    const databaseName = `spottr-history-guard-${crypto.randomUUID()}`
    const repository = createIndexedDbSessionRepository(databaseName)
    await repository.getActive()
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite')
      transaction.objectStore('sessions').put({
        id: 'malformed-session',
        templateId: 'workout-1',
        name: 'Lower Strength',
        gymId: 'gym-1',
        gymName: 'North Gym',
        exercises: [{
          id: 'session-exercise-1',
          templateExerciseId: 'template-exercise-1',
          exerciseId: 'exercise-1',
          name: 'Back Squat',
          sets: [{
            id: 'session-set-1',
            templateSetId: 'template-set-1',
            kind: 'working',
            targetWeight: 20,
            targetReps: 10,
            weight: 25,
            reps: 'nine',
            completedAt: '2026-09-25T01:30:00.000Z',
            skippedAt: null,
          }],
        }],
        startedAt: '2026-09-25T01:00:00.000Z',
        updatedAt: '2026-09-25T02:00:00.000Z',
        endedAt: '2026-09-25T02:00:00.000Z',
        summary: {
          completedExercises: 1,
          skippedExercises: 0,
          completedSets: 1,
          skippedSets: 0,
          volume: 225,
          durationSeconds: 3600,
        },
      }, 'history:malformed')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })

    expect(await repository.listHistory()).toEqual([])
    database.close()
    await repository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })

  it('persists a declined future-target decision across an IndexedDB reopen', async () => {
    const context = await createTrainingContext()
    const databaseName = `spottr-target-decision-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbSessionRepository(databaseName)
    const service = createSessionService(firstRepository, context.workoutService, context.exerciseService, {
      now: () => '2026-09-24T13:15:00.000Z',
    })
    const active = await service.start(context.template.id, context.gym.name)
    await service.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 25, reps: 9 })
    const completed = await service.complete()
    await service.decideFutureTarget(completed.id, active.exercises[0].id, active.exercises[0].sets[0].id, 'decline')
    await firstRepository.close?.()

    const reopenedRepository = createIndexedDbSessionRepository(databaseName)
    const restored = await createSessionService(reopenedRepository, context.workoutService, context.exerciseService).getHistory(completed.id)
    expect(restored?.exercises[0].sets[0].targetDecision).toBe('declined')
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

  it('compares a later set with completed sets in the active session for PRs', async () => {
    const context = await createTrainingContext()
    const service = createSessionService(createMemorySessionRepository(), context.workoutService, context.exerciseService)
    const started = await service.start(context.template.id)
    const exercise = started.exercises[0]

    const first = await service.logSet(exercise.id, exercise.sets[0].id, { weight: 100, reps: 10 })
    const second = await service.logSet(exercise.id, exercise.sets[1].id, { weight: 90, reps: 10 })

    expect(first.exercises[0].sets[0].personalRecords).toEqual(['weight', 'set-volume'])
    expect(second.exercises[0].sets[1].personalRecords).toEqual([])
  })

  it('serializes PR comparison across service instances', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    const firstService = createSessionService(repository, context.workoutService, context.exerciseService)
    const secondService = createSessionService(repository, context.workoutService, context.exerciseService)
    const started = await firstService.start(context.template.id)
    const exercise = started.exercises[0]

    const [first, second] = await Promise.all([
      firstService.logSet(exercise.id, exercise.sets[0].id, { weight: 100, reps: 10 }),
      secondService.logSet(exercise.id, exercise.sets[1].id, { weight: 90, reps: 10 }),
    ])

    expect(first.exercises[0].sets[0].personalRecords).toEqual(['weight', 'set-volume'])
    expect(second.exercises[0].sets[1].personalRecords).toEqual([])
  })

  it('does not expose mutable personal-record arrays from repository clones', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    const service = createSessionService(repository, context.workoutService, context.exerciseService)
    const started = await service.start(context.template.id)
    const logged = await service.logSet(started.exercises[0].id, started.exercises[0].sets[0].id, { weight: 100, reps: 10 })

    logged.exercises[0].sets[0].personalRecords?.splice(0)

    expect((await repository.getActive())?.exercises[0].sets[0].personalRecords).toEqual(['weight', 'set-volume'])
  })

  it('serializes duplicate future-target decisions across service instances', async () => {
    const context = await createTrainingContext()
    const repository = createMemorySessionRepository()
    const seedService = createSessionService(repository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    await seedService.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    let targetUpdates = 0
    const workoutService = {
      ...context.workoutService,
      async updateSetTarget(...args: Parameters<typeof context.workoutService.updateSetTarget>) {
        targetUpdates += 1
        await Promise.resolve()
        return context.workoutService.updateSetTarget(...args)
      },
    }
    const firstService = createSessionService(repository, workoutService, context.exerciseService)
    const secondService = createSessionService(repository, workoutService, context.exerciseService)

    const decisions = await Promise.all([
      firstService.decideFutureTarget(completed.id, active.exercises[0].id, active.exercises[0].sets[0].id, 'accept'),
      secondService.decideFutureTarget(completed.id, active.exercises[0].id, active.exercises[0].sets[0].id, 'accept'),
    ])

    expect(targetUpdates).toBe(1)
    expect(decisions.every((session) => session.exercises[0].sets[0].targetDecision === 'accepted')).toBe(true)
  })

  it('recovers a durable pending acceptance left by an interruption', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    await seedService.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    await baseRepository.updateHistory(completed.id, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === active.exercises[0].id
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => set.id === active.exercises[0].sets[0].id
              ? { ...set, targetDecision: 'accepting' }
              : set),
          }
        : exercise),
    }))
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBe('accepting')

    const recoveredService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const next = await recoveredService.start(context.template.id)
    expect(next.exercises[0].sets[0]).toMatchObject({ targetWeight: 25, targetReps: 9 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBe('accepted')
  })

  it('restores the prior target when acceptance recovery cannot finalize history', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    const sessionSet = active.exercises[0].sets[0]
    await seedService.logSet(active.exercises[0].id, sessionSet.id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    await baseRepository.updateHistory(completed.id, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === active.exercises[0].id
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => set.id === sessionSet.id
              ? {
                  ...set,
                  targetDecision: 'accepting' as const,
                  targetDecisionPreviousTarget: { weight: 20, reps: 10 },
                }
              : set),
          }
        : exercise),
    }))
    const failingRepository = {
      ...baseRepository,
      async updateHistory() {
        throw new Error('recovery finalization failed')
      },
    }

    await expect(createSessionService(failingRepository, context.workoutService, context.exerciseService)
      .start(context.template.id)).rejects.toThrow('recovery finalization failed')

    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0])
      .toMatchObject({ weight: 20, reps: 10 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0])
      .toMatchObject({
        targetDecision: 'accepting',
        targetDecisionPreviousTarget: { weight: 20, reps: 10 },
      })
  })

  it('preserves an interrupted acceptance when retry finalization fails so it can still be declined', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    const sessionSet = active.exercises[0].sets[0]
    await seedService.logSet(active.exercises[0].id, sessionSet.id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    await baseRepository.updateHistory(completed.id, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === active.exercises[0].id
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => set.id === sessionSet.id
              ? {
                  ...set,
                  targetDecision: 'accepting' as const,
                  targetDecisionPreviousTarget: { weight: 20, reps: 10 },
                }
              : set),
          }
        : exercise),
    }))
    await context.workoutService.updateSetTarget(
      context.template.id,
      context.template.exercises[0].id,
      context.template.exercises[0].sets[0].id,
      { weight: 25, reps: 9 },
    )
    let failFinalization = true
    const failingRepository = {
      ...baseRepository,
      async updateHistory(...args: Parameters<typeof baseRepository.updateHistory>) {
        if (failFinalization) {
          failFinalization = false
          throw new Error('history finalization failed')
        }
        return baseRepository.updateHistory(...args)
      },
    }
    const retryService = createSessionService(failingRepository, context.workoutService, context.exerciseService)

    await expect(retryService.decideFutureTarget(
      completed.id,
      active.exercises[0].id,
      sessionSet.id,
      'accept',
    )).rejects.toThrow('history finalization failed')

    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0])
      .toMatchObject({ weight: 20, reps: 10 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBe('accepting')

    const declineService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const declined = await declineService.decideFutureTarget(
      completed.id,
      active.exercises[0].id,
      sessionSet.id,
      'decline',
    )

    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0])
      .toMatchObject({ weight: 20, reps: 10 })
    expect(declined.exercises[0].sets[0].targetDecision).toBe('declined')
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBe('declined')
  })

  it('recovers a failed decline without converting it back into acceptance', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    const sessionSet = active.exercises[0].sets[0]
    await seedService.logSet(active.exercises[0].id, sessionSet.id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    await baseRepository.updateHistory(completed.id, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === active.exercises[0].id
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => set.id === sessionSet.id
              ? {
                  ...set,
                  targetDecision: 'accepting' as const,
                  targetDecisionPreviousTarget: { weight: 20, reps: 10 },
                }
              : set),
          }
        : exercise),
    }))
    await context.workoutService.updateSetTarget(
      context.template.id,
      context.template.exercises[0].id,
      context.template.exercises[0].sets[0].id,
      { weight: 25, reps: 9 },
    )
    let failDeclineFinalization = true
    const failingRepository = {
      ...baseRepository,
      async updateHistory(...args: Parameters<typeof baseRepository.updateHistory>) {
        const current = await baseRepository.getHistory(args[0])
        const updated = current ? args[1](current) : null
        const decision = updated?.exercises[0].sets[0].targetDecision
        if (failDeclineFinalization && decision === 'declined') {
          failDeclineFinalization = false
          throw new Error('decline finalization failed')
        }
        return baseRepository.updateHistory(...args)
      },
    }
    const service = createSessionService(failingRepository, context.workoutService, context.exerciseService)

    await expect(service.decideFutureTarget(
      completed.id,
      active.exercises[0].id,
      sessionSet.id,
      'decline',
    )).rejects.toThrow('decline finalization failed')

    const recoveredService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const next = await recoveredService.start(context.template.id)
    expect(next.exercises[0].sets[0]).toMatchObject({ targetWeight: 20, targetReps: 10 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBe('declined')
  })

  it('preserves decline intent when the first decline marker write fails', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    const sessionSet = active.exercises[0].sets[0]
    await seedService.logSet(active.exercises[0].id, sessionSet.id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    await baseRepository.updateHistory(completed.id, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === active.exercises[0].id
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => set.id === sessionSet.id
              ? {
                  ...set,
                  targetDecision: 'accepting' as const,
                  targetDecisionPreviousTarget: { weight: 20, reps: 10 },
                }
              : set),
          }
        : exercise),
    }))
    await context.workoutService.updateSetTarget(
      context.template.id,
      context.template.exercises[0].id,
      context.template.exercises[0].sets[0].id,
      { weight: 25, reps: 9 },
    )
    let failFirstDeclineMarker = true
    const failingRepository = {
      ...baseRepository,
      async updateHistory(...args: Parameters<typeof baseRepository.updateHistory>) {
        const current = await baseRepository.getHistory(args[0])
        const updated = current ? args[1](current) : null
        const decision = updated?.exercises[0].sets[0].targetDecision
        if (failFirstDeclineMarker && decision === 'declining') {
          failFirstDeclineMarker = false
          throw new Error('decline marker write failed')
        }
        return baseRepository.updateHistory(...args)
      },
    }

    await expect(createSessionService(failingRepository, context.workoutService, context.exerciseService)
      .decideFutureTarget(completed.id, active.exercises[0].id, sessionSet.id, 'decline'))
      .rejects.toThrow('decline marker write failed')

    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0])
      .toMatchObject({ weight: 20, reps: 10 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision)
      .toBe('declining')

    const next = await createSessionService(baseRepository, context.workoutService, context.exerciseService)
      .start(context.template.id)
    expect(next.exercises[0].sets[0]).toMatchObject({ targetWeight: 20, targetReps: 10 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision)
      .toBe('declined')
  })

  it('declines an interrupted acceptance to the exact target captured before acceptance', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    const sessionSet = active.exercises[0].sets[0]
    await seedService.logSet(active.exercises[0].id, sessionSet.id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    await context.workoutService.updateSetTarget(
      context.template.id,
      context.template.exercises[0].id,
      context.template.exercises[0].sets[0].id,
      { weight: 22.5, reps: 8 },
    )
    let historyWrites = 0
    const interruptedRepository = {
      ...baseRepository,
      async updateHistory(...args: Parameters<typeof baseRepository.updateHistory>) {
        historyWrites += 1
        if (historyWrites > 1) throw new Error('history storage unavailable')
        return baseRepository.updateHistory(...args)
      },
    }

    await expect(createSessionService(interruptedRepository, context.workoutService, context.exerciseService)
      .decideFutureTarget(completed.id, active.exercises[0].id, sessionSet.id, 'accept'))
      .rejects.toThrow('Future target acceptance failed and could not be fully rolled back')

    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0])
      .toMatchObject({
        targetDecision: 'accepting',
        targetDecisionPreviousTarget: { weight: 22.5, reps: 8 },
      })

    const declined = await createSessionService(baseRepository, context.workoutService, context.exerciseService)
      .decideFutureTarget(completed.id, active.exercises[0].id, sessionSet.id, 'decline')

    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0])
      .toMatchObject({ weight: 22.5, reps: 8 })
    expect(declined.exercises[0].sets[0].targetDecision).toBe('declined')
  })

  it('reverts the template target when accept fails during history finalization and user then declines', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    await seedService.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()

    // First, verify the original template target
    const originalTemplate = await context.workoutService.get(context.template.id)
    expect(originalTemplate?.exercises[0].sets[0]).toMatchObject({ weight: 20, reps: 10 })

    // Make accept fail at the final history update (after template was already updated)
    let historyWrites = 0
    const failingRepository = {
      ...baseRepository,
      async updateHistory(...args: Parameters<typeof baseRepository.updateHistory>) {
        historyWrites += 1
        // Fail on the SECOND updateHistory call (the one that finalizes to 'accepted')
        // The first call marks 'accepting', the second should finalize to 'accepted'
        if (historyWrites === 2) throw new Error('history finalization failed')
        return baseRepository.updateHistory(...args)
      },
    }
    const service = createSessionService(failingRepository, context.workoutService, context.exerciseService)

    // Accept should fail
    await expect(service.decideFutureTarget(completed.id, active.exercises[0].id, active.exercises[0].sets[0].id, 'accept')).rejects.toThrow('history finalization failed')

    // A failed finalization must compensate the template write before returning.
    const templateAfterFailedAccept = await context.workoutService.get(context.template.id)
    expect(templateAfterFailedAccept?.exercises[0].sets[0]).toMatchObject({ weight: 20, reps: 10 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBeUndefined()

    // Now user declines - this should revert the template to original
    const declineService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const declined = await declineService.decideFutureTarget(completed.id, active.exercises[0].id, active.exercises[0].sets[0].id, 'decline')

    // History should be 'declined'
    expect(declined.exercises[0].sets[0].targetDecision).toBe('declined')

    const templateAfterDecline = await context.workoutService.get(context.template.id)
    expect(templateAfterDecline?.exercises[0].sets[0]).toMatchObject({ weight: 20, reps: 10 })
  })

  it('restores the template target present immediately before a failed acceptance', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    await seedService.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    await context.workoutService.updateSetTarget(
      context.template.id,
      context.template.exercises[0].id,
      context.template.exercises[0].sets[0].id,
      { weight: 22.5, reps: 8 },
    )
    let historyWrites = 0
    const failingRepository = {
      ...baseRepository,
      async updateHistory(...args: Parameters<typeof baseRepository.updateHistory>) {
        historyWrites += 1
        if (historyWrites === 2) throw new Error('history finalization failed')
        return baseRepository.updateHistory(...args)
      },
    }
    const service = createSessionService(failingRepository, context.workoutService, context.exerciseService)

    await expect(service.decideFutureTarget(
      completed.id,
      active.exercises[0].id,
      active.exercises[0].sets[0].id,
      'accept',
    )).rejects.toThrow('history finalization failed')

    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0])
      .toMatchObject({ weight: 22.5, reps: 8 })
    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBeUndefined()
  })

  it('keeps rollback state durable when a failed acceptance cannot restore the template', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    const sessionSet = active.exercises[0].sets[0]
    await seedService.logSet(active.exercises[0].id, sessionSet.id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()
    let historyWrites = 0
    const failingRepository = {
      ...baseRepository,
      async updateHistory(...args: Parameters<typeof baseRepository.updateHistory>) {
        historyWrites += 1
        if (historyWrites === 2) throw new Error('history finalization failed')
        return baseRepository.updateHistory(...args)
      },
    }
    let targetUpdates = 0
    const failingWorkoutService = {
      ...context.workoutService,
      async updateSetTarget(...args: Parameters<typeof context.workoutService.updateSetTarget>) {
        targetUpdates += 1
        if (targetUpdates === 2) throw new Error('template rollback failed')
        return context.workoutService.updateSetTarget(...args)
      },
    }

    await expect(createSessionService(failingRepository, failingWorkoutService, context.exerciseService)
      .decideFutureTarget(completed.id, active.exercises[0].id, sessionSet.id, 'accept'))
      .rejects.toThrow('Future target acceptance failed and could not be fully rolled back')

    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0])
      .toMatchObject({
        targetDecision: 'accepting',
        targetDecisionPreviousTarget: { weight: 20, reps: 10 },
      })
    const declined = await createSessionService(baseRepository, context.workoutService, context.exerciseService)
      .decideFutureTarget(completed.id, active.exercises[0].id, sessionSet.id, 'decline')
    expect((await context.workoutService.get(context.template.id))?.exercises[0].sets[0])
      .toMatchObject({ weight: 20, reps: 10 })
    expect(declined.exercises[0].sets[0].targetDecision).toBe('declined')
  })

  it('clears the pending acceptance when the template update fails', async () => {
    const context = await createTrainingContext()
    const baseRepository = createMemorySessionRepository()
    const seedService = createSessionService(baseRepository, context.workoutService, context.exerciseService)
    const active = await seedService.start(context.template.id)
    await seedService.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 25, reps: 9 })
    const completed = await seedService.complete()

    // Make the template update fail (simulating a failure before history finalization)
    let targetUpdates = 0
    const failingWorkoutService = {
      ...context.workoutService,
      async updateSetTarget(...args: Parameters<typeof context.workoutService.updateSetTarget>) {
        targetUpdates += 1
        if (targetUpdates === 1) throw new Error('template update failed')
        return context.workoutService.updateSetTarget(...args)
      },
    }
    const service = createSessionService(baseRepository, failingWorkoutService, context.exerciseService)

    // Accept should fail at template update
    await expect(service.decideFutureTarget(completed.id, active.exercises[0].id, active.exercises[0].sets[0].id, 'accept')).rejects.toThrow('template update failed')

    // Template should NOT be mutated
    const templateAfterFailedAccept = await context.workoutService.get(context.template.id)
    expect(templateAfterFailedAccept?.exercises[0].sets[0]).toMatchObject({ weight: 20, reps: 10 })

    expect((await baseRepository.getHistory(completed.id))?.exercises[0].sets[0].targetDecision).toBeUndefined()
  })
})
