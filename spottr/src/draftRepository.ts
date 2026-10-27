import type { DraftRepository, WorkoutDraftRecord } from './workoutDrafts'

/** Device-local recovery; deliberately separate from portable saved data. */
export function createIndexedDbDraftRepository(databaseName = 'spottr-drafts-v1'): DraftRepository & { close(): Promise<void> } {
  let opening: Promise<IDBDatabase> | null = null
  function open() {
    if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' })
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => { database.close(); opening = null }
        resolve(database)
      }
      request.onerror = () => { opening = null; reject(request.error ?? new Error('Could not open draft storage')) }
      request.onblocked = () => { opening = null; reject(new Error('Draft storage is blocked by another tab')) }
    })
    return opening
  }

  async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void, guard: (callback: () => void) => () => void) => void): Promise<T> {
    const database = await open()
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction('drafts', mode)
      let value: T
      transaction.oncomplete = () => resolve(value)
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Draft storage transaction failed'))
      const guard = (callback: () => void) => () => {
        try { callback() } catch (error) { transaction.abort(); reject(error) }
      }
      guard(() => action(transaction.objectStore('drafts'), next => { value = next }, guard))()
    })
  }

  return {
    admitOperation(operation) {
      return transact<import('./workoutDrafts').DraftOperation>('readwrite', (store, result, guard) => {
        const read = store.get(operation.captured.id)
        read.onsuccess = guard(() => {
          const current = read.result as WorkoutDraftRecord | undefined
          if (current?.editorIntentId !== operation.captured.editorIntentId || current?.revision !== operation.captured.revision || current?.datasetGeneration !== operation.captured.datasetGeneration) {
            store.transaction.abort(); return
          }
          const existing = store.get(operation.id)
          existing.onsuccess = guard(() => {
            if (!existing.result) store.add(operation)
            result(existing.result ?? operation)
          })
        })
      })
    },
    saveOperation(operation) {
      return transact<void>('readwrite', (store, result, guard) => {
        const read = store.get(operation.id)
        read.onsuccess = guard(() => {
          if (read.result?.operationId !== operation.operationId) { store.transaction.abort(); return }
          store.put(read.result.status === 'committed' ? read.result : operation)
          result(undefined)
        })
      })
    },
    readOperations() {
      return transact<import('./workoutDrafts').DraftOperation[]>('readonly', (store, result, guard) => {
        const request = store.getAll()
        request.onsuccess = guard(() => result(request.result.filter(value => value.id.startsWith('operation:') && value.operationId)))
      })
    },
    read(id) {
      return transact<WorkoutDraftRecord | null>('readonly', (store, result, guard) => {
        const request = store.get(id)
        request.onsuccess = guard(() => result(request.result ?? null))
      })
    },
    compareAndSave(next, expectedRevision, expectedIntent) {
      if (!Number.isSafeInteger(next.revision) || next.revision < 1 || (expectedRevision !== null && next.revision <= expectedRevision)) {
        return Promise.reject(new Error('Draft revision must advance'))
      }
      // Clone before awaiting open: the caller may continue editing immediately.
      const snapshot = structuredClone(next)
      return transact<'saved' | 'conflict'>('readwrite', (store, result, guard) => {
        const request = store.get(snapshot.id)
        request.onsuccess = guard(() => {
          const current = request.result as WorkoutDraftRecord | undefined
          if ((current?.revision ?? null) !== expectedRevision || current?.editorIntentId !== expectedIntent) { result('conflict'); return }
          store.put(snapshot)
          result('saved')
        })
      })
    },
    remove(id, expectedRevision, expectedIntent) {
      return transact<boolean>('readwrite', (store, result, guard) => {
        const request = store.get(id)
        request.onsuccess = guard(() => {
          if (request.result?.revision !== expectedRevision || request.result?.editorIntentId !== expectedIntent) { result(false); return }
          store.delete(id)
          result(true)
        })
      })
    },
    async close() {
      if (!opening) return
      const database = await opening
      database.close()
      opening = null
    },
  }
}
