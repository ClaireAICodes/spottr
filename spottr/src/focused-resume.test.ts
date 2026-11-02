import { expect, test } from 'vitest'
import { reduceSessionFlow } from './sessionFlow'
import type { WorkoutSession } from './sessions'

test('resume prioritizes unlogged timing over legacy rest and otherwise restores rest with next identity', () => {
  const session: WorkoutSession = { id: 's', templateId: 't', gymId: 'g', gymName: 'Gym', name: 'Workout', startedAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', restTimer: { startedAt: '2026-11-02T00:00:00Z', endsAt: '2026-11-02T00:01:00Z' }, exercises: [{ id: 'occurrence', exerciseId: 'e', name: 'Row', sets: [{ id: 'next', kind: 'working', targetWeight: 40, targetReps: 8, weight: 40, reps: 8, completedAt: null, skippedAt: null }] }] }
  expect(reduceSessionFlow(null, { type: 'RESUME' }, session)).toEqual({ phase: 'rest', sessionId: 's', occurrenceId: 'occurrence', setId: 'next' })
  session.exercises[0].sets[0].timing = { startedAt: '2026-11-02T00:00:10Z' }
  expect(reduceSessionFlow(null, { type: 'RESUME' }, session)?.phase).toBe('performing')
  session.exercises[0].sets[0].timing!.endedAt = '2026-11-02T00:00:20Z'
  expect(reduceSessionFlow(null, { type: 'RESUME' }, session)?.phase).toBe('confirming')
})
