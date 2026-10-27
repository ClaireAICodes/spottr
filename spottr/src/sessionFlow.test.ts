import { expect, test } from 'vitest'
import type { WorkoutSession } from './sessions'
import { reduceSessionFlow } from './sessionFlow'

test('flow_logRetry_preservesOperationAndRejectsStaleOccurrence', () => {
  const confirming = reduceSessionFlow(null, { type: 'RESUME' }, session)!
  const saving = reduceSessionFlow(confirming, { type: 'LOG_REQUEST', ...confirming, requestId: 'operation' }, session)!
  expect(saving).toEqual({ ...confirming, phase: 'saving', requestId: 'operation' })
  expect(reduceSessionFlow(saving, { type: 'LOG_FAILED', ...confirming, requestId: 'other' }, session)).toEqual(saving)
  const failed = reduceSessionFlow(saving, { type: 'LOG_FAILED', ...confirming, requestId: 'operation' }, session)!
  expect(failed).toEqual({ ...confirming, phase: 'error', requestId: 'operation' })
  expect(reduceSessionFlow(failed, { type: 'LOG_REQUEST', ...confirming, requestId: 'new-operation' }, session)).toEqual(failed)
  expect(reduceSessionFlow(saving, { type: 'LOG_OK', ...confirming, occurrenceId: 'second', requestId: 'operation' }, session)).toEqual(saving)
  // A fulfilled request without a durable completedAt must not claim rest/success.
  expect(reduceSessionFlow(saving, { type: 'LOG_OK', ...confirming, requestId: 'operation' }, session)).toEqual(saving)
  const saved = structuredClone(session)
  saved.exercises[0].sets[0].completedAt = '2026-10-26T01:03:00Z'
  saved.restTimer = { startedAt: '2026-10-26T01:03:00Z', endsAt: '2026-10-26T01:04:00Z' }
  expect(reduceSessionFlow(saving, { type: 'LOG_OK', ...confirming, requestId: 'operation' }, saved)).toEqual({ ...confirming, phase: 'rest' })
})

test('flow_logWithoutRest_readiesRemainingSetInsteadOfCompletingOccurrence', () => {
  const source = structuredClone(session)
  source.exercises[0].sets.push({
    id: 'two', kind: 'working', targetWeight: 20, targetReps: 8, weight: 20, reps: 8,
    completedAt: null, skippedAt: null,
  })
  const confirming = reduceSessionFlow(null, { type: 'RESUME' }, source)!
  const saving = reduceSessionFlow(confirming, { type: 'LOG_REQUEST', ...confirming, requestId: 'operation' }, source)!
  const saved = structuredClone(source)
  saved.exercises[0].sets[0].completedAt = '2026-10-26T01:03:00Z'
  const before = structuredClone(saved)
  expect(reduceSessionFlow(saving, { type: 'LOG_OK', ...confirming, requestId: 'operation' }, saved)).toEqual({
    phase: 'ready', sessionId: 'session', occurrenceId: 'first', setId: 'two',
  })
  expect(saved).toEqual(before)
})

test.each([false, true])('flow_logWithoutRest_completesOccurrenceWithNoRemainingWork_skipped=%s', skipped => {
  const source = structuredClone(session)
  if (skipped) source.exercises[0].sets.push({
    id: 'skipped', kind: 'working', targetWeight: 20, targetReps: 8, weight: 20, reps: 8,
    completedAt: null, skippedAt: '2026-10-26T01:02:00Z',
  })
  // Another occurrence may reuse local IDs; it must not prevent this one's completion.
  source.exercises.push({ id: 'second', exerciseId: 'shared', name: 'Repeated', sets: [{
    id: 'local', kind: 'working', targetWeight: 20, targetReps: 8, weight: 20, reps: 8,
    completedAt: null, skippedAt: null,
  }] })
  const confirming = reduceSessionFlow(null, { type: 'RESUME' }, source)!
  const saving = reduceSessionFlow(confirming, { type: 'LOG_REQUEST', ...confirming, requestId: 'operation' }, source)!
  const saved = structuredClone(source)
  saved.exercises[0].sets[0].completedAt = '2026-10-26T01:03:00Z'
  const before = structuredClone(saved)
  expect(reduceSessionFlow(saving, { type: 'LOG_OK', ...confirming, requestId: 'operation' }, saved)).toEqual({
    phase: 'exerciseComplete', sessionId: 'session', occurrenceId: 'first', setId: 'local',
  })
  expect(saved).toEqual(before)
})

export const session: WorkoutSession = {
  id: 'session', templateId: 'template', name: 'Training', gymId: 'gym', gymName: 'Gym',
  startedAt: '2026-10-26T01:00:00Z', updatedAt: '2026-10-26T01:00:00Z',
  exercises: [{ id: 'first', exerciseId: 'shared', name: 'Repeated', sets: [
    { id: 'local', kind: 'working', targetWeight: 20, targetReps: 8, weight: 20, reps: 8,
      completedAt: null, skippedAt: null, timing: { startedAt: '2026-10-26T01:01:00Z', endedAt: '2026-10-26T01:02:00Z' } },
  ] }],
}

test('flow_resume_endedUnloggedSet_opensConfirmationWithoutChangingSavedData', () => {
  const before = structuredClone(session)
  expect(reduceSessionFlow(null, { type: 'RESUME' }, session)).toEqual({
    phase: 'confirming', sessionId: 'session', occurrenceId: 'first', setId: 'local',
  })
  expect(session).toEqual(before)
})
