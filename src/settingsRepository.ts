import type { AppSettings, SettingsRepository } from './settings'

const SETTINGS_DATABASE_VERSION = 1
const SETTINGS_STORE = 'settings'
const APP_SETTINGS_KEY = 'app'

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
  })
}

export function createIndexedDbSettingsRepository(databaseName = 'spottr-v1-settings'): SettingsRepository {
  let databasePromise: Promise<IDBDatabase> | null = null

  function openDatabase() {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, SETTINGS_DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SETTINGS_STORE)) request.result.createObjectStore(SETTINGS_STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        databasePromise = null
        reject(request.error ?? new Error('Spottr could not open settings storage'))
      }
      request.onblocked = () => {
        databasePromise = null
        reject(new Error('Spottr settings storage is blocked by another tab'))
      }
    })
    return databasePromise
  }

  return {
    async get() {
      const database = await openDatabase()
      const result = await requestResult(database.transaction(SETTINGS_STORE).objectStore(SETTINGS_STORE).get(APP_SETTINGS_KEY))
      return (result as AppSettings | undefined) ?? null
    },
    async save(settings) {
      const database = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(SETTINGS_STORE, 'readwrite')
        transaction.objectStore(SETTINGS_STORE).put(settings, APP_SETTINGS_KEY)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('Local storage transaction failed'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was cancelled'))
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
