// Attach terminal handlers before scheduling replacement writes. Synchronous
// DataCloneError/put failures abort the whole transaction, never a partial clear.
export function replaceTransaction(database: IDBDatabase, stores: string[], schedule: (tx: IDBTransaction) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(stores, 'readwrite')
    let failure: unknown
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Replacement transaction aborted'))
    try { schedule(tx) } catch (error) { failure = error; tx.abort() }
  })
}
