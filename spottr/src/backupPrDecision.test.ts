import { createSpottrBackup, parseSpottrBackup, restoreSpottrBackup, serializeSpottrBackup } from './backup'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createMemorySessionRepository, createSessionService } from './sessions'
import { createMemorySettingsRepository, createSettingsService } from './settings'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

async function fileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

it('roundtrips service-produced accepted and declined PR-at-plan decisions without changing any domain', async () => {
  const now = () => '2026-10-16T01:00:00.000Z'
  const gymService = createGymService(createMemoryGymRepository())
  const gym = await gymService.create({ name: 'North Gym', address: '' })
  await gymService.select(gym.id)
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const exercise = await exerciseService.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  const workout = await workoutService.create({ name: 'Planned Records', gymId: gym.id, exercises: [{
    exerciseId: exercise.id,
    sets: [{ kind: 'working', weight: 40, reps: 8 }, { kind: 'working', weight: 45, reps: 8 }],
  }] })
  const repository = createMemorySessionRepository()
  const sessionService = createSessionService(repository, workoutService, exerciseService)
  const active = await sessionService.start(workout.id, gym.name)
  const sessionExercise = active.exercises[0]
  for (const set of sessionExercise.sets) {
    await sessionService.logSet(sessionExercise.id, set.id, { weight: set.targetWeight, reps: set.targetReps })
  }
  const completed = await sessionService.complete(active.id)
  for (const [index, decision] of (['accept', 'decline'] as const).entries()) {
    await sessionService.decideFutureTarget(completed.id, sessionExercise.id, sessionExercise.sets[index].id, decision)
  }
  const reloaded = createSessionService(repository, workoutService, exerciseService)
  const services = { gymService, exerciseService, workoutService, sessionService: reloaded,
    settingsService: createSettingsService(createMemorySettingsRepository()), now }
  const backup = await createSpottrBackup(services)
  expect(backup.entities.completedSessions[0].exercises[0].sets).toMatchObject([
    { targetDecision: 'accepted', personalRecords: ['weight', 'set-volume'], weight: 40, targetWeight: 40 },
    { targetDecision: 'declined', personalRecords: ['weight', 'set-volume'], weight: 45, targetWeight: 45 },
  ])
  const parsed = parseSpottrBackup(await fileText(serializeSpottrBackup(backup)))
  expect(parsed).toEqual(backup)
  await gymService.create({ name: 'Replacement must remove this', address: '' })
  await restoreSpottrBackup(parsed, services)
  const afterReload = { ...services, sessionService: createSessionService(repository, workoutService, exerciseService) }
  expect(await createSpottrBackup(afterReload)).toEqual(backup)

  for (const decision of ['accepted', 'declined', 'accepting', 'declining'] as const) {
    const invalid = structuredClone(backup)
    const set = invalid.entities.completedSessions[0].exercises[0].sets[0]
    set.targetDecision = decision
    set.personalRecords = []
    expect(() => parseSpottrBackup(JSON.stringify(invalid))).toThrow(/not a valid Spottr backup/i)
  }
  for (const decision of ['accepting', 'declining'] as const) {
    const invalid = structuredClone(backup)
    invalid.entities.completedSessions[0].exercises[0].sets[0].targetDecision = decision
    expect(() => parseSpottrBackup(JSON.stringify(invalid))).toThrow(/not a valid Spottr backup/i)
  }
})
