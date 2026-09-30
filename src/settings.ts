export type WeightUnit = 'kg' | 'lb'

export type AppSettings = {
  weightUnit: WeightUnit
  progressiveOverloadCues: boolean
  prCelebrations: boolean
  restTimerEnabled: boolean
  restSeconds: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  weightUnit: 'kg',
  progressiveOverloadCues: true,
  prCelebrations: true,
  restTimerEnabled: true,
  restSeconds: 90,
}

export interface SettingsRepository {
  get(): Promise<AppSettings | null>
  save(settings: AppSettings): Promise<void>
  close?(): Promise<void>
}

export type SettingsService = Omit<ReturnType<typeof createSettingsService>, 'waitForIdle'> & {
  waitForIdle?: () => Promise<void>
}

function normalize(settings: AppSettings): AppSettings {
  if (!['kg', 'lb'].includes(settings.weightUnit)) throw new Error('Choose a valid weight unit')
  if (!Number.isInteger(settings.restSeconds) || settings.restSeconds < 15 || settings.restSeconds > 600) {
    throw new Error('Rest duration must be a whole number from 15 to 600 seconds')
  }
  return { ...settings }
}

export function createSettingsService(repository: SettingsRepository) {
  let updateQueue: Promise<void> = Promise.resolve()

  return {
    async get() {
      const stored = await repository.get()
      return stored ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS }
    },
    async update(settings: AppSettings) {
      const update = async () => {
        const normalized = normalize(settings)
        await repository.save(normalized)
        return { ...normalized }
      }
      const result = updateQueue.then(update, update)
      updateQueue = result.then(() => undefined, () => undefined)
      return result
    },
    async waitForIdle() {
      await updateQueue
    },
  }
}

export function createMemorySettingsRepository(initial: AppSettings | null = null): SettingsRepository {
  let settings = initial ? { ...initial } : null
  return {
    async get() { return settings ? { ...settings } : null },
    async save(next) { settings = { ...next } },
  }
}

export function displayWeight(weightKg: number, unit: WeightUnit) {
  return unit === 'kg' ? weightKg : weightKg * 2.2046226218
}

export function storedWeight(displayed: number, unit: WeightUnit) {
  return unit === 'kg' ? displayed : Number((displayed / 2.2046226218).toFixed(2))
}

export function weightsDifferAtDisplayedPrecision(leftKg: number, rightKg: number, unit: WeightUnit) {
  return Math.round(displayWeight(leftKg, unit) * 10) !== Math.round(displayWeight(rightKg, unit) * 10)
}

export function formatWeight(weightKg: number, unit: WeightUnit) {
  const displayed = displayWeight(weightKg, unit)
  return `${Number(displayed.toFixed(1)).toLocaleString()} ${unit}`
}
