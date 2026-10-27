import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { createWorkoutDraftOwner, type WorkoutDraftRecord } from './workoutDrafts'
import { createIndexedDbDraftRepository } from './draftRepository'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'

export const draft = (editorIntentId = 'original'): WorkoutDraftRecord => ({ schema: 1, id: 'authoring', editorIntentId, templateId: 'same-template', baseUpdatedAt: null, revision: 1, updatedAt: '2026-10-26T00:00:00Z', datasetGeneration: '0', value: { name: 'Same content', gymId: 'gym', exercises: [] }, numericBuffers: {}, returnContext: { kind: 'workouts' } })
it('held Save cannot clean a reopened same-template equal-revision intent and exposes busy', async () => {
  const repo = createIndexedDbDraftRepository(`intent-${crypto.randomUUID()}`)
  const owner = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  const gyms = createGymService(createMemoryGymRepository())
  const gym = await gyms.create({ name: 'Gym', address: '' })
  const exercises = createExerciseService(createMemoryExerciseRepository())
  const exercise = await exercises.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })
  const service = createWorkoutService(createMemoryWorkoutRepository())
  const value = { name: 'Same content', gymId: gym.id, exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working' as const, weight: 20, reps: 8 }] }] }
  const template = await service.create(value)
  owner.edit({ ...draft(), templateId: template.id, template, baseUpdatedAt: template.updatedAt, value })
  await owner.flushDraft('authoring')
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const update = service.update
  service.update = async (...args) => { await held; return update(...args) }
  const pending = owner.saveWorkout(service)
  expect(owner.getBusy()).toBe(true)
  expect(await owner.removeCommitted('authoring', 1, 'original')).toBe(true)
  owner.edit({ ...draft('reopened'), templateId: template.id, template, baseUpdatedAt: template.updatedAt, value })
  await owner.flushDraft('authoring')
  release()
  await pending
  expect(owner.getSnapshot()?.editorIntentId).toBe('reopened')
  expect((await repo.read('authoring'))?.editorIntentId).toBe('reopened')
  expect(await repo.remove('authoring', 1, 'original')).toBe(false)
  await owner.removeCommitted('authoring', 1, 'reopened')
  await repo.close()
})

it('retries only the original library operation and preserves unresolved receipts across distinct identical intents', async () => {
  const repo = createIndexedDbDraftRepository(`library-intent-${crypto.randomUUID()}`)
  const owner = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  const service = createExerciseService(createMemoryExerciseRepository())
  const content = { name: 'Identical row', muscleGroup: '', equipment: '', notes: '' }
  let calls = 0
  const create = async () => { calls++; return service.create(content) }
  const apply = (current: WorkoutDraftRecord, created: { id: string }) => ({ value: { ...current.value, name: created.id } })
  owner.edit(draft())
  await expect(owner.createLibraryEntry('nested', create, () => { throw new Error('Refresh failed after commit') })).rejects.toThrow('Refresh failed')
  const committed = (await service.search())[0].id
  expect(calls).toBe(1)
  const retry = await owner.createLibraryEntry('nested', create, apply)
  expect(retry?.created.id).toBe(committed)
  expect(calls).toBe(1)
  await owner.flushDraft('authoring')
  await owner.removeCommitted('authoring', 2, 'original')
  owner.edit(draft('second'))
  await expect(owner.createLibraryEntry('nested', create, () => { throw new Error('Refresh failed') })).rejects.toThrow()
  await owner.flushDraft('authoring')
  await owner.removeCommitted('authoring', 1, 'second')
  owner.edit(draft('third'))
  const distinct = await owner.createLibraryEntry('nested', create, apply)
  expect(calls).toBe(3)
  expect(distinct?.created.id).not.toBe(committed)
  expect(await service.search()).toHaveLength(3)
  expect(owner.getLibraryOperations().filter(op => op.status === 'committed')).toHaveLength(1)
  await owner.flushDraft('authoring')
  await owner.removeCommitted('authoring', 2, 'third')
  await repo.close()
})
