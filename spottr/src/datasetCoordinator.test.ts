import 'fake-indexeddb/auto'
import { composeDataset } from './datasetCoordinator'
import { createSpottrBackup } from './backup'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createMemorySessionRepository, createSessionService } from './sessions'
import { createMemorySettingsRepository, createSettingsService, DEFAULT_SETTINGS } from './settings'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

it('composed restore preserves the exact decorated failure and argument-only rollback forwarding', async () => {
  const gymService = createGymService(createMemoryGymRepository())
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const persistedWorkoutService = createWorkoutService(createMemoryWorkoutRepository())
  let releaseFailure!: () => void
  let markReplacementStarted!: () => void
  const replacementStarted = new Promise<void>((resolve) => { markReplacementStarted = resolve })
  const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve })
  let replacements = 0
  const workoutService = {
    ...persistedWorkoutService,
    async replaceAll(templates: Parameters<typeof persistedWorkoutService.replaceAll>[0]) {
      replacements += 1
      if (replacements === 1) {
        markReplacementStarted()
        await failureGate
        throw new Error('Simulated storage failure')
      }
      await persistedWorkoutService.replaceAll(templates)
    },
  }
  const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
  const settingsService = createSettingsService(createMemorySettingsRepository())
  const cores = { gymService, exerciseService, workoutService, sessionService, settingsService, now: () => '2026-09-29T01:02:03.000Z' }
  const roots = composeDataset(cores)
  const before = await roots.exportBackup()
  const incoming = { ...before, settings: { ...DEFAULT_SETTINGS, restSeconds: 120 } }
  const verdict = roots.restoreBackup(incoming).catch((error: AggregateError) => error)
  await replacementStarted
  releaseFailure()
  const error = await verdict
  expect(error).toBeInstanceOf(AggregateError)
  expect((error as AggregateError).errors[0].message).toBe('Simulated storage failure')
  expect(replacements).toBe(2)
  expect(await roots.exportBackup()).toEqual(before)
  expect(await createSpottrBackup(cores)).toEqual(before)
})

it('shares fallback admission across compositions and holds export and public idle behind a real save', async () => {
  const reached = gate(), release = gate()
  const repository = createMemorySettingsRepository()
  const save = repository.save.bind(repository)
  repository.save = async (settings) => { reached.resolve(); await release.promise; return save(settings) }
  const settingsService = createSettingsService(repository)
  const first = composeDataset({ settingsService, now: () => '2026-10-14T07:00:00.000Z' })
  const second = composeDataset({ settingsService, now: () => '2026-10-14T07:00:00.000Z' })
  const previous = await first.exportBackup()
  const pending = first.settingsService.update({ ...DEFAULT_SETTINGS, restSeconds: 75 })
  await reached.promise
  let exported = false, idled = false
  const exporting = second.exportBackup().then((backup) => { exported = true; return backup })
  const idle = second.settingsService.waitForIdle!().then(() => { idled = true })
  // Acknowledgement from the held core, not an elapsed-time observation.
  expect(exported).toBe(false)
  expect(idled).toBe(false)
  release.resolve()
  await pending
  expect(await exporting).toEqual({ ...previous, settings: { ...DEFAULT_SETTINGS, restSeconds: 75 } })
  await idle
})
