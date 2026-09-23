import type { WorkoutRepository, WorkoutTemplate } from './workouts'

const WORKOUT_DATABASE_VERSION = 1
const WORKOUTS_STORE = 'workouts'

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was cancelled'))
  })
}

export function createIndexedDbWorkoutRepository(databaseName = 'spottr-v1-workouts'): WorkoutRepository {
  let databasePromise: Promise<IDBDatabase> | null = null

  function openDatabase() {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, WORKOUT_DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(WORKOUTS_STORE)) {
          request.result.createObjectStore(WORKOUTS_STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        databasePromise = null
        reject(request.error ?? new Error('Spottr could not open workout storage'))
      }
      request.onblocked = () => {
        databasePromise = null
        reject(new Error('Spottr workout storage is blocked by another tab'))
      }
    })
    return databasePromise
  }

  return {
    async list() {
      const database = await openDatabase()
      return requestResult(database.transaction(WORKOUTS_STORE).objectStore(WORKOUTS_STORE).getAll()) as Promise<WorkoutTemplate[]>
    },
    async get(id) {
      const database = await openDatabase()
      const result = await requestResult(database.transaction(WORKOUTS_STORE).objectStore(WORKOUTS_STORE).get(id))
      return (result as WorkoutTemplate | undefined) ?? null
    },
    async save(template) {
      const database = await openDatabase()
      const transaction = database.transaction(WORKOUTS_STORE, 'readwrite')
      transaction.objectStore(WORKOUTS_STORE).put(template)
      await transactionComplete(transaction)
    },
    async remove(id) {
      const database = await openDatabase()
      const transaction = database.transaction(WORKOUTS_STORE, 'readwrite')
      transaction.objectStore(WORKOUTS_STORE).delete(id)
      await transactionComplete(transaction)
    },
    async close() {
      if (!databasePromise) return
      const database = await databasePromise
      database.close()
      databasePromise = null
    },
  }
}
