import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { createIndexedDbWorkoutRepository } from './workoutRepository'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

const draft = { name: 'Original', gymId: 'gym', exercises: [{ exerciseId: 'row', sets: [{ kind: 'working' as const, weight: 20, reps: 8 }] }] }

describe.each(['memory', 'indexeddb'])('conditional template commit (%s)', kind => {
  it.each(['2026-10-26T00:00:00.000Z', '2026-10-25T00:00:00.000Z'])('target acceptance at %s cannot alias an open editor version', async clock => {
    const name = `target-${crypto.randomUUID()}`
    const first = kind === 'memory' ? createMemoryWorkoutRepository() : createIndexedDbWorkoutRepository(name)
    const second = kind === 'memory' ? first : createIndexedDbWorkoutRepository(name)
    const a = createWorkoutService(first, { now: () => '2026-10-26T00:00:00.000Z' })
    const b = createWorkoutService(second, { now: () => clock })
    try {
      const opened = await a.create(draft)
      const entry = opened.exercises[0]
      const accepted = await b.updateSetTarget(opened.id, entry.id, entry.sets[0].id, { weight: 25, reps: 10 })
      expect(accepted.updatedAt).toBe('2026-10-26T00:00:00.001Z')
      await expect(a.update(opened.id, draft, opened.updatedAt)).rejects.toThrow(/changed/)
      expect((await a.get(opened.id))?.exercises[0].sets[0].weight).toBe(25)
    } finally { await first.close?.(); if (second !== first) await second.close?.() }
  })

  it('rejects stale editor intent even after another writer has completed', async () => {
    const name = `conditional-${crypto.randomUUID()}`
    const first = kind === 'memory' ? createMemoryWorkoutRepository() : createIndexedDbWorkoutRepository(name)
    const second = kind === 'memory' ? first : createIndexedDbWorkoutRepository(name)
    const a = createWorkoutService(first, { now: () => '2026-10-26T00:00:00.000Z' })
    const b = createWorkoutService(second, { now: () => '2026-10-26T00:00:01.000Z' })
    try {
      const opened = await a.create(draft)
      await b.update(opened.id, { ...draft, name: 'Newer writer' }, opened.updatedAt)
      await expect(a.update(opened.id, { ...draft, name: 'Stale writer' }, opened.updatedAt)).rejects.toThrow(/changed/)
      expect((await a.get(opened.id))?.name).toBe('Newer writer')
    } finally { await first.close?.(); if (second !== first) await second.close?.() }
  })
})
