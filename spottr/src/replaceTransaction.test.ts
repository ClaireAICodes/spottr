import 'fake-indexeddb/auto'
import { replaceTransaction } from './replaceTransaction'

async function withDatabase(run: (database: IDBDatabase) => Promise<void>) {
  const name = `replacement-cancellation-${crypto.randomUUID()}`
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('settings')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try { await run(database) } finally {
    database.close()
    indexedDB.deleteDatabase(name)
  }
}

it('reports a cause-free abort as cancellation, preserves committed settings and permits retry', async () => {
  await withDatabase(async database => {
    await replaceTransaction(database, ['settings'], tx => { tx.objectStore('settings').put(60, 'rest') })
    await expect(replaceTransaction(database, ['settings'], tx => {
      const store = tx.objectStore('settings')
      store.clear()
      store.put(120, 'rest').onsuccess = () => tx.abort()
    })).rejects.toMatchObject({ name: 'AbortError', message: 'Local storage transaction was cancelled. Your changes were not saved. Try again.' })
    const read = () => new Promise<unknown>((resolve, reject) => {
      const request = database.transaction('settings').objectStore('settings').get('rest')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect(await read()).toBe(60)
    await replaceTransaction(database, ['settings'], tx => { tx.objectStore('settings').put(120, 'rest') })
    expect(await read()).toBe(120)
  })
})

it.each([
  new DOMException('Storage is full', 'QuotaExceededError'),
  new DOMException('Cannot clone input', 'DataCloneError'),
])('preserves the original scheduled-write failure: $name', async cause => {
  await withDatabase(async database => {
    await expect(replaceTransaction(database, ['settings'], () => { throw cause })).rejects.toBe(cause)
  })
})
