import type { Exercise, ExerciseMedia, ExerciseRepository } from './exercises'

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

  async function mutateMedia(
    exerciseId: string,
    mutate: (media: ExerciseMedia[]) => ExerciseMedia[],
  ) {
    const database = await openDatabase()
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(EXERCISES_STORE, 'readwrite')
      const store = transaction.objectStore(EXERCISES_STORE)
      const request = store.get(exerciseId)
      let mutationError: Error | null = null
      request.onsuccess = () => {
        try {
          const exercise = request.result as Exercise | undefined
          if (!exercise) throw new Error('Exercise not found')
          store.put({ ...exercise, media: mutate(exercise.media ?? []) })
        } catch (caught) {
          mutationError = caught instanceof Error ? caught : new Error('Exercise media update failed')
          transaction.abort()
        }
      }
      request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(mutationError ?? transaction.error ?? new Error('Local storage transaction failed'))
      transaction.onabort = () => reject(mutationError ?? transaction.error ?? new Error('Local storage transaction was cancelled'))
    })
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
      const store = transaction.objectStore(EXERCISES_STORE)
      const existing = await requestResult(store.get(exercise.id)) as Exercise | undefined
      store.put({ ...exercise, media: existing?.media ?? exercise.media })
      await transactionComplete(transaction)
    },
    async addMedia(exerciseId, media, totalLimit) {
      const database = await openDatabase()
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(EXERCISES_STORE, 'readwrite')
        const store = transaction.objectStore(EXERCISES_STORE)
        const request = store.getAll()
        let mutationError: Error | null = null
        request.onsuccess = () => {
          try {
            const exercises = request.result as Exercise[]
            const exercise = exercises.find(({ id }) => id === exerciseId)
            if (!exercise) throw new Error('Exercise not found')
            const total = exercises.reduce(
              (sum, item) => sum + (item.media ?? []).reduce((mediaSum, entry) => mediaSum + entry.size, 0),
              0,
            )
            if (total + media.size > totalLimit) {
              throw new Error('Local media storage limit of 25 MB reached. Remove media before adding another file.')
            }
            store.put({ ...exercise, media: [...(exercise.media ?? []), media] })
          } catch (caught) {
            mutationError = caught instanceof Error ? caught : new Error('Exercise media could not be stored')
            transaction.abort()
          }
        }
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(mutationError ?? transaction.error ?? new Error('Local storage transaction failed'))
        transaction.onabort = () => reject(mutationError ?? transaction.error ?? new Error('Local storage transaction was cancelled'))
      })
    },
    async moveMedia(exerciseId, mediaId, direction) {
      await mutateMedia(exerciseId, (media) => {
        const next = [...media]
        const index = next.findIndex(({ id }) => id === mediaId)
        if (index < 0) throw new Error('Exercise media not found')
        const target = direction === 'up' ? index - 1 : index + 1
        if (target < 0 || target >= next.length) return next
        ;[next[index], next[target]] = [next[target], next[index]]
        return next
      })
    },
    async removeMedia(exerciseId, mediaId) {
      await mutateMedia(exerciseId, (media) => {
        const remaining = media.filter(({ id }) => id !== mediaId)
        if (remaining.length === media.length) throw new Error('Exercise media not found')
        return remaining
      })
    },
    async replaceAll(exercises) {
      const database = await openDatabase()
      const transaction = database.transaction(EXERCISES_STORE, 'readwrite')
      const store = transaction.objectStore(EXERCISES_STORE)
      store.clear()
      exercises.forEach((exercise) => store.put(exercise))
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
