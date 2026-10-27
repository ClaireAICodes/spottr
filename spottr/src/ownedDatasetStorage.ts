// Private storage binding for the default persistent graph only. No service or
// published root exposes replay; callers hold exclusive dataset ownership.
import { assertStoredBackup, type SpottrBackup, importExercise } from './backup'
import { DEFAULT_SETTINGS } from './settings'
import { WORKOUT_DATABASE_VERSION, UPDATE_OUTCOMES_STORE } from './workoutRepository'

type Row = { key: string; value: unknown }
type StoreSnapshot = { name: string; rows: Row[] }
export type StoredDataset = { schema: 1; databases: StoreSnapshot[][] }
const layout = [
  { name: 'spottr-v1', version: 2, stores: [['gyms', 'id'], ['settings', null]] },
  { name: 'spottr-v1-exercises', version: 1, stores: [['exercises', 'id']] },
  { name: 'spottr-v1-workouts', version: 1, stores: [['workouts', 'id']] },
  { name: 'spottr-v1-sessions', version: 1, stores: [['sessions', null]] },
  { name: 'spottr-v1-settings', version: 1, stores: [['settings', null]] },
] as const
export const persistentStorageIdentity = JSON.stringify(layout)

async function open(index: number) {
  const spec = layout[index]
  return new Promise<IDBDatabase>((resolve, reject) => {
    // The logical replay/backup layout and its identity remain unchanged.
    // Workout retry evidence is a physical local-only store, not saved data.
    const workoutStorage = spec.name === 'spottr-v1-workouts'
    const request = indexedDB.open(spec.name, workoutStorage ? WORKOUT_DATABASE_VERSION : spec.version)
    let blocked = false
    request.onupgradeneeded = () => {
      if (workoutStorage && !request.result.objectStoreNames.contains(UPDATE_OUTCOMES_STORE)) {
        request.result.createObjectStore(UPDATE_OUTCOMES_STORE, { keyPath: 'id' })
      }
      for (const [name, keyPath] of spec.stores) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, keyPath ? { keyPath } : undefined)
      }
    }
    request.onblocked = () => { blocked = true; reject(new Error('Recovery storage is blocked by another tab')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      if (blocked) { db.close(); return }
      try {
        if (db.objectStoreNames.length !== spec.stores.length + (workoutStorage ? 1 : 0)) throw new Error('Unexpected recovery storage schema')
        if (workoutStorage && db.transaction(UPDATE_OUTCOMES_STORE).objectStore(UPDATE_OUTCOMES_STORE).keyPath !== 'id') throw new Error('Unexpected local outcome schema')
        const tx = db.transaction(spec.stores.map(([name]) => name))
        for (const [name, keyPath] of spec.stores) if (tx.objectStore(name).keyPath !== keyPath) throw new Error('Unexpected recovery key schema')
        resolve(db)
      } catch (error) { db.close(); reject(error) }
    }
  })
}
function sorted(rows: Row[]) { return rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) }
function store(name: string, rows: Row[]): StoreSnapshot { return { name, rows: sorted(rows) } }
function keyed(name: string, values: Array<{ id: string }>) { return store(name, values.map(value => ({ key: value.id, value }))) }

export function incomingStorage(backup: SpottrBackup): StoredDataset {
  const { entities } = backup
  return { schema: 1, databases: [
    [keyed('gyms', entities.gyms), store('settings', entities.selectedGymId ? [{ key: 'selectedGymId', value: entities.selectedGymId }] : [])],
    [keyed('exercises', entities.exercises.map(importExercise))],
    [keyed('workouts', entities.workouts)],
    [store('sessions', [
      ...(entities.activeSession ? [{ key: 'active', value: entities.activeSession }] : []),
      ...entities.completedSessions.map(value => ({ key: `history:${value.id}`, value })),
    ])],
    [store('settings', [{ key: 'app', value: backup.settings }])],
  ] }
}

export async function validateStoredDataset(value: unknown): Promise<StoredDataset> {
  const snapshot = value as StoredDataset
  if (!snapshot || snapshot.schema !== 1 || Object.keys(snapshot).sort().join(',') !== 'databases,schema'
    || !Array.isArray(snapshot.databases) || snapshot.databases.length !== layout.length) throw new Error('Invalid stored dataset envelope')
  for (let d = 0; d < layout.length; d++) {
    const stores = snapshot.databases[d]
    if (!Array.isArray(stores) || stores.length !== layout[d].stores.length) throw new Error('Invalid stored database')
    for (let s = 0; s < stores.length; s++) {
      const item = stores[s], [name, keyPath] = layout[d].stores[s]
      if (!item || item.name !== name || Object.keys(item).sort().join(',') !== 'name,rows' || !Array.isArray(item.rows)) throw new Error('Invalid stored object store')
      let previous: string | undefined
      for (const row of item.rows) {
        if (!row || Object.keys(row).sort().join(',') !== 'key,value' || typeof row.key !== 'string'
          || (previous !== undefined && previous >= row.key)) throw new Error('Invalid stored key ordering')
        previous = row.key
        if (keyPath && (!row.value || (row.value as { id: unknown }).id !== row.key)) throw new Error('Stored row identity mismatch')
        if (!keyPath) {
          const allowed = d === 0 ? row.key === 'selectedGymId' : d === 4 ? row.key === 'app'
            : row.key === 'active' || (row.value && row.key === `history:${(row.value as { id: unknown }).id}`)
          if (!allowed || row.value === null || row.value === undefined) throw new Error('Invalid stored singleton')
        }
      }
    }
  }
  const rows = (d: number, s = 0) => snapshot.databases[d][s].rows.map(row => row.value)
  const sessionRows = snapshot.databases[3][0].rows
  await assertStoredBackup({
    format: 'spottr-backup', version: 1, exportedAt: new Date().toISOString(),
    entities: { gyms: rows(0), selectedGymId: rows(0, 1)[0] ?? null,
      exercises: rows(1), workouts: rows(2),
      activeSession: sessionRows.find(row => row.key === 'active')?.value ?? null,
      completedSessions: sessionRows.filter(row => row.key.startsWith('history:')).map(row => row.value)
        .sort((a, b) => String((b as { endedAt: string }).endedAt).localeCompare(String((a as { endedAt: string }).endedAt))),
    }, settings: rows(4)[0] ?? DEFAULT_SETTINGS,
  })
  return snapshot
}

export function createOwnedDatasetStorage() {
  async function capture(): Promise<StoredDataset> {
    const databases: StoreSnapshot[][] = []
    for (let index = 0; index < layout.length; index++) {
      const db = await open(index)
      try {
        databases.push(await new Promise<StoreSnapshot[]>((resolve, reject) => {
          const tx = db.transaction(layout[index].stores.map(([name]) => name), 'readonly')
          const result = layout[index].stores.map(([name]) => store(name, []))
          tx.oncomplete = () => resolve(result)
          tx.onabort = () => reject(tx.error ?? new Error('Snapshot aborted'))
          result.forEach(item => {
            const request = tx.objectStore(item.name).openCursor()
            request.onsuccess = () => {
              const cursor = request.result
              if (!cursor) return
              if (typeof cursor.key !== 'string') { tx.abort(); return }
              item.rows.push({ key: cursor.key, value: cursor.value })
              cursor.continue()
            }
          })
        }))
      } finally { db.close() }
    }
    return validateStoredDataset({ schema: 1, databases })
  }
  async function replay(value: unknown) {
    const snapshot = await validateStoredDataset(value)
    for (let index = 0; index < layout.length; index++) {
      const db = await open(index)
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(layout[index].stores.map(([name]) => name), 'readwrite')
          let failure: unknown
          tx.oncomplete = () => resolve()
          tx.onabort = () => reject(failure ?? tx.error ?? new Error('Recovery transaction aborted'))
          try {
            for (const item of snapshot.databases[index]) {
              const target = tx.objectStore(item.name)
              target.clear()
              for (const row of item.rows) {
                if (target.keyPath) target.put(row.value)
                else target.put(row.value, row.key)
              }
            }
          } catch (error) { failure = error; tx.abort() }
        })
      } finally { db.close() }
    }
  }
  return { capture, replay }
}
