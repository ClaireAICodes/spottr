import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { createIndexedDbDraftRepository } from './draftRepository'
import { createWorkoutDraftOwner, type WorkoutDraftRecord } from './workoutDrafts'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'
import { createIndexedDbWorkoutRepository } from './workoutRepository'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'

const draft = (): WorkoutDraftRecord => ({ schema: 1, id: 'authoring', editorIntentId: 'reload-intent', templateId: null, baseUpdatedAt: null, revision: 1, updatedAt: '2026-10-27T00:00:00Z', datasetGeneration: '0', value: { name: 'Original workout', gymId: 'gym', exercises: [{ exerciseId: 'row', sets: [{ kind: 'working', weight: 42, reps: 8 }] }] }, numericBuffers: { weight: '42.' }, nested: { name: 'Nested raw edit', equipment: '', muscleGroup: '', notes: 'Keep me' }, returnContext: { kind: 'workouts' } })

it.each([false, true])('corrected invalid workout saves once after reload=%s without an invalid journal admission', async reload => {
  const repo = createIndexedDbDraftRepository(`invalid-${crypto.randomUUID()}`)
  const service = createWorkoutService(createMemoryWorkoutRepository())
  let owner = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  owner.edit({ ...draft(), value: { ...draft().value, exercises: [] } })
  await expect(owner.saveWorkout(service)).rejects.toThrow('Add at least one exercise')
  expect(await service.list()).toEqual([])
  expect(await repo.readOperations!()).toEqual([])
  await owner.flushDraft('authoring')
  if (reload) {
    owner = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
    await owner.recover('authoring', '0')
  }
  expect(owner.getSnapshot()?.value.name).toBe('Original workout')
  owner.edit({ ...owner.getSnapshot()!, revision: 2, value: draft().value })
  const saved = await owner.saveWorkout(service)
  expect(saved.exercises[0].exerciseId).toBe('row')
  expect((await service.list()).map(value => value.id)).toEqual([saved.id])
  expect((await repo.readOperations!()).map(value => value.status)).toEqual(['committed'])
  expect(await repo.read('authoring')).toBeNull()
  expect(owner.getSnapshot()).toBeNull()
  await repo.close()
})

it('reconstructed owner retries committed workout cleanup without creating another workout', async () => {
  const repo = createIndexedDbDraftRepository(`reload-${crypto.randomUUID()}`)
  const service = createWorkoutService(createMemoryWorkoutRepository())
  const first = createWorkoutDraftOwner({ ...repo, async remove() { throw new Error('Cleanup unavailable') } }, { debounceMs: 60_000 })
  first.edit(draft())
  await first.flushDraft('authoring')
  await expect(first.saveWorkout(service)).rejects.toThrow()
  const committed = (await service.list())[0]
  const reloaded = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  await reloaded.recover('authoring', '0')
  expect(reloaded.getSnapshot()?.numericBuffers.weight).toBe('42.')
  expect(reloaded.getSnapshot()?.nested?.notes).toBe('Keep me')
  expect((await reloaded.saveWorkout(service)).id).toBe(committed.id)
  expect((await service.list()).map(value => value.id)).toEqual([committed.id])
  expect(reloaded.getSnapshot()).toBeNull()
  await repo.close()
})

it('reconciles an uncertain workout before saving later recovered edits into that original target', async () => {
  const repo = createIndexedDbDraftRepository(`later-${crypto.randomUUID()}`)
  const service = createWorkoutService(createMemoryWorkoutRepository())
  const first = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  first.edit(draft())
  const create = service.create
  service.create = async (...args) => { await create(...args); throw new Error('Lost response') }
  await expect(first.saveWorkout(service)).rejects.toThrow('Lost response')
  const committed = (await service.list())[0]
  first.edit({ ...draft(), revision: 2, value: { ...draft().value, name: 'Later unsaved edit' }, numericBuffers: { weight: '000.5' } })
  await first.flushDraft('authoring')
  const reloaded = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  await reloaded.recover('authoring', '0')
  service.create = create
  const result = await reloaded.saveWorkout(service)
  expect(result.id).toBe(committed.id)
  expect(result.name).toBe('Later unsaved edit')
  expect(await service.list()).toHaveLength(1)
  await repo.close()
})

it.each([false, true])('reconciles exact later update after lost receipt and reconstruction; rival=%s', async rival => {
  const repo = createIndexedDbDraftRepository(`update-draft-${crypto.randomUUID()}`)
  const name = `update-target-${crypto.randomUUID()}`
  const target = createIndexedDbWorkoutRepository(name)
  const service = createWorkoutService(target)
  let failReceipt = false
  const first = createWorkoutDraftOwner({ ...repo,
    async remove() { throw new Error('Cleanup unavailable') },
    async saveOperation(operation) {
      if (failReceipt) throw new Error('Receipt unavailable')
      await repo.saveOperation!(operation)
    },
  }, { debounceMs: 60_000 })
  first.edit(draft())
  await expect(first.saveWorkout(service)).rejects.toThrow('Cleanup unavailable')
  const original = (await service.list())[0]
  first.edit({ ...draft(), revision: 2, value: { ...draft().value, name: 'Correct later revision' } })
  if (rival) {
    const other = createWorkoutService(createIndexedDbWorkoutRepository(name))
    await other.update(original.id, { ...draft().value, name: 'Rival writer' }, original.updatedAt)
  }
  failReceipt = true
  await expect(first.saveWorkout(service)).rejects.toThrow(rival ? 'another editor' : 'Receipt unavailable')
  const pending = (await repo.readOperations!()).find(value => value.captured.revision === 2)!
  expect(pending.status).toBe('pending')
  expect(pending.saved).toBeUndefined()
  await target.close!()
  const reconstructedService = createWorkoutService(createIndexedDbWorkoutRepository(name))
  const reloaded = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  await reloaded.recover('authoring', '0')
  expect(reloaded.getSnapshot()?.value.name).toBe('Correct later revision')
  expect(reloaded.getSnapshot()?.numericBuffers.weight).toBe('42.')
  if (rival) {
    await expect(reloaded.saveWorkout(reconstructedService)).rejects.toThrow('another editor')
    expect((await reconstructedService.get(original.id))?.name).toBe('Rival writer')
    expect(reloaded.getSnapshot()?.revision).toBe(2)
  } else {
    const saved = await reloaded.saveWorkout(reconstructedService)
    expect(saved.id).toBe(original.id)
    expect(saved.name).toBe('Correct later revision')
    expect((await repo.readOperations!()).find(value => value.id === pending.id)?.status).toBe('committed')
    expect(await repo.read('authoring')).toBeNull()
    expect(reloaded.getSnapshot()).toBeNull()
  }
  expect((await reconstructedService.list()).map(value => value.id)).toEqual([original.id])
  await repo.close()
})

it.each(['nested', 'variation'])('reconciles indeterminate %s creation after owner reconstruction without losing raw edits', async action => {
  const repo = createIndexedDbDraftRepository(`unknown-${crypto.randomUUID()}`)
  const service = createExerciseService(createMemoryExerciseRepository())
  const content = draft().nested!
  const source = await service.create({ ...content, name: 'Original shared source' })
  const first = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  first.edit(draft())
  const create = (id: string) => action === 'nested' ? service.create(content, id) : service.duplicate(source.id, undefined, id)
  const apply = (current: WorkoutDraftRecord, created: { id: string }) => ({ nested: null, value: { ...current.value, exercises: [...current.value.exercises, { exerciseId: created.id, sets: [{ kind: 'working' as const, weight: 0, reps: 8 }] }] } })
  await expect(first.createLibraryEntry(action, async id => { await create(id); throw new Error('Connection lost after commit') }, apply, service.get)).rejects.toThrow('Connection lost')
  const committed = (await service.search()).find(value => value.id !== source.id)!
  const reloaded = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
  await reloaded.recover('authoring', '0')
  expect(reloaded.getLibraryOperations()[0].status).toBe('unknown')
  expect(reloaded.getSnapshot()?.nested?.notes).toBe('Keep me')
  const retry = await reloaded.createLibraryEntry(action, create, apply, service.get)
  expect(retry?.created.id).toBe(committed.id)
  expect((await service.search()).map(value => value.id).sort()).toEqual([source.id, committed.id].sort())
  expect(reloaded.getSnapshot()?.numericBuffers.weight).toBe('42.')
  expect(reloaded.getSnapshot()?.value.exercises[1].exerciseId).toBe(committed.id)
  await reloaded.flushDraft('authoring')
  await repo.close()
})
