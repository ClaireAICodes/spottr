import 'fake-indexeddb/auto'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createIndexedDbGymRepository, GYM_DATABASE_VERSION } from './gymRepository'

describe('gym profiles', () => {
  it('creates, edits, selects, and removes gyms through the service seam', async () => {
    const repository = createMemoryGymRepository()
    const service = createGymService(repository, {
      createId: () => 'gym-1',
      now: () => '2026-09-22T01:15:00.000Z',
    })

    const created = await service.create({ name: '  Northside  ', address: '  12 River Road  ' })
    expect(created).toMatchObject({ id: 'gym-1', name: 'Northside', address: '12 River Road' })
    expect(await service.getSelected()).toEqual(created)

    const edited = await service.update('gym-1', { name: 'Northside Strength', address: '12 River Road' })
    expect(edited.name).toBe('Northside Strength')

    await service.remove('gym-1')
    expect(await service.list()).toEqual([])
    expect(await service.getSelected()).toBeNull()
  })

  it('rejects a gym without a name while preserving manual address entry', async () => {
    const service = createGymService(createMemoryGymRepository())

    await expect(service.create({ name: ' ', address: 'Manual address' })).rejects.toThrow('Gym name is required')
  })

  it('does not leave a duplicate-prone gym when initial selection fails', async () => {
    const repository = createMemoryGymRepository()
    repository.saveAndSelectIfNone = async () => {
      throw new Error('selection failed')
    }
    const service = createGymService(repository)

    await expect(service.create({ name: 'Atomic Gym', address: '' })).rejects.toThrow('selection failed')
    await expect(service.list()).resolves.toEqual([])
  })

  it('does not let an earlier selected-gym lookup clear a restored selection', async () => {
    const oldGym = {
      id: 'old-gym',
      name: 'Old Gym',
      address: '',
      createdAt: '2026-09-22T01:00:00.000Z',
      updatedAt: '2026-09-22T01:00:00.000Z',
    }
    const restoredGym = { ...oldGym, id: 'restored-gym', name: 'Restored Gym' }
    const repository = createMemoryGymRepository([oldGym])
    await repository.select(oldGym.id)
    const originalGet = repository.get.bind(repository)
    let releaseLookup!: () => void
    let markLookupStarted!: () => void
    const lookupStarted = new Promise<void>((resolve) => { markLookupStarted = resolve })
    const lookupGate = new Promise<void>((resolve) => { releaseLookup = resolve })
    repository.get = async (id) => {
      markLookupStarted()
      await lookupGate
      return originalGet(id)
    }
    const service = createGymService(repository)

    const staleLookup = service.getSelected()
    await lookupStarted
    const replacement = service.replaceAll([restoredGym], restoredGym.id)
    releaseLookup()
    await Promise.all([staleLookup, replacement])

    expect(await service.getSelected()).toEqual(restoredGym)
  })

  it('migrates a version-one gym database without losing its profile', async () => {
    const databaseName = `spottr-migration-${crypto.randomUUID()}`
    const legacyOpen = indexedDB.open(databaseName, 1)
    legacyOpen.onupgradeneeded = () => {
      legacyOpen.result.createObjectStore('gyms', { keyPath: 'id' })
    }
    const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
      legacyOpen.onsuccess = () => resolve(legacyOpen.result)
      legacyOpen.onerror = () => reject(legacyOpen.error)
    })
    const transaction = legacyDb.transaction('gyms', 'readwrite')
    transaction.objectStore('gyms').put({
      id: 'legacy-gym',
      name: 'Legacy Gym',
      address: 'Old address',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    legacyDb.close()

    const repository = createIndexedDbGymRepository(databaseName)
    expect(GYM_DATABASE_VERSION).toBe(2)
    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-gym', name: 'Legacy Gym' }),
    ])
    await repository.select('legacy-gym')
    await expect(repository.getSelectedId()).resolves.toBe('legacy-gym')
    await repository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })
})
