import { test, expect } from '@playwright/test'

test('native transactions fence equal-revision intent reuse and migrate legacy content without deletion', async ({ page }) => {
  await page.goto('/spottr/')
  const result = await page.evaluate(async () => {
    const path = '/spottr/src/'
    const { createIndexedDbDraftRepository } = await import(path + 'draftRepository.ts')
    const { createWorkoutDraftOwner } = await import(path + 'workoutDrafts.ts')
    const name = `native-intent-${crypto.randomUUID()}`
    const a = createIndexedDbDraftRepository(name)
    const b = createIndexedDbDraftRepository(name)
    const original = { schema: 1, id: 'authoring', editorIntentId: 'original', templateId: 'same', revision: 1, baseUpdatedAt: null, datasetGeneration: '0', updatedAt: '2026-10-26T00:00:00Z', value: { name: 'Keep legacy content', gymId: 'gym', exercises: [] }, numericBuffers: { raw: '42.' }, returnContext: { kind: 'workouts' } }
    await a.compareAndSave(original, null)
    await a.remove('authoring', 1, 'original')
    await b.compareAndSave({ ...original, editorIntentId: 'reopened' }, null)
    const staleRemove = await a.remove('authoring', 1, 'original')
    const staleWrite = await a.compareAndSave({ ...original, revision: 2 }, 1, 'original')
    const kept = await b.read('authoring')
    await b.remove('authoring', 1, 'reopened')
    const { editorIntentId: _legacy, ...legacy } = original
    await a.compareAndSave(legacy, null)
    const owner = createWorkoutDraftOwner(b, { debounceMs: 60_000 })
    const recovered = await owner.recover('authoring', '0')
    const flush = await owner.flushDraft('authoring')
    const durable = await a.read('authoring')
    const afterRemount = createWorkoutDraftOwner(a)
    const restored = await afterRemount.recover('authoring', '0')
    await a.close(); await b.close()
    return { staleRemove, staleWrite, kept, recovered, flush, durable, restored }
  })
  expect(result.staleRemove).toBe(false)
  expect(result.staleWrite).toBe('conflict')
  expect(result.kept.editorIntentId).toBe('reopened')
  expect(result.recovered.value.name).toBe('Keep legacy content')
  expect(result.recovered.numericBuffers.raw).toBe('42.')
  expect(result.flush.status).toBe('saved')
  expect(result.durable.editorIntentId).toBeTruthy()
  expect(result.restored.editorIntentId).toBe(result.durable.editorIntentId)
})

test('native owner isolates library retry by original operation, draft, dataset and intent and blocks pending duplicate', async ({ page }) => {
  await page.goto('/spottr/')
  const result = await page.evaluate(async () => {
    const path = '/spottr/src/'
    const { createIndexedDbDraftRepository } = await import(path + 'draftRepository.ts')
    const { createWorkoutDraftOwner } = await import(path + 'workoutDrafts.ts')
    const { createExerciseService } = await import(path + 'exercises.ts')
    const { createIndexedDbExerciseRepository } = await import(path + 'exerciseRepository.ts')
    const repo = createIndexedDbDraftRepository(`native-lib-draft-${crypto.randomUUID()}`)
    const service = createExerciseService(createIndexedDbExerciseRepository(`native-lib-${crypto.randomUUID()}`))
    const owner = createWorkoutDraftOwner(repo, { debounceMs: 60_000 })
    const original = { schema: 1, id: 'authoring', editorIntentId: 'original', templateId: 'same', revision: 1, baseUpdatedAt: null, datasetGeneration: '0', updatedAt: '2026-10-26T00:00:00Z', value: { name: 'Identical', gymId: 'gym', exercises: [] }, numericBuffers: {}, returnContext: { kind: 'workouts' } }
    const content = { name: 'Identical', muscleGroup: '', equipment: '', notes: '' }
    let calls = 0
    const create = async () => { calls++; return service.create(content) }
    const apply = (current: typeof original, created: { id: string }) => ({ value: { ...current.value, name: created.id } })
    owner.edit(original)
    try { await owner.createLibraryEntry('nested', create, () => { throw new Error('Refresh failure') }) } catch { /* retained committed receipt */ }
    const firstId = owner.getLibraryOperations()[0].created.id
    const retry = await owner.createLibraryEntry('nested', create, apply)
    await owner.flushDraft('authoring'); await owner.removeCommitted('authoring', 2, 'original')
    // Change one identity dimension at a time; keep content/template/revision equal.
    for (const changed of [{ editorIntentId: 'distinct' }, { id: 'other-draft' }, { datasetGeneration: 'other-dataset' }]) {
      const next = { ...original, ...changed }
      owner.edit(next)
      try { await owner.createLibraryEntry('nested', create, () => { throw new Error('Refresh failure') }) } catch { /* preserve each unresolved result */ }
      await owner.flushDraft(next.id); await owner.removeCommitted(next.id, 1, next.editorIntentId)
    }
    owner.edit({ ...original, editorIntentId: 'pending' })
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    let entered!: () => void
    const admitted = new Promise<void>(resolve => { entered = resolve })
    const pending = owner.createLibraryEntry('nested', async () => { entered(); await held; return create() }, apply)
    await admitted
    const duplicate = await owner.createLibraryEntry('nested', create, apply)
    const captured = owner.getSnapshot()
    owner.edit({ ...captured, revision: 2, value: { ...captured.value, name: 'Later input' } })
    release(); await pending
    const unresolved = owner.getLibraryOperations().filter((op: { status: string }) => op.status === 'committed')
    const current = owner.getSnapshot()
    const library = await service.search()
    await owner.flushDraft('authoring'); await repo.close()
    return { firstId, retryId: retry.created.id, calls, duplicate, unresolved: unresolved.map((op: { created: { id: string } }) => op.created.id), current, libraryCount: library.length }
  })
  expect(result.retryId).toBe(result.firstId)
  expect(result.calls).toBe(5)
  expect(result.libraryCount).toBe(5)
  expect(result.duplicate).toBeNull()
  expect(result.current.value.name).toBe('Later input')
  expect(result.unresolved).toHaveLength(4)
  expect(new Set(result.unresolved).size).toBe(4)
})

test('native cross-connection admission and create-if-absent preserve one target and reject stale drafts', async ({ page }) => {
  await page.goto('/spottr/')
  const result = await page.evaluate(async () => {
    const path = '/spottr/src/'
    const { createIndexedDbDraftRepository } = await import(path + 'draftRepository.ts')
    const { createWorkoutDraftOwner } = await import(path + 'workoutDrafts.ts')
    const { createExerciseService } = await import(path + 'exercises.ts')
    const { createIndexedDbExerciseRepository } = await import(path + 'exerciseRepository.ts')
    const { createWorkoutService } = await import(path + 'workouts.ts')
    const { createIndexedDbWorkoutRepository } = await import(path + 'workoutRepository.ts')
    const name = `journal-${crypto.randomUUID()}`
    const a = createIndexedDbDraftRepository(name), b = createIndexedDbDraftRepository(name)
    const record = { schema: 1, id: 'authoring', editorIntentId: 'native', templateId: null, revision: 1, baseUpdatedAt: null, datasetGeneration: '0', updatedAt: '2026-10-27T00:00:00Z', value: { name: 'Keep existing draft', gymId: 'gym', exercises: [{ exerciseId: 'row', sets: [{ kind: 'working', weight: 42, reps: 8 }] }] }, numericBuffers: { raw: '42.' }, nested: { name: 'Nested', notes: 'Keep notes', muscleGroup: '', equipment: '' }, returnContext: { kind: 'workouts' } }
    await a.compareAndSave(record, null)
    const operation = { id: 'operation:test-native', kind: 'library', key: 'nested', captured: record, operationId: crypto.randomUUID(), status: 'pending' }
    const [left, right] = await Promise.all([a.admitOperation(operation), b.admitOperation({ ...operation, operationId: crypto.randomUUID() })])
    const libraryName = `journal-library-${crypto.randomUUID()}`
    const libA = createExerciseService(createIndexedDbExerciseRepository(libraryName)), libB = createExerciseService(createIndexedDbExerciseRepository(libraryName))
    const created = await Promise.all([libA.create(record.nested, left.operationId), libB.create(record.nested, right.operationId)])
    const workoutName = `journal-workout-${crypto.randomUUID()}`
    const workoutA = createWorkoutService(createIndexedDbWorkoutRepository(workoutName)), workoutB = createWorkoutService(createIndexedDbWorkoutRepository(workoutName))
    const targets = await Promise.all([workoutA.create(record.value, 'original-workout-operation'), workoutB.create(record.value, 'original-workout-operation')])
    // Existing B1 writer must invalidate an older editor's captured version natively.
    const old = targets[0]
    const changed = await workoutB.updateSetTarget(old.id, old.exercises[0].id, old.exercises[0].sets[0].id, { weight: 50, reps: 9 })
    let staleTemplateRejected = false
    try { await workoutA.update(old.id, record.value, old.updatedAt) } catch { staleTemplateRejected = true }
    const stale = createWorkoutDraftOwner(a, { debounceMs: 60_000 }); await stale.recover('authoring', '0')
    await b.compareAndSave({ ...record, revision: 2 }, 1, 'native')
    let creates = 0, staleRejected = false
    try { await stale.createLibraryEntry('nested', async () => { creates++; return created[0] }, () => ({})) } catch { staleRejected = true }
    const preserved = await b.read('authoring')
    const count = (await libA.search()).length, workoutCount = (await workoutA.list()).length
    const target = await workoutA.get(old.id)
    const journal = await a.readOperations()
    await a.close(); await b.close()
    return { ids: created.map((value: { id: string }) => value.id), targets: targets.map((value: { id: string }) => value.id), count, workoutCount, staleRejected, creates, preserved, journalCount: journal.length, staleTemplateRejected, changed, target }
  })
  expect(new Set(result.ids).size).toBe(1)
  expect(new Set(result.targets).size).toBe(1)
  expect(result.count).toBe(1)
  expect(result.workoutCount).toBe(1)
  expect(result.staleRejected).toBe(true)
  expect(result.creates).toBe(0)
  expect(result.preserved.numericBuffers.raw).toBe('42.')
  expect(result.preserved.nested.notes).toBe('Keep notes')
  expect(result.journalCount).toBe(1)
  expect(result.staleTemplateRejected).toBe(true)
  expect(result.target.exercises[0].sets[0].weight).toBe(50)
  expect(result.target.updatedAt).toBe(result.changed.updatedAt)
})
