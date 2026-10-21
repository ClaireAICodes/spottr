import 'fake-indexeddb/auto'
import { Blob } from 'node:buffer'
import { createRestoreJournal, createIndexedDbJournalStore, type JournalRecord, type JournalStore } from './restoreJournal'

function fixture(store: JournalStore, initial: unknown = { rows: ['old'] }) {
  let data = initial
  let failReplay = false
  const journal = createRestoreJournal({
    identity: 'test-dataset-v1', store,
    capture: async () => structuredClone(data),
    replay: async snapshot => { if (failReplay) throw new Error('Replay failed'); data = structuredClone(snapshot) },
    invalidate: async () => undefined,
  })
  return { journal, get: () => data, set: (next: unknown) => { data = next }, failReplay: (value: boolean) => { failReplay = value } }
}

it.each([null, undefined])('rejects a stored malformed %s journal value', async value => {
  const name = `journal-${crypto.randomUUID()}`
  const store = createIndexedDbJournalStore(name)
  expect(await store.read()).toBeNull()
  await new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(name, 1)
    opening.onsuccess = () => {
      const db = opening.result
      const tx = db.transaction('journal', 'readwrite')
      tx.objectStore('journal').put(value, 'active')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })
  await expect(fixture(store).journal.recover()).rejects.toThrow('journal')
})

it('acknowledges PREPARED separately before entering APPLYING', async () => {
  const store = createIndexedDbJournalStore(`journal-${crypto.randomUUID()}`)
  const state = fixture(store)
  await state.journal.prepare({ rows: ['new'] })
  expect((await store.read() as JournalRecord).phase).toBe('PREPARED')
  await state.journal.begin()
  expect((await store.read() as JournalRecord).phase).toBe('APPLYING')
  await state.journal.recover()
  expect(await store.read()).toBeNull()
})

it('persists an uncommitted full Blob snapshot and recovers with a fresh journal object', async () => {
  const name = `journal-${crypto.randomUUID()}`
  const store = createIndexedDbJournalStore(name)
  const before = { media: [new Blob(['first']), new Blob(['second'])], selected: null }
  const first = fixture(store, before)
  await first.journal.prepare({ media: [], selected: 'new' })
  first.set({ media: [], selected: 'new' })
  // Deliberately abandon the first orchestrator; no in-page compensation.
  const second = fixture(createIndexedDbJournalStore(name), first.get())
  await second.journal.recover()
  const recovered = second.get() as typeof before
  expect(await recovered.media[0].text()).toBe('first')
  expect(await recovered.media[1].text()).toBe('second')
  expect(recovered.selected).toBeNull()
  expect(await store.read()).toBeNull()
})

it('rejects quota before mutation and never installs an incomplete record', async () => {
  const quota = new DOMException('Full', 'QuotaExceededError')
  const store: JournalStore = { read: async () => null, write: async () => { throw quota }, clear: async () => undefined }
  const state = fixture(store)
  await expect(state.journal.prepare({ rows: ['new'] })).rejects.toThrow('Full')
  expect(state.get()).toEqual({ rows: ['old'] })
})

it('retains failed rollback for explicit retry and does not discard corrupt records', async () => {
  const store = createIndexedDbJournalStore(`journal-${crypto.randomUUID()}`)
  const state = fixture(store)
  await state.journal.prepare({ rows: ['new'] })
  state.set({ rows: ['mixed'] })
  state.failReplay(true)
  await expect(state.journal.recover()).rejects.toThrow('Replay failed')
  expect(await store.read()).not.toBeNull()
  state.failReplay(false)
  await state.journal.recover()
  expect(state.get()).toEqual({ rows: ['old'] })
  await state.journal.prepare({ rows: ['new'] })
  const record = await store.read() as JournalRecord
  await store.write({ ...record, identity: 'other-dataset' })
  await expect(state.journal.recover()).rejects.toThrow('journal')
  expect(await store.read()).not.toBeNull()
})

it('binds phase and Blob bytes to the seal', async () => {
  const store = createIndexedDbJournalStore(`journal-${crypto.randomUUID()}`)
  const state = fixture(store, { blob: new Blob(['old']) })
  await state.journal.prepare({ blob: new Blob(['new']) })
  const record = await store.read() as JournalRecord
  await store.write({ ...record, phase: 'COMMITTED' })
  await expect(state.journal.recover()).rejects.toThrow('journal')
  await store.write({ ...record, before: { blob: new Blob(['bad']) } })
  await expect(state.journal.recover()).rejects.toThrow('journal')
  expect(await store.read()).not.toBeNull()
})

it('never undoes COMMITTED and blocks on mismatch or cleanup failure', async () => {
  const disk = createIndexedDbJournalStore(`journal-${crypto.randomUUID()}`)
  let failClear = true
  const store: JournalStore = { ...disk, clear: async () => { if (failClear) throw new Error('Cleanup failed'); await disk.clear() } }
  const state = fixture(store)
  await state.journal.prepare({ rows: ['new'] })
  state.set({ rows: ['new'] })
  await state.journal.begin()
  await expect(state.journal.commit()).rejects.toThrow('Cleanup failed')
  expect((await disk.read() as JournalRecord).phase).toBe('COMMITTED')
  state.set({ rows: ['unexpected'] })
  await expect(state.journal.recover()).rejects.toThrow('Committed dataset')
  expect(state.get()).toEqual({ rows: ['unexpected'] })
  state.set({ rows: ['new'] })
  failClear = false
  await state.journal.recover()
  expect(state.get()).toEqual({ rows: ['new'] })
  expect(await disk.read()).toBeNull()
})

it('refuses to mark a mixed replacement COMMITTED and recovers to the complete old state', async () => {
  const store = createIndexedDbJournalStore(`journal-${crypto.randomUUID()}`)
  const state = fixture(store)
  await state.journal.prepare({ rows: ['new'] })
  state.set({ rows: ['mixed'] })
  await state.journal.begin()
  await expect(state.journal.commit()).rejects.toThrow('prepared restore target')
  expect((await store.read() as JournalRecord).phase).toBe('APPLYING')
  await state.journal.recover()
  expect(state.get()).toEqual({ rows: ['old'] })
})

it('resolves lost write/delete acknowledgements from persisted state', async () => {
  const disk = createIndexedDbJournalStore(`journal-${crypto.randomUUID()}`)
  const store: JournalStore = {
    read: disk.read,
    write: async value => { await disk.write(value); throw new Error('Lost acknowledgement') },
    clear: async () => { await disk.clear(); throw new Error('Lost acknowledgement') },
  }
  const state = fixture(store)
  await state.journal.prepare({ rows: ['new'] })
  state.set({ rows: ['new'] })
  await state.journal.begin()
  await state.journal.commit()
  expect(state.get()).toEqual({ rows: ['new'] })
  expect(await disk.read()).toBeNull()
})
