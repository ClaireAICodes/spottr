import 'fake-indexeddb/auto'
import { expect, it, vi } from 'vitest'
import { createIndexedDbDraftRepository } from './draftRepository'
import { createWorkoutDraftOwner, type WorkoutDraftRecord } from './workoutDrafts'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'

const draft = (): WorkoutDraftRecord => ({ schema: 1, id: 'authoring', editorIntentId: 'original', templateId: null, baseUpdatedAt: null, revision: 1, updatedAt: '2026-10-27T00:00:00Z', datasetGeneration: '0', value: { name: 'Routine', gymId: 'gym', exercises: [{ exerciseId: 'row', sets: [{ kind: 'working', weight: 42, reps: 8 }] }] }, numericBuffers: { weight: '42.' }, nested: { name: 'Nested row', muscleGroup: '', equipment: '', notes: 'Keep raw edits' }, returnContext: { kind: 'workouts' } })

it.each(['workout', 'library'])('%s does not enter external create if pre-operation journal persistence fails', async kind => {
  const repo = createIndexedDbDraftRepository(`admission-${crypto.randomUUID()}`)
  const owner = createWorkoutDraftOwner({ ...repo, async admitOperation() { throw new Error('Journal quota') } }, { debounceMs: 60_000 })
  owner.edit(draft())
  const service = createWorkoutService(createMemoryWorkoutRepository())
  const create = vi.spyOn(service, 'create')
  const libraryCreate = vi.fn()
  await expect(kind === 'workout' ? owner.saveWorkout(service) : owner.createLibraryEntry('nested', libraryCreate, () => ({}))).rejects.toThrow('Journal quota')
  expect(create).not.toHaveBeenCalled()
  expect(libraryCreate).not.toHaveBeenCalled()
  expect(await service.list()).toHaveLength(0)
  expect((await repo.read('authoring'))?.nested?.notes).toBe('Keep raw edits')
  await repo.close()
})

it.each(['apply', 'draft-persistence', 'receipt-persistence'])('recovers committed library ID after %s failure and does not replay creation', async failure => {
  const repo = createIndexedDbDraftRepository(`apply-${crypto.randomUUID()}`)
  let failed = false
  const first = createWorkoutDraftOwner({ ...repo,
    async compareAndSave(...args) { if (failed && failure === 'draft-persistence') throw new Error('Draft quota'); return repo.compareAndSave(...args) },
    async saveOperation(operation) { if (failure === 'receipt-persistence') throw new Error('Receipt quota'); return repo.saveOperation!(operation) },
  }, { debounceMs: 60_000 })
  const service = createExerciseService(createMemoryExerciseRepository())
  const create = vi.fn((id: string) => service.create(draft().nested!, id))
  first.edit(draft())
  const apply = (current: WorkoutDraftRecord, created: { id: string }) => ({ nested: null, value: { ...current.value, name: created.id } })
  try {
    await first.createLibraryEntry('nested', create, (current, created) => { if (failure === 'apply') throw new Error('Apply failed'); failed = true; return apply(current, created) }, service.get)
    expect((await first.flushDraft('authoring')).status).toBe('storage_error')
  } catch (error) { expect(String(error)).toMatch(/Apply failed|Receipt quota/) }
  const committed = (await service.search())[0]
  const reloaded = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  await reloaded.recover('authoring', '0')
  expect(reloaded.getSnapshot()?.nested?.notes).toBe('Keep raw edits')
  const result = await reloaded.createLibraryEntry('nested', create, apply, service.get)
  expect(result?.created.id).toBe(committed.id)
  expect(create).toHaveBeenCalledTimes(1)
  expect(await service.search()).toHaveLength(1)
  expect(reloaded.getSnapshot()?.numericBuffers.weight).toBe('42.')
  await reloaded.flushDraft('authoring')
  await repo.close()
})

it.each(['editorIntentId', 'id', 'datasetGeneration'])('recovered operations never cross distinct %s identities', async dimension => {
  const repo = createIndexedDbDraftRepository(`identity-${crypto.randomUUID()}`)
  const service = createExerciseService(createMemoryExerciseRepository())
  const create = (id: string) => service.create(draft().nested!, id)
  const first = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  first.edit(draft())
  await expect(first.createLibraryEntry('nested', create, () => { throw new Error('Apply failed') }, service.get)).rejects.toThrow()
  const original = (await service.search())[0].id
  await first.removeCommitted('authoring', 1, 'original')
  const distinct = { ...draft(), [dimension]: 'different' }
  const next = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  next.edit(distinct)
  await next.flushDraft(distinct.id)
  const reloaded = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  await reloaded.recover(distinct.id, distinct.datasetGeneration)
  const result = await reloaded.createLibraryEntry('nested', create, () => ({ nested: null }), service.get)
  expect(result?.created.id).not.toBe(original)
  expect(await service.search()).toHaveLength(2)
  await reloaded.flushDraft(distinct.id)
  await repo.close()
})

it('a stale tab cannot admit a mutation after another tab advances the durable draft', async () => {
  const repo = createIndexedDbDraftRepository(`rival-${crypto.randomUUID()}`)
  const first = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  first.edit(draft()); await first.flushDraft('authoring')
  const rival = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  await rival.recover('authoring', '0')
  rival.edit({ ...draft(), revision: 2 }); await rival.flushDraft('authoring')
  const create = vi.fn()
  await expect(first.createLibraryEntry('nested', create, () => ({}))).rejects.toThrow()
  expect(create).not.toHaveBeenCalled()
  expect((await repo.read('authoring'))?.revision).toBe(2)
  await repo.close()
})
