import 'fake-indexeddb/auto'
import { createIndexedDbSettingsRepository } from './settingsRepository'
import { createMemorySettingsRepository, createSettingsService, DEFAULT_SETTINGS } from './settings'

describe('application settings', () => {
  it('provides stable defaults and persists validated preferences', async () => {
    const repository = createMemorySettingsRepository()
    const service = createSettingsService(repository)

    expect(await service.get()).toEqual(DEFAULT_SETTINGS)
    await service.update({
      weightUnit: 'lb',
      progressiveOverloadCues: false,
      prCelebrations: false,
      restTimerEnabled: true,
      restSeconds: 120,
    })

    expect(await createSettingsService(repository).get()).toEqual({
      weightUnit: 'lb',
      progressiveOverloadCues: false,
      prCelebrations: false,
      restTimerEnabled: true,
      restSeconds: 120,
    })
    await expect(service.update({ ...DEFAULT_SETTINGS, restSeconds: 0 })).rejects.toThrow(/rest duration/i)
  })

  it('restores settings after IndexedDB is reopened', async () => {
    const databaseName = `spottr-settings-${crypto.randomUUID()}`
    const firstRepository = createIndexedDbSettingsRepository(databaseName)
    await createSettingsService(firstRepository).update({ ...DEFAULT_SETTINGS, weightUnit: 'lb', restSeconds: 75 })
    await firstRepository.close?.()

    const reopenedRepository = createIndexedDbSettingsRepository(databaseName)
    expect(await createSettingsService(reopenedRepository).get()).toMatchObject({ weightUnit: 'lb', restSeconds: 75 })
    await reopenedRepository.close?.()
    indexedDB.deleteDatabase(databaseName)
  })
})
