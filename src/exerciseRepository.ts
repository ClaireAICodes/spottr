import type { Exercise, ExerciseRepository } from './exercises'

const EXERCISE_DATABASE_VERSION = 1
const EXERCISES_STORE = 'exercises'

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

export function createIndexedDbExerciseRepository(databaseName = 'spottr-v1-exercises'): ExerciseRepository {
  let databasePromise: Promise<IDBDatabase> | null = null

  function openDatabase() {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, EXERCISE_DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(EXERCISES_STORE)) {
          database.createObjectStore(EXERCISES_STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        databasePromise = null
        reject(request.error ?? new Error('Spottr could not open exercise storage'))
      }
      request.onblocked = () => {
        databasePromise = null
        reject(new Error('Spottr exercise storage is blocked by another tab'))
      }
    })
    return databasePromise
  }

  return {
    async list() {
      const database = await openDatabase()
      const request = database.transaction(EXERCISES_STORE).objectStore(EXERCISES_STORE).getAll()
      return requestResult(request) as Promise<Exercise[]>
    },
    async get(id) {
      const database = await openDatabase()
      const request = database.transaction(EXERCISES_STORE).objectStore(EXERCISES_STORE).get(id)
      return ((await requestResult(request)) as Exercise | undefined) ?? null
    },
    async save(exercise) {
      const database = await openDatabase()
      const transaction = database.transaction(EXERCISES_STORE, 'readwrite')
      transaction.objectStore(EXERCISES_STORE).put(exercise)
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
