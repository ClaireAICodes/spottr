import { composeDataset, runRoot } from './datasetCoordinator'
import { createSpottrBackup } from './backup'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { createSessionService, createMemorySessionRepository } from './sessions'
import { createSettingsService, createMemorySettingsRepository, DEFAULT_SETTINGS } from './settings'

function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }
function fixture() {
  const gymService = createGymService(createMemoryGymRepository())
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
  const settingsService = createSettingsService(createMemorySettingsRepository())
  return { gymService, exerciseService, workoutService, sessionService, settingsService, now: () => '2026-09-29T01:02:03.000Z' }
}

it('lifetime: held ordinary read permits later mutation without retry for unrelated write', async () => {
  const cores = fixture(), entered = gate(), release = gate()
  let calls = 0
  const decorated = { ...cores.settingsService, async get() {
    calls++; const result = await cores.settingsService.get(); entered.resolve(); await release.promise; return result
  } }
  const roots = composeDataset({ ...cores, settingsService: decorated })
  const reading = roots.settingsService.get()
  await entered.promise
  try {
    await roots.gymService.create({ name: 'Independent Gym', address: '' })
    expect(calls).toBe(1)
  } finally { release.resolve() }
  expect(await reading).toEqual(DEFAULT_SETTINGS)
  expect(calls).toBe(1)
})

it('lifetime: short read initiation waits behind existing writer and forwards exact rejection', async () => {
  const cores = fixture(), entered = gate(), release = gate()
  let calls = 0
  const failure = new Error('Injected read rejection')
  const decorated = { ...cores.settingsService, get() { calls++; return Promise.reject(failure) } }
  const roots = composeDataset({ ...cores, settingsService: decorated })
  const holding = runRoot(async () => { entered.resolve(); await release.promise })
  await entered.promise
  const verdict = roots.settingsService.get().catch(e => e)
  const observed = runRoot(async () => calls)
  try { expect(calls).toBe(0) } finally { release.resolve() }
  await holding
  expect(await verdict).toBe(failure)
  expect(await observed).toBe(1)
  await roots.gymService.create({ name: 'After Rejection', address: '' })
  expect(calls).toBe(1)
})

it('lifetime: synchronous read rejection releases admission and preserves identity', async () => {
  const cores = fixture(), failure = new Error('sync decorator failure')
  const roots = composeDataset({ ...cores, settingsService: { ...cores.settingsService, get() { throw failure } } })
  await expect(roots.settingsService.get()).rejects.toBe(failure)
  expect(await roots.gymService.create({ name: 'Not Deadlocked', address: '' })).toMatchObject({ name: 'Not Deadlocked' })
})

it('lifetime: read crossing restore is retried and reads requested during restore cannot enter partial state', async () => {
  const cores = fixture(), readEntered = gate(), readRelease = gate(), restoreEntered = gate(), restoreRelease = gate(), settingsApplied = gate()
  const before = await createSpottrBackup(cores)
  let reads = 0, settled = false
  const settings = { ...cores.settingsService, async get() {
    reads++; const value = await cores.settingsService.get()
    if (reads === 1) { readEntered.resolve(); await readRelease.promise }
    return value
  }, async update(...args: Parameters<typeof cores.settingsService.update>) {
    const result = await cores.settingsService.update(...args); settingsApplied.resolve(); return result
  } }
  const exercise = { ...cores.exerciseService, async replaceAll(...args: Parameters<typeof cores.exerciseService.replaceAll>) {
    restoreEntered.resolve(); await restoreRelease.promise; return cores.exerciseService.replaceAll(...args)
  } }
  const roots = composeDataset({ ...cores, settingsService: settings, exerciseService: exercise })
  const reading = roots.settingsService.get().then(v => { settled = true; return v })
  await readEntered.promise
  const incoming = { ...before, settings: { ...DEFAULT_SETTINGS, weightUnit: 'lb' as const, restSeconds: 125 } }
  const restoring = roots.restoreBackup(incoming)
  await restoreEntered.promise
  await settingsApplied.promise
  const readsBefore = reads
  const during = roots.settingsService.get()
  readRelease.resolve()
  // This shared admission probe queues after the read result validator and cannot
  // enter the half-restored dataset. We assert again from the held decorator.
  expect(reads).toBe(readsBefore)
  expect(settled).toBe(false)
  try { expect(await cores.settingsService.get()).toEqual(incoming.settings) }
  finally { restoreRelease.resolve(); readRelease.resolve() }
  await restoring
  expect(await reading).toEqual(incoming.settings)
  expect(await during).toEqual(incoming.settings)
  expect(reads).toBe(readsBefore + 2)
  expect(await roots.exportBackup()).toEqual(incoming)
})

it('lifetime: failed compensated restore invalidates held success and preserves decorator failure', async () => {
  const cores = fixture(), entered = gate(), release = gate()
  const before = await createSpottrBackup(cores)
  const failure = new Error('exact replacement rejection')
  let reads = 0, replacements = 0
  const settings = { ...cores.settingsService, async get() {
    reads++; const value = await cores.settingsService.get()
    if (reads === 1) { entered.resolve(); await release.promise }
    return value
  } }
  const workout = { ...cores.workoutService, async replaceAll(...args: Parameters<typeof cores.workoutService.replaceAll>) {
    replacements++; if (replacements === 1) throw failure
    return cores.workoutService.replaceAll(...args)
  } }
  const roots = composeDataset({ ...cores, settingsService: settings, workoutService: workout })
  const reading = roots.settingsService.get()
  await entered.promise
  try {
    const error = await roots.restoreBackup({ ...before, settings: { ...DEFAULT_SETTINGS, restSeconds: 150 } }).catch(e => e)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0]).toBe(failure)
    expect(replacements).toBe(2)
  } finally { release.resolve() }
  expect(await reading).toEqual(before.settings)
  expect(reads).toBe(3) // held read, restore snapshot, retry
  expect(await roots.exportBackup()).toEqual(before)
})

it('lifetime: export retains entire decorated pure-read promise and blocks later mutation', async () => {
  const cores = fixture(), entered = gate(), release = gate()
  let enteredWrite = false
  const settings = { ...cores.settingsService, async get() {
    const result = await cores.settingsService.get(); entered.resolve(); await release.promise; return result
  }, async update(...args: Parameters<typeof cores.settingsService.update>) {
    enteredWrite = true; return cores.settingsService.update(...args)
  } }
  const first = composeDataset({ ...cores, settingsService: settings })
  const second = composeDataset({ ...cores, settingsService: settings })
  const exporting = first.exportBackup()
  await entered.promise
  const writing = second.settingsService.update({ ...DEFAULT_SETTINGS, restSeconds: 160 })
  try { expect(enteredWrite).toBe(false) } finally { release.resolve() }
  expect((await exporting).settings).toEqual(DEFAULT_SETTINGS)
  await writing
  expect(enteredWrite).toBe(true)
})

it('lifetime: actual invalid-selection cleanup remains exclusive until repository write settles', async () => {
  const cores = fixture(), repo = createMemoryGymRepository(), entered = gate(), release = gate()
  await repo.select('missing-gym')
  const select = repo.select.bind(repo)
  repo.select = async id => { expect(id).toBeNull(); entered.resolve(); await release.promise; return select(id) }
  let writeEntered = false
  const settings = { ...cores.settingsService, async update(...args: Parameters<typeof cores.settingsService.update>) {
    writeEntered = true; return cores.settingsService.update(...args)
  } }
  const roots = composeDataset({ ...cores, gymService: createGymService(repo), settingsService: settings })
  const getting = roots.gymService.repairInvalidSelection!()
  await entered.promise
  const updating = roots.settingsService.update({ ...DEFAULT_SETTINGS, restSeconds: 170 })
  try { expect(writeEntered).toBe(false) } finally { release.resolve() }
  await getting
  await updating
  expect(await repo.getSelectedId()).toBeNull()
})

it('lifetime: actual nested session workout exercise decorators run inside one root and admitted input is rejected', async () => {
  const cores = fixture(), trace: string[] = []
  const gym = await cores.gymService.create({ name: 'Nested Gym', address: '' })
  const exercise = await cores.exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
  const template = await cores.workoutService.create({ name: 'Nested Strength', gymId: gym.id, exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 20, reps: 5 }] }] })
  const workoutService = { ...cores.workoutService, async get(id: string) { trace.push('workout'); return cores.workoutService.get(id) } }
  const exerciseService = { ...cores.exerciseService, async get(id: string) { trace.push('exercise'); return cores.exerciseService.get(id) } }
  const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
  const roots = composeDataset({ ...cores, workoutService, exerciseService, sessionService })
  const active = await roots.sessionService.start(template.id, gym.name)
  expect(trace).toEqual(['workout', 'exercise'])
  expect((await roots.sessionService.getActive())?.id).toBe(active.id)
  expect(() => composeDataset({ ...cores, settingsService: roots.settingsService })).toThrow('Already coordinated root is not a core dependency')
})
