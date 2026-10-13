import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { createMemorySessionRepository, createSessionService, elapsedSetSeconds } from './sessions'

async function context() {
  const exercises = createExerciseService(createMemoryExerciseRepository())
  const exercise = await exercises.create({ name: 'Row', muscleGroup: 'Back', equipment: 'Cable', notes: '' })
  const workouts = createWorkoutService(createMemoryWorkoutRepository())
  const template = await workouts.create({ name: 'Timing', gymId: 'gym', exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 40, reps: 8 }, { kind: 'working', weight: 40, reps: 8 }] }] })
  const repository = createMemorySessionRepository()
  let clock = '2026-10-13T08:00:00.000Z'
  const service = createSessionService(repository, workouts, exercises, { now: () => clock })
  const session = await service.start(template.id)
  const occurrence = session.exercises[0]
  const set = occurrence.sets[0]
  return { service, repository, workouts, exercises, template, session, occurrence, set, tick: (value: string) => { clock = value } }
}

describe('optional selected set timing', () => {
  it('persists chosen targets through reload, completion and editable durable log without template mutation', async () => {
    const c = await context()
    await c.service.startSet(c.session.id, c.occurrence.id, c.set.id, { weight: 42.5, reps: 9 })
    c.tick('2026-10-13T08:00:12.000Z')
    const reload = createSessionService(c.repository, c.workouts, c.exercises)
    const active = await reload.getActive()
    expect(active?.exercises[0].sets[0]).toMatchObject({ targetWeight: 40, weight: 42.5, reps: 9, completedAt: null, timing: { startedAt: c.session.startedAt } })
    expect(elapsedSetSeconds(c.session.startedAt, Date.parse('2026-10-13T08:00:12.000Z'))).toBe(12)
    expect(elapsedSetSeconds(c.session.startedAt, Date.parse('2026-10-13T07:59:00.000Z'))).toBe(0)
    const completed = await c.service.completeTimedSet(c.session.id, c.occurrence.id, c.set.id)
    expect(completed.exercises[0].sets[0]).toMatchObject({ completedAt: null, timing: { durationSeconds: 12 } })
    const logged = await c.service.logSet(c.occurrence.id, c.set.id, { weight: 43, reps: 7 }, undefined, c.session.id)
    expect(logged.exercises[0].sets[0]).toMatchObject({ weight: 43, reps: 7, completedAt: '2026-10-13T08:00:12.000Z', timing: { durationSeconds: 12 } })
    expect(await c.workouts.get(c.template.id)).toEqual(c.template)
  })

  it('guards identity, single running set, awaiting actuals and completed/skipped state', async () => {
    const c = await context()
    await expect(c.service.startSet('stale', c.occurrence.id, c.set.id, { weight: 42.5, reps: 8 })).rejects.toThrow()
    await expect(c.service.startSet(c.session.id, 'missing', c.set.id, { weight: 42.5, reps: 8 })).rejects.toThrow()
    await c.service.startSet(c.session.id, c.occurrence.id, c.set.id, { weight: 42.5, reps: 8 })
    await expect(c.service.startSet(c.session.id, c.occurrence.id, c.occurrence.sets[1].id, { weight: 40, reps: 8 })).rejects.toThrow()
    await expect(c.service.logSet(c.occurrence.id, c.set.id, { weight: 40, reps: 8 })).rejects.toThrow()
    await c.service.skipSet(c.occurrence.id, c.set.id)
    expect((await c.service.getActive())?.exercises[0].sets[0].timing).toBeUndefined()
    await expect(c.service.completeTimedSet(c.session.id, c.occurrence.id, c.set.id)).rejects.toThrow()
    await c.service.logSet(c.occurrence.id, c.occurrence.sets[1].id, { weight: 40, reps: 8 })
    await expect(c.service.startSet(c.session.id, c.occurrence.id, c.occurrence.sets[1].id, { weight: 40, reps: 8 })).rejects.toThrow()
  })

  it('keeps untimed logging compatible and retries failed timing writes without partial changes', async () => {
    const c = await context()
    const update = c.repository.updateActive.bind(c.repository)
    c.repository.updateActive = async () => { throw new Error('Storage unavailable') }
    await expect(c.service.startSet(c.session.id, c.occurrence.id, c.set.id, { weight: 42.5, reps: 8 })).rejects.toThrow('Storage unavailable')
    expect(await c.service.getActive()).toEqual(c.session)
    c.repository.updateActive = update
    await c.service.startSet(c.session.id, c.occurrence.id, c.set.id, { weight: 42.5, reps: 8 })
    await c.service.changeExerciseAvailability(c.occurrence.id, true)
    expect((await c.service.getActive())?.exercises[0].sets.every(set => !set.timing)).toBe(true)
    await c.service.returnSet(c.occurrence.id, c.set.id)
    const logged = await c.service.logSet(c.occurrence.id, c.set.id, { weight: 40, reps: 8 })
    expect(logged.exercises[0].sets[0].timing).toBeUndefined()
  })

  it('rejects a replaced session with identical local IDs and preserves a running set on clock failure', async () => {
    const c = await context()
    await c.service.startSet(c.session.id, c.occurrence.id, c.set.id, { weight: 42.5, reps: 8 })
    const saved = await c.service.getActive()
    c.tick('2026-10-13T07:59:59.000Z')
    await expect(c.service.completeTimedSet(c.session.id, c.occurrence.id, c.set.id)).rejects.toThrow('Clock precedes')
    expect(await c.service.getActive()).toEqual(saved)
    await c.repository.replaceAll({ ...saved!, id: 'replacement' }, [])
    const replacement = await c.service.getActive()
    await expect(c.service.completeTimedSet(c.session.id, c.occurrence.id, c.set.id)).rejects.toThrow('Active session changed')
    await expect(c.service.logSet(c.occurrence.id, c.set.id, { weight: 43, reps: 8 }, undefined, c.session.id)).rejects.toThrow('Active session changed')
    await expect(c.service.skipSet(c.occurrence.id, c.set.id, c.session.id)).rejects.toThrow('Active session changed')
    await expect(c.service.changeExerciseAvailability(c.occurrence.id, true, c.session.id)).rejects.toThrow('Active session changed')
    expect(await c.service.getActive()).toEqual(replacement)
  })
})
