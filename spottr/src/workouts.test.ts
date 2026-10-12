import 'fake-indexeddb/auto'
import { createIndexedDbWorkoutRepository } from './workoutRepository'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

const mixedDraft = {
  name: 'Lower strength',
  gymId: 'gym-north',
  exercises: [
    {
      exerciseId: 'squat',
      sets: [
        { kind: 'warm-up' as const, weight: 20, reps: 10 },
        { kind: 'working' as const, weight: 80, reps: 5 },
        { kind: 'drop' as const, weight: 60, reps: 8 },
      ],
    },
    {
      exerciseId: 'row',
      sets: [{ kind: 'working' as const, weight: 45, reps: 10 }],
    },
  ],
}

function sequentialIds() {
  let value = 0
  return () => `id-${++value}`
}

describe('workout template service', () => {
  it('creates a gym-linked template with ordered shared references and independent mixed sets', async () => {
    const service = createWorkoutService(createMemoryWorkoutRepository(), {
      createId: sequentialIds(),
      now: () => '2026-09-23T01:15:00.000Z',
    })

    const created = await service.create(mixedDraft)

    expect(created).toMatchObject({
      id: 'id-1',
      name: 'Lower strength',
      gymId: 'gym-north',
      exercises: [
        {
          id: 'id-2',
          exerciseId: 'squat',
          sets: [
            { id: 'id-3', kind: 'warm-up', weight: 20, reps: 10 },
            { id: 'id-4', kind: 'working', weight: 80, reps: 5 },
            { id: 'id-5', kind: 'drop', weight: 60, reps: 8 },
          ],
        },
        { id: 'id-6', exerciseId: 'row' },
      ],
    })
    expect(created.exercises[0].sets[0]).not.toBe(created.exercises[0].sets[1])
  })

  it('reorders exercises and sets, validates targets, and preserves the shared exercise identity', async () => {
    const service = createWorkoutService(createMemoryWorkoutRepository(), { createId: sequentialIds() })
    const created = await service.create(mixedDraft)
    const squatReference = created.exercises[0]
    const rowReference = created.exercises[1]

    const reordered = await service.update(created.id, {
      name: created.name,
      gymId: created.gymId,
      exercises: [
        rowReference,
        { ...squatReference, sets: [squatReference.sets[2], squatReference.sets[0], squatReference.sets[1]] },
      ],
    })

    expect(reordered.exercises.map(({ exerciseId }) => exerciseId)).toEqual(['row', 'squat'])
    expect(reordered.exercises[1].sets.map(({ kind }) => kind)).toEqual(['drop', 'warm-up', 'working'])
    expect(reordered.exercises[1].exerciseId).toBe('squat')
    await expect(service.update(created.id, {
      ...mixedDraft,
      exercises: [{ exerciseId: 'squat', sets: [{ kind: 'working', weight: -1, reps: 0 }] }],
    })).rejects.toThrow(/weight.*zero|reps.*positive/i)
    await expect(service.update(created.id, {
      ...mixedDraft,
      exercises: [{ exerciseId: 'squat', sets: [{ kind: 'invalid' as 'working', weight: 1, reps: 1 }] }],
    })).rejects.toThrow(/set type/i)
  })

  it('rejects a write when its gym no longer exists', async () => {
    const service = createWorkoutService(createMemoryWorkoutRepository(), {
      gymExists: async () => false,
    })

    await expect(service.create(mixedDraft)).rejects.toThrow(/gym.*not found/i)
    expect(await service.list()).toHaveLength(0)
  })

  it('replaces temporary nested identities with unique domain identities across reload edits', async () => {
    const service = createWorkoutService(createMemoryWorkoutRepository(), { createId: sequentialIds() })
    const created = await service.create({
      name: 'Draft IDs',
      gymId: 'gym',
      exercises: [{
        id: 'draft-1',
        exerciseId: 'squat',
        sets: [{ id: 'draft-2', kind: 'working', weight: 40, reps: 8 }],
      }],
    })

    const updated = await service.update(created.id, {
      name: created.name,
      gymId: created.gymId,
      exercises: [
        created.exercises[0],
        {
          id: 'draft-1',
          exerciseId: 'row',
          sets: [
            { id: 'draft-2', kind: 'working', weight: 30, reps: 10 },
            { id: 'draft-2', kind: 'drop', weight: 20, reps: 12 },
          ],
        },
      ],
    })

    const nestedIds = updated.exercises.flatMap((exercise) => [exercise.id, ...exercise.sets.map(({ id }) => id)])
    expect(nestedIds).not.toContain('draft-1')
    expect(nestedIds).not.toContain('draft-2')
    expect(new Set(nestedIds).size).toBe(nestedIds.length)
    expect(updated.exercises[0].id).toBe(created.exercises[0].id)
    expect(updated.exercises[0].sets[0].id).toBe(created.exercises[0].sets[0].id)
  })

  it('duplicates to the same or another gym with fresh nested identities', async () => {
    const service = createWorkoutService(createMemoryWorkoutRepository(), { createId: sequentialIds() })
    const original = await service.create(mixedDraft)

    const sameGym = await service.duplicate(original.id, original.gymId)
    const crossGym = await service.duplicate(original.id, 'gym-south')

    expect(sameGym).toMatchObject({ name: 'Lower strength copy', gymId: 'gym-north' })
    expect(crossGym).toMatchObject({ name: 'Lower strength copy', gymId: 'gym-south' })
    expect(new Set([original.id, sameGym.id, crossGym.id]).size).toBe(3)
    expect(sameGym.exercises[0].exerciseId).toBe(original.exercises[0].exerciseId)
    expect(sameGym.exercises[0].id).not.toBe(original.exercises[0].id)
    expect(sameGym.exercises[0].sets[0].id).not.toBe(original.exercises[0].sets[0].id)
  })

  it('substitutes a variation identity without mutating the original template or shared reference', async () => {
    const service = createWorkoutService(createMemoryWorkoutRepository(), { createId: sequentialIds() })
    const original = await service.create(mixedDraft)

    const varied = await service.substituteExercise(original.id, original.exercises[0].id, 'pause-squat')

    expect(varied.exercises[0].exerciseId).toBe('pause-squat')
    expect(varied.exercises[0].sets).toEqual(original.exercises[0].sets)
    expect((await service.get(original.id))?.exercises[0].exerciseId).toBe('pause-squat')
    expect(original.exercises[0].exerciseId).toBe('squat')
  })

  it('removes only the template reference and leaves other references intact', async () => {
    const service = createWorkoutService(createMemoryWorkoutRepository(), { createId: sequentialIds() })
    const original = await service.create(mixedDraft)
    const duplicate = await service.duplicate(original.id, 'gym-south')

    const changed = await service.removeExercise(original.id, original.exercises[0].id)

    expect(changed.exercises.map(({ exerciseId }) => exerciseId)).toEqual(['row'])
    expect((await service.get(duplicate.id))?.exercises.map(({ exerciseId }) => exerciseId)).toEqual(['squat', 'row'])
  })

  it('persists and reloads the exact reordered mixed-set targets from IndexedDB', async () => {
    const databaseName = `spottr-workouts-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbWorkoutRepository(databaseName)
    const firstService = createWorkoutService(firstRepository, { createId: sequentialIds() })
    const created = await firstService.create(mixedDraft)
    const squat = created.exercises[0]
    await firstService.update(created.id, {
      name: created.name,
      gymId: created.gymId,
      exercises: [
        created.exercises[1],
        { ...squat, sets: [squat.sets[2], squat.sets[0], squat.sets[1]] },
      ],
    })
    await firstRepository.close?.()

    const reloadedRepository = createIndexedDbWorkoutRepository(databaseName)
    const restored = await createWorkoutService(reloadedRepository).get(created.id)

    expect(restored?.exercises.map(({ exerciseId }) => exerciseId)).toEqual(['row', 'squat'])
    expect(restored?.exercises[1].sets.map(({ kind, weight, reps }) => ({ kind, weight, reps }))).toEqual([
      { kind: 'drop', weight: 60, reps: 8 },
      { kind: 'warm-up', weight: 20, reps: 10 },
      { kind: 'working', weight: 80, reps: 5 },
    ])
    await reloadedRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })
})
