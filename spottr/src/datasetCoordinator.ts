import { createSpottrBackup, restoreSpottrBackup, type SpottrBackup } from './backup'
import { createIndexedDbGymRepository } from './gymRepository'
import { createIndexedDbExerciseRepository } from './exerciseRepository'
import { createIndexedDbWorkoutRepository } from './workoutRepository'
import { createIndexedDbSessionRepository } from './sessionRepository'
import { createIndexedDbSettingsRepository } from './settingsRepository'
import { createGymService, createMemoryGymRepository, type GymService } from './gyms'
import { createExerciseService, createMemoryExerciseRepository, type ExerciseService } from './exercises'
import { createWorkoutService, createMemoryWorkoutRepository, type WorkoutService } from './workouts'
import { createSessionService, createMemorySessionRepository, type SessionService } from './sessions'
import { createSettingsService, createMemorySettingsRepository, type SettingsService } from './settings'
import { withWorkoutIntegrityLock } from './workoutIntegrity'
import { createDatasetRecovery, type RecoveryState } from './datasetRecovery'

const datasetLock = 'spottr-dataset'
const admitted = Symbol('coordinated dataset root')
type Mode = 'shared' | 'exclusive'
let readers = 0
let writer = false
const waiting: Array<{mode: Mode; enter: () => void}> = []
function drain() {
  if (writer || !waiting.length) return
  if (waiting[0].mode === 'exclusive') {
    if (readers) return
    writer = true
    waiting.shift()!.enter()
  } else {
    while (waiting[0]?.mode === 'shared') { readers++; waiting.shift()!.enter() }
  }
}
export async function runRoot<T>(operation: () => Promise<T>, mode: Mode = 'exclusive'): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(datasetLock, { mode }, operation)
  }
  await new Promise<void>(resolve => { waiting.push({ mode, enter: resolve }); drain() })
  try { return await operation() }
  finally { if (mode === 'shared') readers--; else writer = false; drain() }
}

export type DatasetCores = {
  gymService?: GymService
  exerciseService?: ExerciseService
  workoutService?: WorkoutService
  sessionService?: SessionService
  settingsService?: SettingsService
  now?: () => string
}

function rejectAdmitted(core: object) {
  if (admitted in core) throw new Error('Already coordinated root is not a core dependency')
}

// Ordinary UI reads have initiation/validation admission, NOT settlement ownership.
// Only audited, side-effect-free, single-result methods are eligible. Decorators
// must preserve purity and obtain a fresh core result if a restore requires retry.
// Mutations, mutation-capable getters, idle, rollback callbacks and snapshots keep
// full exclusive ownership. No async owner or nested public-root bypass exists.
let fallbackGeneration = 0n
const generationKey = 'spottr-dataset-restore-generation'
function generation(origin = true): string {
  if (!origin || typeof navigator === 'undefined' || !navigator.locks) return String(fallbackGeneration)
  const value = localStorage.getItem(generationKey) ?? '0'
  if (!/^\d+$/.test(value)) throw new Error('Invalid dataset restore generation')
  return value
}
function advanceRestoreGeneration(origin = true) {
  if (!origin || typeof navigator === 'undefined' || !navigator.locks) { fallbackGeneration++; return }
  // Called inside the exclusive Web Lock, before ANY restore write. Fail closed
  // if shared origin metadata is unavailable; never silently use a realm epoch.
  localStorage.setItem(generationKey, String(BigInt(generation()) + 1n))
}
// Bound completed-but-invalidated reads, not the lifetime of a pending core read.
const ordinaryReadAttempts = 3
type Admission = <T>(operation: () => Promise<T>, mode?: Mode) => Promise<T>
async function ordinaryRead<T>(operation: () => Promise<T>, admit: Admission, observe: () => string): Promise<T> {
  for (let attemptNumber = 0; attemptNumber < ordinaryReadAttempts; attemptNumber++) {
    const attempt = await admit(() => {
      const observed = observe()
      const pending = Promise.resolve(operation())
      // Observe immediately, but forward the original rejection unchanged.
      void pending.catch(() => undefined)
      // Box the promise: Web Locks assimilates its callback's returned promise.
      // Returning pending itself would retain ownership until settlement.
      return Promise.resolve({ observed, pending })
    }, 'shared')
    const result = await attempt.pending
    const valid = await admit(() => Promise.resolve(attempt.observed === observe()), 'shared')
    if (valid) return result
  }
  throw new Error(`Dataset changed during all ${ordinaryReadAttempts} read attempts; please retry`)
}
function publish<T extends object>(core: T, admit: Admission, observe: () => string, ordinaryMethods: string[] = []): T {
  rejectAdmitted(core)
  const entries = Object.entries(core).map(([method, fn]) => [method, (...args: unknown[]) => {
    if (ordinaryMethods.includes(method)) return ordinaryRead(() => Promise.resolve(Reflect.apply(fn, core, args)), admit, observe)
    return admit(async () => {
      const result = await Reflect.apply(fn, core, args)
      // Independent callbacks must not retain ownership from their capture root.
      if (method === 'captureRollback' && typeof result === 'function') {
        return () => admit(() => result())
      }
      return result
    })
  }])
  return Object.assign(Object.fromEntries(entries), { [admitted]: true }) as T
}

/** Own the core graph BEFORE admission. Injected services must be unadmitted
 * cores; any captured dependencies must also be cores from that same graph.
 * Decorate before passing them here. Hidden closures cannot be inspected and
 * cannot safely be unwrapped. UI receives roots, never these private cores.
 */
export function composeDataset(input: DatasetCores = {}) {
  for (const core of Object.values(input)) if (typeof core === 'object' && core) rejectAdmitted(core)
  const persistent = Boolean(!input.gymService && !input.exerciseService && !input.workoutService && !input.sessionService && !input.settingsService)
  const recovery = persistent ? createDatasetRecovery(() => advanceRestoreGeneration()) : undefined
  const observe = () => generation(persistent)
  const admit: Admission = async (operation, mode = 'exclusive') => {
    if (!recovery) return runRoot(operation, mode)
    if (mode === 'exclusive') return runRoot(async () => { await recovery.recover(); return operation() })
    // Never upgrade a held shared lock or await an ordinary core's settlement.
    // Recovery probing does not consume a completed-read generation attempt.
    while (true) {
      const result = await runRoot(async () => {
        if (await recovery.inspect()) return { pendingRecovery: true as const }
        return { pendingRecovery: false as const, value: await operation() }
      }, 'shared')
      if (!result.pendingRecovery) return result.value
      await runRoot(() => recovery.recover())
    }
  }
  const gym = input.gymService ?? createGymService(persistent ? createIndexedDbGymRepository() : createMemoryGymRepository())
  const exercise = input.exerciseService ?? createExerciseService(persistent ? createIndexedDbExerciseRepository() : createMemoryExerciseRepository())
  const workout = input.workoutService ?? createWorkoutService(persistent ? createIndexedDbWorkoutRepository() : createMemoryWorkoutRepository(), {
    gymExists: async (id) => Boolean(await gym.get(id)),
  })
  const session = input.sessionService ?? createSessionService(
    persistent ? createIndexedDbSessionRepository() : createMemorySessionRepository(),
    workout, exercise, { resolveGymName: async (id) => (await gym.get(id))?.name ?? null },
  )
  const settings = input.settingsService ?? createSettingsService(persistent ? createIndexedDbSettingsRepository() : createMemorySettingsRepository())
  const managedGym = { ...gym, async remove(id: string) {
    await withWorkoutIntegrityLock(async () => {
      if ((await workout.list(id)).length > 0) throw new Error('Delete linked workouts before deleting this gym')
      await gym.remove(id)
    })
  } }
  // Settings replacement does not replace the owned workout/session/gym graph.
  const roots = {
    gymService: publish(managedGym, admit, observe, ['getSelected']), exerciseService: publish(exercise, admit, observe),
    workoutService: publish(workout, admit, observe), sessionService: publish(session, admit, observe, ['getActive']),
  }
  function withSettings(replacement: SettingsService) {
    rejectAdmitted(replacement)
    if (persistent && replacement !== settings) throw new Error('A persistent dataset cannot bind an unowned settings service')
    const cores = { gymService: managedGym, exerciseService: exercise, workoutService: workout,
      sessionService: session, settingsService: replacement, now: input.now }
    return {
      ...roots, settingsService: publish(replacement, admit, observe, ['get']),
      initializeOrRecover: () => runRoot(() => recovery ? recovery.recover(true) : Promise.resolve()),
      getRecoveryState: (): RecoveryState => recovery?.getState() ?? 'ready',
      subscribeRecovery: (listener: () => void) => recovery?.subscribe(listener) ?? (() => undefined),
      recoveryEvidence: () => runRoot(() => recovery ? recovery.evidence() : Promise.resolve(null)),
      exportBackup: () => admit(() => createSpottrBackup(cores)),
      restoreBackup: (backup: SpottrBackup) => admit(() => {
        if (!recovery) advanceRestoreGeneration(false)
        return restoreSpottrBackup(backup, cores, recovery?.lifecycle)
      }),
    }
  }
  return { ...withSettings(settings), withSettings }
}

export type Dataset = ReturnType<typeof composeDataset>
