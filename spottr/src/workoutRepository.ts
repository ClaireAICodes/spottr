import type { WorkoutRepository, WorkoutTemplate } from './workouts'
import { replaceTransaction } from './replaceTransaction'

export const WORKOUT_DATABASE_VERSION = 2
const WORKOUTS_STORE = 'workouts'
// Local retry evidence, never part of portable workout/backup records.
export const UPDATE_OUTCOMES_STORE = 'updateOutcomes'

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
        if (!request.result.objectStoreNames.contains(UPDATE_OUTCOMES_STORE)) {
          request.result.createObjectStore(UPDATE_OUTCOMES_STORE, { keyPath: 'id' })
        }
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
    async getUpdateOutcome(operationId, targetId) {
      const database = await openDatabase()
      const outcome = await requestResult(database.transaction(UPDATE_OUTCOMES_STORE).objectStore(UPDATE_OUTCOMES_STORE).get(operationId))
      if (outcome && outcome.template.id !== targetId) throw new Error('Workout operation identity conflict')
      return outcome?.template ?? null
    },
    async list() {
      const database = await openDatabase()
      return requestResult(database.transaction(WORKOUTS_STORE).objectStore(WORKOUTS_STORE).getAll()) as Promise<WorkoutTemplate[]>
    },
    async get(id) {
      const database = await openDatabase()
      const result = await requestResult(database.transaction(WORKOUTS_STORE).objectStore(WORKOUTS_STORE).get(id))
      return (result as WorkoutTemplate | undefined) ?? null
    },
    async save(template, expectedUpdatedAt, operationId) {
      const database = await openDatabase()
      const transaction = database.transaction([WORKOUTS_STORE, UPDATE_OUTCOMES_STORE], 'readwrite')
      const completed = transactionComplete(transaction)
      const store = transaction.objectStore(WORKOUTS_STORE)
      const outcomes = transaction.objectStore(UPDATE_OUTCOMES_STORE)
      let conflict = false
      let identityConflict = false
      function write() {
        store.put(template)
        if (operationId) outcomes.put({ id: operationId, template })
      }
      function compareAndWrite() {
        if (expectedUpdatedAt === undefined) write()
        else {
          const read = store.get(template.id)
          read.onsuccess = () => {
            if (expectedUpdatedAt === null ? !!read.result : read.result?.updatedAt !== expectedUpdatedAt) conflict = true
            else write()
          }
        }
      }
      if (operationId) {
        const outcome = outcomes.get(operationId)
        outcome.onsuccess = () => {
          if (outcome.result) identityConflict = outcome.result.template.id !== template.id
          else compareAndWrite()
        }
      } else compareAndWrite()
      await completed
      if (identityConflict) throw new Error('Workout operation identity conflict')
      if (conflict) throw new Error('Workout changed in another editor. Your draft is retained.')
    },
    async remove(id) {
      const database = await openDatabase()
      const transaction = database.transaction(WORKOUTS_STORE, 'readwrite')
      transaction.objectStore(WORKOUTS_STORE).delete(id)
      await transactionComplete(transaction)
    },
    async replaceAll(templates) {
      const database = await openDatabase()
      await replaceTransaction(database, [WORKOUTS_STORE], transaction => {
        const store = transaction.objectStore(WORKOUTS_STORE)
        store.clear()
        templates.forEach((template) => store.put(template))
      })
    },
    async close() {
      if (!databasePromise) return
      const database = await databasePromise
      database.close()
      databasePromise = null
    },
  }
}
