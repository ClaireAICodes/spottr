import type { Gym, GymRepository } from './gyms'

export const GYM_DATABASE_VERSION = 2
const GYMS_STORE = 'gyms'
const SETTINGS_STORE = 'settings'
const SELECTED_GYM_KEY = 'selectedGymId'

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

export function createIndexedDbGymRepository(databaseName = 'spottr-v1'): GymRepository {
  let databasePromise: Promise<IDBDatabase> | null = null

  function openDatabase() {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, GYM_DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(GYMS_STORE)) {
          database.createObjectStore(GYMS_STORE, { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
          database.createObjectStore(SETTINGS_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        databasePromise = null
        reject(request.error ?? new Error('Spottr could not open local storage'))
      }
      request.onblocked = () => {
        databasePromise = null
        reject(new Error('Spottr local storage upgrade is blocked by another tab'))
      }
    })
    return databasePromise
  }

  return {
    async list() {
      const database = await openDatabase()
      const request = database.transaction(GYMS_STORE).objectStore(GYMS_STORE).getAll()
      return requestResult(request) as Promise<Gym[]>
    },

    async get(id) {
      const database = await openDatabase()
      const request = database.transaction(GYMS_STORE).objectStore(GYMS_STORE).get(id)
      return ((await requestResult(request)) as Gym | undefined) ?? null
    },

    async save(gym) {
      const database = await openDatabase()
      const transaction = database.transaction(GYMS_STORE, 'readwrite')
      transaction.objectStore(GYMS_STORE).put(gym)
      await transactionComplete(transaction)
    },

    async saveAndSelectIfNone(gym) {
      const database = await openDatabase()
      const transaction = database.transaction([GYMS_STORE, SETTINGS_STORE], 'readwrite')
      const settings = transaction.objectStore(SETTINGS_STORE)
      const selectedRequest = settings.get(SELECTED_GYM_KEY)
      selectedRequest.onsuccess = () => {
        transaction.objectStore(GYMS_STORE).put(gym)
        if (!selectedRequest.result) settings.put(gym.id, SELECTED_GYM_KEY)
      }
      await transactionComplete(transaction)
    },

    async remove(id) {
      const database = await openDatabase()
      const transaction = database.transaction([GYMS_STORE, SETTINGS_STORE], 'readwrite')
      transaction.objectStore(GYMS_STORE).delete(id)
      const settings = transaction.objectStore(SETTINGS_STORE)
      const selectedRequest = settings.get(SELECTED_GYM_KEY)
      selectedRequest.onsuccess = () => {
        if (selectedRequest.result === id) settings.delete(SELECTED_GYM_KEY)
      }
      await transactionComplete(transaction)
    },

    async select(id) {
      const database = await openDatabase()
      const transaction = database.transaction(SETTINGS_STORE, 'readwrite')
      const store = transaction.objectStore(SETTINGS_STORE)
      if (id) store.put(id, SELECTED_GYM_KEY)
      else store.delete(SELECTED_GYM_KEY)
      await transactionComplete(transaction)
    },

    async getSelectedId() {
      const database = await openDatabase()
      const request = database.transaction(SETTINGS_STORE).objectStore(SETTINGS_STORE).get(SELECTED_GYM_KEY)
      return ((await requestResult(request)) as string | undefined) ?? null
    },

    async close() {
      if (!databasePromise) return
      const database = await databasePromise
      database.close()
      databasePromise = null
    },
  }
}
