import { validateWorkoutDraft, type WorkoutService, type WorkoutTemplate, type WorkoutTemplateDraft } from './workouts'
import type { Exercise, ExerciseDraft } from './exercises'
import type { AppSettings } from './settings'

export const AUTHORING_DRAFT_ID = 'authoring'
export type WorkoutDraftOwner = ReturnType<typeof createWorkoutDraftOwner>
export type LibraryOperation = {
  operationId: string
  captured: WorkoutDraftRecord
  key: string
  status: 'pending' | 'committed' | 'applied' | 'unknown'
  created?: Exercise
}
export type DraftOperation = {
  id: string
  kind: 'workout' | 'library'
  operationId: string
  captured: WorkoutDraftRecord
  key: string
  status: 'pending' | 'unknown' | 'committed'
  saved?: WorkoutTemplate
  created?: Exercise
}
function operationScope(captured: WorkoutDraftRecord, key: string) {
  return JSON.stringify([captured.id, captured.editorIntentId, captured.templateId, captured.datasetGeneration, captured.revision, key])
}

/** Local edit recovery only; deliberately excluded from portable saved-data backup.
 * This morning defines the interface, not a functioning persistence service.
 * Consumers must not advertise saved status until an implementation commits.
 */
export type DraftReturnContext =
  | { kind: 'home' | 'exercises' | 'workouts' | 'gyms' | 'settings' }
  | { kind: 'history'; sessionId?: string; returnTo: 'home' | 'workouts' }

export type WorkoutDraftRecord = {
  schema: 1
  id: string
  /** Missing only on legacy local drafts; upgraded without deleting their content. */
  editorIntentId?: string
  templateId: string | null
  baseUpdatedAt: string | null
  revision: number
  updatedAt: string
  datasetGeneration: string
  value: WorkoutTemplateDraft
  numericBuffers: Record<string, string>
  template?: WorkoutTemplate | null
  nested?: ExerciseDraft | null
  exerciseQuery?: string
  editUnit?: AppSettings['weightUnit']
  focusKey?: string
  scrollY?: number
  returnContext: DraftReturnContext
}

export interface DraftRepository {
  admitOperation?(operation: DraftOperation): Promise<DraftOperation>
  saveOperation?(operation: DraftOperation): Promise<void>
  readOperations?(): Promise<DraftOperation[]>
  read(id: string): Promise<WorkoutDraftRecord | null>
  /** Atomically compare; null means create only when absent. No unconditional overwrite. */
  compareAndSave(next: WorkoutDraftRecord, expectedRevision: number | null, expectedIntent?: string): Promise<'saved' | 'conflict'>
  /** Remove only the exact saved revision, preserving any subsequent edit. */
  remove(id: string, expectedRevision: number, expectedIntent?: string): Promise<boolean>
}

/** Ephemeral repository for standalone planner consumers/tests, never app reload storage. */
export function createMemoryDraftRepository(): DraftRepository {
  let draft: WorkoutDraftRecord | null = null
  const operations = new Map<string, DraftOperation>()
  return {
    async read(id) { return draft?.id === id ? structuredClone(draft) : null },
    async compareAndSave(next, revision, intent) {
      if ((draft?.revision ?? null) !== revision || draft?.editorIntentId !== intent) return 'conflict'
      draft = structuredClone(next); return 'saved'
    },
    async remove(id, revision, intent) {
      if (draft?.id !== id || draft.revision !== revision || draft.editorIntentId !== intent) return false
      draft = null; return true
    },
    async admitOperation(operation) {
      if (draft?.id !== operation.captured.id || draft.revision !== operation.captured.revision || draft.editorIntentId !== operation.captured.editorIntentId || draft.datasetGeneration !== operation.captured.datasetGeneration) throw new Error('Draft changed in another editor')
      if (!operations.has(operation.id)) operations.set(operation.id, structuredClone(operation))
      return structuredClone(operations.get(operation.id)!)
    },
    async saveOperation(operation) {
      const current = operations.get(operation.id)
      if (current?.operationId !== operation.operationId) throw new Error('Operation identity conflict')
      if (current.status !== 'committed') operations.set(operation.id, structuredClone(operation))
    },
    async readOperations() { return structuredClone([...operations.values()]) },
  }
}

export type FlushResult =
  | { status: 'saved'; revision: number }
  | { status: 'conflict' }
  | { status: 'storage_error'; error: Error }

export interface WorkoutDraftService {
  /** Await the newest queued edit, not merely the debounce timer. */
  flushDraft(id: string): Promise<FlushResult>
}

/** One app-owned authoring slot. Mounting a screen must not create a new owner.
 * Snapshots are immutable by convention, as required by useSyncExternalStore.
 * This owner is a prerequisite only: it is not yet wired to the planner UI.
 */
export function createWorkoutDraftOwner(repository: DraftRepository, options: { debounceMs?: number } = {}) {
  let snapshot: WorkoutDraftRecord | null = null
  let durableRevision: number | null = null
  let durableIntent: string | undefined
  let intentEpoch = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let lastResult: FlushResult | null = null
  let busy = false
  let saving = false
  const libraryOperations = new Map<string, LibraryOperation>()
  const journalOperations = new Map<string, DraftOperation>()
  let receipt: { captured: WorkoutDraftRecord; saved: WorkoutTemplate } | null = null
  async function admit(captured: WorkoutDraftRecord, kind: DraftOperation['kind'], key: string) {
    if (!repository.admitOperation || !repository.saveOperation) throw new Error('Operation recovery storage is unavailable; nothing was created.')
    const flushed = await owner.flushDraft(captured.id)
    if (flushed.status !== 'saved') throw new Error('Draft must be durably saved before creating. Nothing was created.')
    const operation = await repository.admitOperation({ id: `operation:${operationScope(captured, `${kind}:${key}`)}`, kind, key, operationId: crypto.randomUUID(), captured, status: 'pending' })
    journalOperations.set(operation.id, operation); notify()
    return operation
  }
  async function persist(operation: DraftOperation) {
    await repository.saveOperation!(structuredClone(operation))
    journalOperations.set(operation.id, structuredClone(operation)); notify()
  }
  const listeners = new Set<() => void>()
  function notify() { listeners.forEach(listener => listener()) }
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation)
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  function stopTimer() { clearTimeout(timer); timer = undefined }
  const owner = {
    getSnapshot: () => snapshot,
    getIntentEpoch: () => intentEpoch,
    async saveWorkout(service: WorkoutService) {
      if (saving || busy || !snapshot) throw new Error('A workout save is already pending')
      saving = true; notify()
      const captured = structuredClone(snapshot)
      const sameIntent = (record: WorkoutDraftRecord) => record.id === captured.id && record.editorIntentId === captured.editorIntentId && record.templateId === captured.templateId && record.datasetGeneration === captured.datasetGeneration
      try {
        validateWorkoutDraft(captured.value)
        // A committed create is never repeated merely because cleanup failed.
        if (!receipt || !sameIntent(receipt.captured) || receipt.captured.revision !== captured.revision) {
          // A later revision is still the same new-workout intent. Resolve its
          // oldest admitted create before considering an update, never a new ID.
          if (!captured.template && (!receipt || !sameIntent(receipt.captured))) {
            const prior = (await repository.readOperations?.() ?? [])
              .filter(operation => operation.kind === 'workout' && sameIntent(operation.captured) && operation.captured.revision <= captured.revision)
              .sort((a, b) => a.captured.revision - b.captured.revision)[0]
            if (prior) {
              const saved = prior.saved ?? await service.get(prior.operationId) ?? await service.create(prior.captured.value, prior.operationId)
              prior.saved = saved; prior.status = 'committed'; await persist(prior)
              receipt = { captured: prior.captured, saved }
            }
          }
          const previous = receipt && sameIntent(receipt.captured) ? receipt.saved : captured.template
          const operation = await admit(captured, 'workout', 'save')
          let saved = operation.saved
          if (!saved && !previous) saved = await service.get(operation.operationId) ?? undefined
          saved ??= previous
            ? await service.update(previous.id, captured.value, previous === captured.template ? captured.baseUpdatedAt! : previous.updatedAt, operation.operationId)
            : await service.create(captured.value, operation.operationId)
          receipt = { captured, saved }
          operation.saved = saved; operation.status = 'committed'
          await persist(operation)
        }
        const saved = receipt.saved
        if (snapshot && sameIntent(snapshot) && snapshot.revision === captured.revision) {
          const flushed = await owner.flushDraft(captured.id)
          if (flushed.status !== 'saved') throw new Error(`Workout saved as ${saved.id}; draft cleanup needs retry. Your draft is retained.`)
          if (!(await owner.removeCommitted(captured.id, captured.revision, captured.editorIntentId))) {
            if (snapshot && sameIntent(snapshot) && snapshot.revision === captured.revision) throw new Error(`Workout saved as ${saved.id}; draft cleanup needs retry. Your draft is retained.`)
          }
        }
        return saved
      } finally { saving = false; notify() }
    },
    async createLibraryEntry(key: string, create: (operationId: string) => Promise<Exercise>, apply: (current: WorkoutDraftRecord, created: Exercise) => Partial<WorkoutDraftRecord>, reconcile?: (id: string) => Promise<Exercise | null>) {
      if (busy || saving || !snapshot) return null
      const captured = structuredClone(snapshot)
      // Content describes an action, never its ownership. Revision is the original
      // operation snapshot; later edits cannot implicitly consume this receipt.
      const scope = JSON.stringify([captured.id, captured.editorIntentId, captured.templateId, captured.datasetGeneration, captured.revision, key])
      let operation = libraryOperations.get(scope)
      if (operation?.status === 'unknown' && !reconcile) throw new Error(`Library operation ${operation.operationId} has an unresolved outcome; creation will not be replayed.`)
      if (operation?.status === 'applied') return null
      if (!operation) {
        operation = { operationId: '', captured, key, status: 'pending' }
        libraryOperations.set(scope, operation)
      }
      busy = true; notify()
      try {
        const journal = await admit(captured, 'library', key)
        operation.operationId = journal.operationId
        operation.created ??= journal.created
        if (!operation.created) {
          try {
            operation.created = (reconcile ? await reconcile(journal.operationId) : null) ?? await create(journal.operationId)
            operation.status = 'committed'
            journal.created = operation.created; journal.status = 'committed'
            await persist(journal)
          } catch (error) { operation.status = 'unknown'; journal.status = 'unknown'; await persist(journal); throw error }
        }
        const created = operation.created
        if (snapshot?.id !== captured.id || snapshot.editorIntentId !== captured.editorIntentId || snapshot.revision !== captured.revision || snapshot.templateId !== captured.templateId || snapshot.datasetGeneration !== captured.datasetGeneration) return null
        owner.edit({ ...snapshot, ...apply(snapshot, created), revision: snapshot.revision + 1, updatedAt: new Date().toISOString() })
        operation.status = 'applied'
        return { operationId: operation.operationId, created, editorIntentId: captured.editorIntentId, revision: captured.revision + 1 }
      } finally { busy = false; notify() }
    },
    getLibraryOperations: () => structuredClone([...libraryOperations.values()]),
    getRecoveryMessage: () => [...journalOperations.values()]
      .filter(operation => snapshot && operation.captured.id === snapshot.id && operation.captured.editorIntentId === snapshot.editorIntentId && operation.captured.datasetGeneration === snapshot.datasetGeneration && operation.captured.revision === snapshot.revision)
      .map(operation => `${operation.kind === 'workout' ? 'Workout' : 'Library'} operation ${operation.operationId}: ${operation.status === 'committed' ? 'committed; retry the original action to finish reconciliation' : 'pending or unknown outcome; retry the original action to safely check the original target, not create a second record'}.`).join(' '),
    getCommittedWorkout: () => receipt ? structuredClone(receipt.saved) : null,
    getBusy: () => busy || saving,
    getLibraryBusy: () => busy,
    setBusy(value: boolean) { busy = value; notify() },
    getPersistenceResult: () => lastResult,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async recover(id: string, datasetGeneration: string) {
      return serial(async () => {
        const recovered = await repository.read(id)
        const operations = await repository.readOperations?.() ?? []
        for (const operation of operations.sort((a, b) => a.captured.revision - b.captured.revision)) {
          journalOperations.set(operation.id, operation)
          if (operation.captured.id !== id || operation.captured.datasetGeneration !== datasetGeneration) continue
          if (operation.kind === 'library') libraryOperations.set(operationScope(operation.captured, operation.key), { ...operation, status: operation.created ? 'committed' : 'unknown' })
          if (operation.kind === 'workout' && operation.saved && operation.captured.editorIntentId === recovered?.editorIntentId) receipt = { captured: operation.captured, saved: operation.saved }
        }
        // A completed read cannot initialize over typing that happened meanwhile.
        // If dataset generation doesn't match, treat as no recoverable draft.
        if (!snapshot && recovered && recovered.datasetGeneration === datasetGeneration) {
          intentEpoch++
          snapshot = recovered
          durableRevision = recovered.revision
          durableIntent = recovered.editorIntentId
          // Legacy content is retained and upgraded by the normal CAS path.
          if (!recovered.editorIntentId) {
            snapshot = { ...recovered, editorIntentId: crypto.randomUUID(), revision: recovered.revision + 1 }
            timer = setTimeout(() => { void owner.flushDraft(id) }, options.debounceMs ?? 250)
          }
          lastResult = recovered.editorIntentId ? { status: 'saved', revision: recovered.revision } : null
          notify()
        }
        return snapshot
      })
    },
    edit(next: WorkoutDraftRecord) {
      if (snapshot && (next.id !== snapshot.id || next.revision <= snapshot.revision)) {
        throw new Error('Edit must advance the current draft revision')
      }
      if (!snapshot || snapshot.editorIntentId !== next.editorIntentId) intentEpoch++
      snapshot = structuredClone(next)
      lastResult = null
      notify()
      stopTimer()
      timer = setTimeout(() => { void owner.flushDraft(next.id) }, options.debounceMs ?? 250)
    },
    flushDraft(id: string): Promise<FlushResult> {
      stopTimer()
      return serial(async () => {
        try {
          if (!snapshot || snapshot.id !== id) throw new Error('Draft not found')
          while (snapshot && snapshot.id === id && snapshot.revision !== durableRevision) {
            const writing = structuredClone(snapshot)
            const result = await repository.compareAndSave(writing, durableRevision, durableIntent)
            if (result === 'conflict') {
              lastResult = { status: 'conflict' }; notify(); return lastResult
            }
            durableRevision = writing.revision
            durableIntent = writing.editorIntentId
          }
          lastResult = { status: 'saved', revision: durableRevision! }
        } catch (error) {
          lastResult = { status: 'storage_error', error: error instanceof Error ? error : new Error(String(error)) }
        }
        notify()
        return lastResult
      })
    },
    removeCommitted(id: string, revision: number, intent?: string) {
      return serial(async () => {
        if (snapshot?.id !== id || snapshot.revision !== revision || snapshot.editorIntentId !== intent) return false
        const removed = await repository.remove(id, revision, intent)
        // Edits remain synchronous even while the removal transaction is pending.
        if (removed) {
          durableRevision = null
          durableIntent = undefined
          if (snapshot?.id === id && snapshot.revision === revision && snapshot.editorIntentId === intent) {
            stopTimer(); snapshot = null; lastResult = null
          }
          notify()
        }
        return removed
      })
    },
  }
  return owner
}
