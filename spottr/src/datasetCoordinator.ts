import { createSpottrBackup, restoreSpottrBackup, type SpottrBackup } from './backup'
import { createIndexedDbGymRepository } from './gymRepository'
import { createIndexedDbExerciseRepository } from './exerciseRepository'
import { createIndexedDbWorkoutRepository } from './workoutRepository'
import { createIndexedDbSessionRepository } from './sessionRepository'
import { createIndexedDbSettingsRepository } from './settingsRepository'
import { createGymService, type GymService } from './gyms'
import { createExerciseService, type ExerciseService } from './exercises'
import { createWorkoutService, type WorkoutService } from './workouts'
import { createSessionService, createMemorySessionRepository, type SessionService } from './sessions'
import { createSettingsService, type SettingsService } from './settings'
import { withWorkoutIntegrityLock } from './workoutIntegrity'

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
function generation(): string {
  if (typeof navigator === 'undefined' || !navigator.locks) return String(fallbackGeneration)
  const value = localStorage.getItem(generationKey) ?? '0'
  if (!/^\d+$/.test(value)) throw new Error('Invalid dataset restore generation')
  return value
}
function advanceRestoreGeneration() {
  if (typeof navigator === 'undefined' || !navigator.locks) { fallbackGeneration++; return }
  // Called inside the exclusive Web Lock, before ANY restore write. Fail closed
  // if shared origin metadata is unavailable; never silently use a realm epoch.
  localStorage.setItem(generationKey, String(BigInt(generation()) + 1n))
}
async function ordinaryRead<T>(operation: () => Promise<T>): Promise<T> {
  for (;;) {
    const attempt = await runRoot(() => {
      const observed = generation()
      const pending = Promise.resolve(operation())
      // Observe immediately, but forward the original rejection unchanged.
      void pending.catch(() => undefined)
      // Box the promise: Web Locks assimilates its callback's returned promise.
      // Returning pending itself would retain ownership until settlement.
      return Promise.resolve({ observed, pending })
    }, 'shared')
    const result = await attempt.pending
    const valid = await runRoot(() => Promise.resolve(attempt.observed === generation()), 'shared')
    if (valid) return result
  }
}
function publish<T extends object>(core: T, ordinaryMethods: string[] = []): T {
  rejectAdmitted(core)
  const entries = Object.entries(core).map(([method, fn]) => [method, (...args: unknown[]) => {
    if (ordinaryMethods.includes(method)) return ordinaryRead(() => Promise.resolve(Reflect.apply(fn, core, args)))
    return runRoot(async () => {
      const result = await Reflect.apply(fn, core, args)
      // Independent callbacks must not retain ownership from their capture root.
      if (method === 'captureRollback' && typeof result === 'function') {
        return () => runRoot(() => result())
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
  const gym = input.gymService ?? createGymService(createIndexedDbGymRepository())
  const exercise = input.exerciseService ?? createExerciseService(createIndexedDbExerciseRepository())
  const workout = input.workoutService ?? createWorkoutService(createIndexedDbWorkoutRepository(), {
    gymExists: async (id) => Boolean(await gym.get(id)),
  })
  const session = input.sessionService ?? createSessionService(
    input.workoutService || input.exerciseService ? createMemorySessionRepository() : createIndexedDbSessionRepository(),
    workout, exercise, { resolveGymName: async (id) => (await gym.get(id))?.name ?? null },
  )
  const settings = input.settingsService ?? createSettingsService(createIndexedDbSettingsRepository())
  const managedGym = { ...gym, async remove(id: string) {
    await withWorkoutIntegrityLock(async () => {
      if ((await workout.list(id)).length > 0) throw new Error('Delete linked workouts before deleting this gym')
      await gym.remove(id)
    })
  } }
  // Settings replacement does not replace the owned workout/session/gym graph.
  const roots = {
    gymService: publish(managedGym, ['getSelected']), exerciseService: publish(exercise),
    workoutService: publish(workout), sessionService: publish(session, ['getActive']),
  }
  function withSettings(replacement: SettingsService) {
    rejectAdmitted(replacement)
    const cores = { gymService: managedGym, exerciseService: exercise, workoutService: workout,
      sessionService: session, settingsService: replacement, now: input.now }
    return {
      ...roots, settingsService: publish(replacement, ['get']),
      exportBackup: () => runRoot(() => createSpottrBackup(cores)),
      restoreBackup: (backup: SpottrBackup) => runRoot(() => {
        advanceRestoreGeneration()
        return restoreSpottrBackup(backup, cores)
      }),
    }
  }
  return { ...withSettings(settings), withSettings }
}

export type Dataset = ReturnType<typeof composeDataset>
