import type { CompletedWorkoutSession, SessionRepository, WorkoutSession } from './sessions'

const SESSION_DATABASE_VERSION = 1
const SESSIONS_STORE = 'sessions'
const ACTIVE_SESSION_KEY = 'active'
const HISTORY_KEY_PREFIX = 'history:'

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSessionSet(value: unknown) {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && (value.templateSetId === undefined || typeof value.templateSetId === 'string')
    && (value.kind === 'warm-up' || value.kind === 'working' || value.kind === 'drop')
    && typeof value.targetWeight === 'number'
    && typeof value.targetReps === 'number'
    && typeof value.weight === 'number'
    && typeof value.reps === 'number'
    && (value.completedAt === null || typeof value.completedAt === 'string')
    && (value.skippedAt === null || typeof value.skippedAt === 'string')
    && (value.personalRecords === undefined || (Array.isArray(value.personalRecords)
      && value.personalRecords.every((record) => record === 'weight' || record === 'set-volume')))
    && (value.targetDecision === undefined
      || value.targetDecision === 'accepting'
      || value.targetDecision === 'declining'
      || value.targetDecision === 'accepted'
      || value.targetDecision === 'declined')
    && (value.targetDecisionPreviousTarget === undefined
      || (isRecord(value.targetDecisionPreviousTarget)
        && typeof value.targetDecisionPreviousTarget.weight === 'number'
        && typeof value.targetDecisionPreviousTarget.reps === 'number'))
}

function isSessionExercise(value: unknown) {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && (value.templateExerciseId === undefined || typeof value.templateExerciseId === 'string')
    && typeof value.exerciseId === 'string'
    && typeof value.name === 'string'
    && Array.isArray(value.sets)
    && value.sets.every(isSessionSet)
}

function isCompletedWorkoutSession(value: unknown): value is CompletedWorkoutSession {
  if (!isRecord(value) || !isRecord(value.summary)) return false
  return typeof value.id === 'string'
    && typeof value.templateId === 'string'
    && typeof value.name === 'string'
    && typeof value.gymId === 'string'
    && typeof value.gymName === 'string'
    && Array.isArray(value.exercises)
    && value.exercises.every(isSessionExercise)
    && typeof value.startedAt === 'string'
    && typeof value.updatedAt === 'string'
    && typeof value.endedAt === 'string'
    && typeof value.summary.completedExercises === 'number'
    && typeof value.summary.skippedExercises === 'number'
    && typeof value.summary.completedSets === 'number'
    && typeof value.summary.skippedSets === 'number'
    && typeof value.summary.volume === 'number'
    && typeof value.summary.durationSeconds === 'number'
}

export function createIndexedDbSessionRepository(databaseName = 'spottr-v1-sessions'): SessionRepository {
  let databasePromise: Promise<IDBDatabase> | null = null

  function openDatabase() {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, SESSION_DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SESSIONS_STORE)) {
          request.result.createObjectStore(SESSIONS_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        databasePromise = null
        reject(request.error ?? new Error('Spottr could not open session storage'))
      }
      request.onblocked = () => {
        databasePromise = null
        reject(new Error('Spottr session storage is blocked by another tab'))
      }
    })
    return databasePromise
  }

  return {
    async getActive() {
      const database = await openDatabase()
      const result = await requestResult(database.transaction(SESSIONS_STORE).objectStore(SESSIONS_STORE).get(ACTIVE_SESSION_KEY))
      return (result as WorkoutSession | undefined) ?? null
    },
    async createActive(session) {
      const database = await openDatabase()
      return new Promise<boolean>((resolve, reject) => {
        const transaction = database.transaction(SESSIONS_STORE, 'readwrite')
        const store = transaction.objectStore(SESSIONS_STORE)
        const request = store.get(ACTIVE_SESSION_KEY)
        let created = false
        request.onsuccess = () => {
          if (request.result) return
          created = true
          store.put(session, ACTIVE_SESSION_KEY)
        }
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
        transaction.oncomplete = () => resolve(created)
        transaction.onerror = () => reject(transaction.error ?? new Error('Local storage transaction failed'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was cancelled'))
      })
    },
    async updateActive(update) {
      const database = await openDatabase()
      return new Promise<WorkoutSession>((resolve, reject) => {
        const transaction = database.transaction(SESSIONS_STORE, 'readwrite')
        const store = transaction.objectStore(SESSIONS_STORE)
        const request = store.get(ACTIVE_SESSION_KEY)
        let updated: WorkoutSession | null = null
        let updateError: unknown
        request.onsuccess = () => {
          try {
            if (!request.result) throw new Error('No active session')
            updated = update(request.result as WorkoutSession)
            store.put(updated, ACTIVE_SESSION_KEY)
          } catch (error) {
            updateError = error
            transaction.abort()
          }
        }
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
        transaction.oncomplete = () => {
          if (updated) resolve(updated)
        }
        transaction.onerror = () => reject(updateError ?? transaction.error ?? new Error('Local storage transaction failed'))
        transaction.onabort = () => reject(updateError ?? transaction.error ?? new Error('Local storage transaction was cancelled'))
      })
    },
    async completeActive(expectedSessionId, complete) {
      const database = await openDatabase()
      return new Promise<CompletedWorkoutSession>((resolve, reject) => {
        const transaction = database.transaction(SESSIONS_STORE, 'readwrite')
        const store = transaction.objectStore(SESSIONS_STORE)
        const request = store.get(ACTIVE_SESSION_KEY)
        let completed: CompletedWorkoutSession | null = null
        let completionError: unknown
        request.onsuccess = () => {
          try {
            if (!request.result) throw new Error('No active session')
            const active = request.result as WorkoutSession
            if (active.id !== expectedSessionId) throw new Error('Active session changed before completion')
            completed = complete(active)
            store.put(completed, `${HISTORY_KEY_PREFIX}${completed.id}`)
            store.delete(ACTIVE_SESSION_KEY)
          } catch (error) {
            completionError = error
            transaction.abort()
          }
        }
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
        transaction.oncomplete = () => {
          if (completed) resolve(completed)
        }
        transaction.onerror = () => reject(completionError ?? transaction.error ?? new Error('Local storage transaction failed'))
        transaction.onabort = () => reject(completionError ?? transaction.error ?? new Error('Local storage transaction was cancelled'))
      })
    },
    async listHistory() {
      const database = await openDatabase()
      const results = await requestResult(database.transaction(SESSIONS_STORE).objectStore(SESSIONS_STORE).getAll())
      return (results as unknown[]).filter(isCompletedWorkoutSession)
    },
    async getHistory(id) {
      const database = await openDatabase()
      const result = await requestResult(database.transaction(SESSIONS_STORE).objectStore(SESSIONS_STORE).get(`${HISTORY_KEY_PREFIX}${id}`))
      return (result as CompletedWorkoutSession | undefined) ?? null
    },
    async updateHistory(id, update) {
      const database = await openDatabase()
      return new Promise<CompletedWorkoutSession>((resolve, reject) => {
        const transaction = database.transaction(SESSIONS_STORE, 'readwrite')
        const store = transaction.objectStore(SESSIONS_STORE)
        const request = store.get(`${HISTORY_KEY_PREFIX}${id}`)
        let updated: CompletedWorkoutSession | null = null
        let updateError: unknown
        request.onsuccess = () => {
          try {
            if (!request.result) throw new Error('Completed workout not found')
            updated = update(request.result as CompletedWorkoutSession)
            store.put(updated, `${HISTORY_KEY_PREFIX}${id}`)
          } catch (error) {
            updateError = error
            transaction.abort()
          }
        }
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed'))
        transaction.oncomplete = () => { if (updated) resolve(updated) }
        transaction.onerror = () => reject(updateError ?? transaction.error ?? new Error('Local storage transaction failed'))
        transaction.onabort = () => reject(updateError ?? transaction.error ?? new Error('Local storage transaction was cancelled'))
      })
    },
    async replaceAll(active, history) {
      const database = await openDatabase()
      const transaction = database.transaction(SESSIONS_STORE, 'readwrite')
      const store = transaction.objectStore(SESSIONS_STORE)
      store.clear()
      if (active) store.put(active, ACTIVE_SESSION_KEY)
      history.forEach((session) => store.put(session, `${HISTORY_KEY_PREFIX}${session.id}`))
      await new Promise<void>((resolve, reject) => {
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
