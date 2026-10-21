// Internal undo protocol. All methods require the caller to hold the dataset's
// exclusive ownership. This module never acquires a public service/root lock.
// Composition supplies the private schema-validated storage binding. No public
// service accepts a journal payload or exposes persisted-snapshot replay.
export type JournalRecord = {
  format: 'spottr-restore-journal'
  version: 1
  identity: string
  restoreId: string
  phase: 'PREPARED' | 'APPLYING' | 'ROLLING_BACK' | 'COMMITTED'
  before: unknown
  afterSeal: string
  seal: string
}
export type JournalStore = {
  read(): Promise<unknown | null>
  write(record: JournalRecord): Promise<void>
  clear(): Promise<void>
}

async function canonical(value: unknown): Promise<string> {
  if (value === null) return '["null"]'
  if (value === undefined) return '["undefined"]'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify([typeof value, value])
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(['number', value])
  if (Object.prototype.toString.call(value) === '[object Blob]') {
    const blob = value as Blob
    const bytes = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    })
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return JSON.stringify(['blob', blob.type, blob.size, Array.from(new Uint8Array(digest))])
  }
  if (Array.isArray(value)) return `["array",[${(await Promise.all(value.map(canonical))).join(',')}]]`
  if (typeof value === 'object' && value && Object.prototype.toString.call(value) === '[object Object]') {
    return `["object",{${(await Promise.all(Object.keys(value).sort().map(async key => `${JSON.stringify(key)}:${await canonical((value as Record<string, unknown>)[key])}`))).join(',')}}]`
  }
  throw new Error('Unsupported stored value in restore journal')
}
export async function snapshotSeal(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(await canonical(value))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
function payload(record: JournalRecord) {
  const { seal: _seal, ...value } = record
  return value
}

export function createRestoreJournal(binding: {
  identity: string | (() => Promise<string>)
  store: JournalStore
  capture(): Promise<unknown>
  replay(snapshot: unknown): Promise<void>
  invalidate(): Promise<void>
}) {
  const { identity, store } = binding
  const resolvedIdentity = () => typeof identity === 'string' ? Promise.resolve(identity) : identity()
  async function inspect(): Promise<JournalRecord | null> {
    const value = await store.read()
    const expectedIdentity = await resolvedIdentity()
    if (value === null) return null
    const record = value as JournalRecord
    if (!record || record.format !== 'spottr-restore-journal' || record.version !== 1
      || record.identity !== expectedIdentity || typeof record.restoreId !== 'string' || !record.restoreId
      || !['PREPARED', 'APPLYING', 'ROLLING_BACK', 'COMMITTED'].includes(record.phase)
      || Object.keys(record).sort().join(',') !== 'afterSeal,before,format,identity,phase,restoreId,seal,version'
      || !/^[0-9a-f]{64}$/.test(record.afterSeal)
      || typeof record.seal !== 'string' || await snapshotSeal(payload(record)) !== record.seal) {
      throw new Error('Invalid or incompatible restore journal; retain storage and retry recovery')
    }
    return record
  }
  async function persist(record: JournalRecord) {
    record.seal = await snapshotSeal(payload(record))
    let failure: unknown
    try { await store.write(record) } catch (error) { failure = error }
    // A rejected acknowledgement is not proof that the transaction aborted.
    const actual = await inspect()
    if (!actual || actual.seal !== record.seal) throw failure ?? new Error('Restore journal write was not acknowledged')
    return actual
  }
  async function clean() {
    let failure: unknown
    try { await store.clear() } catch (error) { failure = error }
    if (await store.read() !== null) throw failure ?? new Error('Restore journal cleanup was not acknowledged')
  }
  return {
    inspect,
    async prepare(expectedAfter: unknown) {
      if (await inspect()) throw new Error('Restore journal recovery is required before replacement')
      const before = await binding.capture()
      const afterSeal = await snapshotSeal(expectedAfter)
      await persist({ format: 'spottr-restore-journal', version: 1, identity: await resolvedIdentity(),
        restoreId: crypto.randomUUID(), phase: 'PREPARED', before, afterSeal, seal: '' })
    },
    async begin() {
      const record = await inspect()
      if (!record || record.phase !== 'PREPARED') throw new Error('No prepared restore journal')
      await binding.invalidate()
      await persist({ ...record, phase: 'APPLYING' })
    },
    async commit() {
      const record = await inspect()
      if (!record || record.phase !== 'APPLYING') throw new Error('No applying restore journal')
      if (await snapshotSeal(await binding.capture()) !== record.afterSeal) {
        throw new Error('Replacement dataset does not match the prepared restore target')
      }
      await persist({ ...record, phase: 'COMMITTED' })
      // Cleanup failure MUST NOT be interpreted by the caller as permission to
      // compensate: recover() classifies the durable phase again.
      await clean()
    },
    async startRollback() {
      const record = await inspect()
      if (!record || record.phase === 'COMMITTED') throw new Error('No uncommitted restore journal')
      await binding.invalidate()
      await persist({ ...record, phase: 'ROLLING_BACK' })
    },
    async recover() {
      const record = await inspect()
      if (!record) return
      if (record.phase === 'COMMITTED') {
        if (await snapshotSeal(await binding.capture()) !== record.afterSeal) {
          throw new Error('Committed dataset does not match restore journal; retain storage')
        }
      } else {
        await binding.invalidate()
        await persist({ ...record, phase: 'ROLLING_BACK' })
        await binding.replay(record.before)
        if (await snapshotSeal(await binding.capture()) !== await snapshotSeal(record.before)) {
          throw new Error('Recovered dataset does not match restore journal; retain storage')
        }
      }
      await clean()
    },
  }
}

export function createIndexedDbJournalStore(databaseName: string) {
  async function open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      let rejected = false
      request.onupgradeneeded = () => { request.result.createObjectStore('journal') }
      request.onsuccess = () => {
        if (rejected) request.result.close()
        else resolve(request.result)
      }
      request.onerror = () => reject(request.error ?? new Error('Restore journal unavailable'))
      request.onblocked = () => { rejected = true; reject(new Error('Restore journal blocked by another tab')) }
    })
  }
  async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = database.transaction('journal', mode)
        let result: T
        let failure: unknown
        tx.oncomplete = () => resolve(result)
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Restore journal transaction aborted'))
        // Only terminal abort/complete acknowledges the transaction, not a request.
        tx.onerror = () => { failure ??= tx.error }
        try {
          const request = operation(tx.objectStore('journal'))
          request.onsuccess = () => { result = request.result }
          request.onerror = () => { failure = request.error }
        } catch (error) { failure = error; tx.abort() }
      })
    } finally { database.close() }
  }
  return {
    async getInstanceId(): Promise<string> {
      const db = await open()
      try {
        return await new Promise<string>((resolve, reject) => {
          const tx = db.transaction('journal', 'readwrite')
          const target = tx.objectStore('journal')
          let id: string
          let failure: unknown
          tx.oncomplete = () => resolve(id)
          tx.onabort = () => reject(failure ?? tx.error ?? new Error('Dataset identity unavailable'))
          const request = target.openCursor(IDBKeyRange.only('instance'))
          request.onsuccess = () => {
            try {
              const cursor = request.result
              if (cursor) {
                if (typeof cursor.value !== 'string' || !cursor.value) throw new Error('Invalid dataset instance identity')
                id = cursor.value
              } else {
                const active = target.count('active')
                active.onsuccess = () => {
                  if (active.result) { failure = new Error('Journal has no dataset instance identity'); tx.abort(); return }
                  id = crypto.randomUUID()
                  target.put(id, 'instance')
                }
              }
            } catch (error) { failure = error; tx.abort() }
          }
        })
      } finally { db.close() }
    },
    read: async () => {
      const cursor = await transaction('readonly', store => store.openCursor(IDBKeyRange.only('active')))
      // A present null/undefined value is corruption, not an empty journal.
      return cursor ? (cursor.value ?? { invalidStoredJournalValue: true }) : null
    },
    write: async (record: JournalRecord) => { await transaction('readwrite', store => store.put(record, 'active')) },
    clear: async () => { await transaction('readwrite', store => store.delete('active')) },
  }
}
