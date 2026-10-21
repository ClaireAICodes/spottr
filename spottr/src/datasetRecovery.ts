import { createRestoreJournal, createIndexedDbJournalStore, snapshotSeal } from './restoreJournal'
import { createOwnedDatasetStorage, incomingStorage, persistentStorageIdentity, validateStoredDataset } from './ownedDatasetStorage'
import type { RestoreLifecycle } from './backup'

export type RecoveryState = 'loading' | 'recovering' | 'ready' | 'blocked'
export class RestoreRejectedError extends Error {
  readonly outcome = 'rejected-unchanged'
  constructor(readonly cause: unknown) { super('Replacement could not start. Your saved data has not been changed.') }
}
export class RecoveryBlockedError extends Error {
  constructor(readonly cause: unknown, readonly outcome: 'recovery-blocked' | 'committed-cleanup-blocked' = 'recovery-blocked') {
    super(outcome === 'committed-cleanup-blocked'
      ? 'Replacement committed, but recovery cleanup could not finish. Your recovery record has been kept.'
      : 'Recovery could not finish. Your recovery record has been kept.')
  }
}

// Only composition of the exact default five-store graph constructs this binding.
// Every method below requires already-held dataset ownership.
export function createDatasetRecovery(invalidate: () => void) {
  const storage = createOwnedDatasetStorage()
  const store = createIndexedDbJournalStore('spottr-v1-restore-journal')
  const journal = createRestoreJournal({
    identity: async () => `${globalThis.location?.origin ?? 'test-origin'}:${persistentStorageIdentity}:${await store.getInstanceId()}`,
    store, ...storage, invalidate: async () => invalidate(),
  })
  let state: RecoveryState = 'loading'
  let failure: RecoveryBlockedError | undefined
  const listeners = new Set<() => void>()
  function set(next: RecoveryState) { if (next !== state) { state = next; listeners.forEach(fn => fn()) } }
  async function blocked(error: unknown, outcome?: 'committed-cleanup-blocked'): Promise<never> {
    failure = new RecoveryBlockedError(error, outcome)
    set('blocked')
    throw failure
  }
  async function inspect() {
    if (state === 'blocked') throw failure
    try { return await journal.inspect() } catch (error) { return blocked(error) }
  }
  async function recover(retry = false) {
    if (state === 'blocked' && !retry) throw failure
    try {
      if (await journal.inspect()) { set('recovering'); await journal.recover() }
      failure = undefined
      set('ready')
    } catch (error) { return blocked(error) }
  }
  const lifecycle: RestoreLifecycle = {
    async prepare(backup) {
      // Prepare failure can leave a record with uncertain acknowledgement. Block
      // admission until explicit retry rather than allowing another replacement.
      try { await journal.prepare(incomingStorage(backup)); await journal.begin() }
      catch (error) {
        try {
          if (!await journal.inspect()) throw new RestoreRejectedError(error)
        } catch (inspectionError) {
          if (inspectionError instanceof RestoreRejectedError) throw inspectionError
          return blocked(inspectionError)
        }
        return blocked(error)
      }
    },
    async committed() {
      try { await journal.commit() }
      catch (error) {
        let committed = false
        try { committed = (await journal.inspect())?.phase === 'COMMITTED' } catch { /* retain unknown phase */ }
        return blocked(error, committed ? 'committed-cleanup-blocked' : undefined)
      }
    },
    async compensating() {
      try { await journal.startRollback() } catch (error) { return blocked(error) }
    },
    async compensated() {
      try {
        const record = await journal.inspect()
        if (!record || record.phase === 'COMMITTED') throw new Error('Invalid compensation phase')
        const before = await validateStoredDataset(record.before)
        const current = await storage.capture()
        // Decorated compensation must first restore every substantive value.
        // Only absent selection/settings materialized by service defaults may
        // differ before exact raw-presence reconciliation.
        const comparable = structuredClone(current)
        for (const [d, s] of [[0, 1], [4, 0]]) {
          if (!before.databases[d][s].rows.length) comparable.databases[d][s].rows = []
        }
        if (await snapshotSeal(comparable) !== await snapshotSeal(before)) throw new Error('Decorated compensation did not restore the dataset')
        await journal.recover()
      } catch (error) { return blocked(error) }
    },
    failed: error => blocked(error),
  }
  return {
    inspect, recover, lifecycle,
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    // Opaque retained diagnostic, not a promise that a mixed live export is safe.
    evidence: () => store.read(),
  }
}
