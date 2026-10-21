import 'fake-indexeddb/auto'
import { composeDataset } from './datasetCoordinator'
import { createDatasetRecovery, RecoveryBlockedError } from './datasetRecovery'
import { createOwnedDatasetStorage, incomingStorage } from './ownedDatasetStorage'
import { createIndexedDbJournalStore, createRestoreJournal } from './restoreJournal'
import { createMemorySettingsRepository, createSettingsService, DEFAULT_SETTINGS } from './settings'

it('journals and verifies a real five-database replacement then exports through a fresh composition', async () => {
  const roots = composeDataset()
  const old = await roots.exportBackup()
  const next = { ...old, settings: { ...DEFAULT_SETTINGS, restSeconds: 165 } }
  await roots.restoreBackup(next)
  const fresh = composeDataset()
  await fresh.initializeOrRecover()
  expect((await fresh.exportBackup()).settings).toEqual(next.settings)
  expect(await createIndexedDbJournalStore('spottr-v1-restore-journal').read()).toBeNull()
})

it('blocks every public root on a malformed journal and retries without discarding it', async () => {
  const disk = createIndexedDbJournalStore('spottr-v1-restore-journal')
  await disk.write({ corrupt: true } as never)
  const roots = composeDataset()
  await expect(roots.initializeOrRecover()).rejects.toBeInstanceOf(RecoveryBlockedError)
  await expect(roots.settingsService.get()).rejects.toBeInstanceOf(RecoveryBlockedError)
  await expect(roots.gymService.list()).rejects.toBeInstanceOf(RecoveryBlockedError)
  await expect(roots.exportBackup()).rejects.toBeInstanceOf(RecoveryBlockedError)
  expect(await roots.recoveryEvidence()).toEqual({ corrupt: true })
  // Test-owned corruption removal; the production API never offers this action.
  await disk.clear()
  await roots.initializeOrRecover()
  expect(roots.getRecoveryState()).toBe('ready')
})

it('isolates injected defaults and rejects persistent settings rebinding', async () => {
  const persistent = composeDataset()
  const before = await persistent.exportBackup()
  const settingsService = createSettingsService(createMemorySettingsRepository())
  const injected = composeDataset({ settingsService })
  await injected.settingsService.update({ ...DEFAULT_SETTINGS, restSeconds: 195 })
  expect((await persistent.exportBackup()).settings).toEqual(before.settings)
  expect(() => persistent.withSettings(settingsService)).toThrow('unowned')
  const other = injected.withSettings(createSettingsService(createMemorySettingsRepository()))
  expect((await other.exportBackup()).settings).toEqual(DEFAULT_SETTINGS)
})

it('restores exact absent singleton representation through private replay', async () => {
  const storage = createOwnedDatasetStorage()
  const before = await storage.capture()
  const snapshot = structuredClone(before)
  snapshot.databases[0][1].rows = []
  snapshot.databases[4][0].rows = []
  await storage.replay(snapshot)
  expect(await storage.capture()).toEqual(snapshot)
  const roots = composeDataset()
  const incoming = await roots.exportBackup()
  const target = incomingStorage(incoming)
  const disk = createIndexedDbJournalStore(`interruption-${crypto.randomUUID()}`)
  const journal = createRestoreJournal({ identity: 'owned-test', store: disk, ...storage, invalidate: async () => undefined })
  await journal.prepare(target)
  await journal.begin()
  await storage.replay(target)
  const recreated = createRestoreJournal({ identity: 'owned-test', store: disk, ...createOwnedDatasetStorage(), invalidate: async () => undefined })
  await recreated.recover()
  expect(await storage.capture()).toEqual(snapshot)
})

it('can read the recovery state without performing any data reads', () => {
  expect(createDatasetRecovery(() => undefined).getState()).toBe('loading')
})
