import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createIndexedDbDraftRepository } from './draftRepository'
import { createWorkoutDraftOwner, type WorkoutDraftRecord } from './workoutDrafts'

const record = (revision: number): WorkoutDraftRecord => ({
  schema: 1, id: 'authoring', editorIntentId: 'original', templateId: null, baseUpdatedAt: null,
  revision, updatedAt: '2026-10-26T08:00:00.000Z', datasetGeneration: '0',
  value: { name: 'Unfinished routine', gymId: 'gym', exercises: [] },
  numericBuffers: { weight: '42.' }, returnContext: { kind: 'workouts' },
})

describe('local workout draft repository', () => {
  it('keeps edits synchronous, flushes the latest edit during a pending save, and removes no newer edit', async () => {
    const repository = createIndexedDbDraftRepository(`draft-owner-${crypto.randomUUID()}`)
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    let reached!: () => void
    const pending = new Promise<void>(resolve => { reached = resolve })
    let first = true
    const owner = createWorkoutDraftOwner({ ...repository, async compareAndSave(next, expected, intent) {
      if (first) { first = false; reached(); await barrier }
      return repository.compareAndSave(next, expected, intent)
    } }, { debounceMs: 60_000 })
    owner.edit(record(1))
    expect(owner.getSnapshot()?.numericBuffers.weight).toBe('42.')
    const flush = owner.flushDraft('authoring')
    await pending
    owner.edit({ ...record(2), numericBuffers: { weight: '' } })
    release()
    expect(await flush).toEqual({ status: 'saved', revision: 2 })
    expect((await repository.read('authoring'))?.numericBuffers.weight).toBe('')
    owner.edit({ ...record(3), numericBuffers: { weight: '000.5' } })
    expect(await owner.removeCommitted('authoring', 2, 'original')).toBe(false)
    expect(owner.getSnapshot()?.numericBuffers.weight).toBe('000.5')
    await owner.flushDraft('authoring')
    expect(await owner.removeCommitted('authoring', 3, 'original')).toBe(true)
    expect(owner.getSnapshot()).toBeNull()
    await repository.close()
  })
  it('retains failed edits for explicit retry and recovers only the matching dataset', async () => {
    const repository = createIndexedDbDraftRepository(`draft-retry-${crypto.randomUUID()}`)
    let fail = true
    const owner = createWorkoutDraftOwner({ ...repository, async compareAndSave(next, expected, intent) {
      if (fail) throw new Error('Device quota reached')
      return repository.compareAndSave(next, expected, intent)
    } }, { debounceMs: 60_000 })
    owner.edit(record(1))
    expect((await owner.flushDraft('authoring')).status).toBe('storage_error')
    expect(owner.getPersistenceResult()?.status).toBe('storage_error')
    expect(owner.getSnapshot()?.value.name).toBe('Unfinished routine')
    expect(await repository.read('authoring')).toBeNull()
    fail = false
    expect(await owner.flushDraft('authoring')).toEqual({ status: 'saved', revision: 1 })
    const restored = createWorkoutDraftOwner(repository)
    expect(await restored.recover('authoring', 'different-dataset')).toBeNull()
    expect((await restored.recover('authoring', '0'))?.numericBuffers.weight).toBe('42.')
    const rival = createWorkoutDraftOwner(repository, { debounceMs: 60_000 })
    await rival.recover('authoring', '0')
    rival.edit({ ...record(2), value: { ...record(2).value, name: 'Other tab saved' } })
    await rival.flushDraft('authoring')
    owner.edit({ ...record(2), value: { ...record(2).value, name: 'Keep this conflicting draft' } })
    expect(await owner.flushDraft('authoring')).toEqual({ status: 'conflict' })
    expect(owner.getSnapshot()?.value.name).toBe('Keep this conflicting draft')
    expect((await repository.read('authoring'))?.value.name).toBe('Other tab saved')
    await repository.close()
  })
  it('allows only one competing revision and removes only the exact stored revision', async () => {
    const database = `draft-cas-${crypto.randomUUID()}`
    const first = createIndexedDbDraftRepository(database)
    const second = createIndexedDbDraftRepository(database)
    try {
      expect(await first.compareAndSave(record(1), null)).toBe('saved')
      const results = await Promise.all([
        first.compareAndSave({ ...record(2), value: { ...record(2).value, name: 'First tab' } }, 1, 'original'),
        second.compareAndSave({ ...record(2), value: { ...record(2).value, name: 'Second tab' } }, 1, 'original'),
      ])
      expect(results.sort()).toEqual(['conflict', 'saved'])
      expect(await second.remove('authoring', 1, 'original')).toBe(false)
      expect((await second.read('authoring'))?.revision).toBe(2)
      expect((await second.read('authoring'))?.numericBuffers.weight).toBe('42.')
      expect(await second.remove('authoring', 2, 'original')).toBe(true)
      expect(await first.read('authoring')).toBeNull()
    } finally { await first.close(); await second.close() }
  })
})
