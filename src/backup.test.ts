import { createSpottrBackup, downloadSpottrBackup, MAX_BACKUP_FILE_BYTES, parseSpottrBackup, restoreSpottrBackup, serializeSpottrBackup } from './backup'
import { createExerciseService, createMemoryExerciseRepository, type Exercise } from './exercises'
import { createGymService, createMemoryGymRepository, type Gym } from './gyms'
import { createMemorySessionRepository, createSessionService, type CompletedWorkoutSession, type WorkoutSession } from './sessions'
import { createMemorySettingsRepository, createSettingsService, DEFAULT_SETTINGS } from './settings'
import { createMemoryWorkoutRepository, createWorkoutService, type WorkoutTemplate } from './workouts'

const timestamp = '2026-09-29T01:02:03.000Z'

async function blobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

describe('Spottr backup export', () => {
  it('exports every entity, settings, and media bytes in the versioned contract', async () => {
    const gym: Gym = {
      id: 'gym-1',
      name: 'North Gym',
      address: '1 Main Street',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const mediaData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1Pe'
    const mediaBlob = new Blob([
      Uint8Array.from(atob(mediaData), (character) => character.charCodeAt(0)),
    ], { type: 'image/png' })
    const exercise: Exercise = {
      id: 'exercise-1',
      name: 'Back Squat',
      muscleGroup: 'Legs',
      equipment: 'Barbell',
      notes: 'Brace',
      createdAt: timestamp,
      updatedAt: timestamp,
      media: [{
        id: 'media-1',
        kind: 'image',
        name: 'setup.png',
        mimeType: 'image/png',
        size: mediaBlob.size,
        blob: mediaBlob,
        createdAt: timestamp,
      }],
    }
    const workout: WorkoutTemplate = {
      id: 'workout-1',
      name: 'Strength',
      gymId: gym.id,
      exercises: [{
        id: 'template-exercise-1',
        exerciseId: exercise.id,
        sets: [{ id: 'template-set-1', kind: 'working', weight: 100, reps: 5 }],
      }],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const activeSession: WorkoutSession = {
      id: 'session-active',
      templateId: workout.id,
      name: workout.name,
      gymId: gym.id,
      gymName: gym.name,
      exercises: [{
        id: 'session-exercise-active',
        templateExerciseId: workout.exercises[0].id,
        exerciseId: exercise.id,
        name: exercise.name,
        sets: [{
          id: 'session-set-active',
          templateSetId: workout.exercises[0].sets[0].id,
          kind: 'working',
          targetWeight: 100,
          targetReps: 5,
          weight: 100,
          reps: 5,
          completedAt: null,
          skippedAt: null,
        }],
      }],
      startedAt: timestamp,
      updatedAt: timestamp,
    }
    const completedSession: CompletedWorkoutSession = {
      ...activeSession,
      id: 'session-completed',
      exercises: [{
        ...activeSession.exercises[0],
        id: 'session-exercise-completed',
        sets: [{
          ...activeSession.exercises[0].sets[0],
          id: 'session-set-completed',
          completedAt: timestamp,
        }],
      }],
      endedAt: timestamp,
      summary: {
        completedExercises: 1,
        skippedExercises: 0,
        completedSets: 1,
        skippedSets: 0,
        volume: 500,
        durationSeconds: 0,
      },
    }

    const gymService = createGymService(createMemoryGymRepository([gym]))
    await gymService.select(gym.id)
    const exerciseService = createExerciseService(createMemoryExerciseRepository([exercise]))
    const workoutService = createWorkoutService(createMemoryWorkoutRepository([workout]))
    const sessionService = createSessionService(
      createMemorySessionRepository(activeSession, [completedSession]),
      workoutService,
      exerciseService,
    )
    const settings = { ...DEFAULT_SETTINGS, weightUnit: 'lb' as const, restSeconds: 120 }
    const settingsService = createSettingsService(createMemorySettingsRepository(settings))

    const backup = await createSpottrBackup({
      gymService,
      exerciseService,
      workoutService,
      sessionService,
      settingsService,
      now: () => timestamp,
    })

    expect(backup).toEqual({
      format: 'spottr-backup',
      version: 1,
      exportedAt: timestamp,
      entities: {
        gyms: [gym],
        selectedGymId: gym.id,
        exercises: [{
          ...exercise,
          media: [{
            id: 'media-1',
            kind: 'image',
            name: 'setup.png',
            mimeType: 'image/png',
            size: 33,
            createdAt: timestamp,
            content: { encoding: 'base64', data: mediaData },
          }],
        }],
        workouts: [workout],
        activeSession,
        completedSessions: [completedSession],
      },
      settings,
    })

    const file = serializeSpottrBackup(backup)
    expect(file.name).toBe('spottr-backup-2026-09-29T01-02-03-000Z.json')
    expect(file.type).toBe('application/json')
    expect(JSON.parse(await blobText(file))).toEqual(backup)
    expect(parseSpottrBackup(await blobText(file))).toEqual(backup)

    const restoredGymService = createGymService(createMemoryGymRepository([{
      ...gym,
      id: 'obsolete-gym',
      name: 'Obsolete Gym',
    }]))
    const restoredExerciseService = createExerciseService(createMemoryExerciseRepository([{
      ...exercise,
      id: 'obsolete-exercise',
      name: 'Obsolete Exercise',
      media: [],
    }]))
    const restoredWorkoutService = createWorkoutService(createMemoryWorkoutRepository())
    const restoredSessionService = createSessionService(
      createMemorySessionRepository(),
      restoredWorkoutService,
      restoredExerciseService,
    )
    const restoredSettingsService = createSettingsService(createMemorySettingsRepository())
    const restoredServices = {
      gymService: restoredGymService,
      exerciseService: restoredExerciseService,
      workoutService: restoredWorkoutService,
      sessionService: restoredSessionService,
      settingsService: restoredSettingsService,
      now: () => timestamp,
    }

    await restoreSpottrBackup(parseSpottrBackup(await blobText(file)), restoredServices)

    expect(await createSpottrBackup(restoredServices)).toEqual(backup)

    const wrongMediaSize = structuredClone(backup)
    wrongMediaSize.entities.exercises[0].media[0].size = 3
    expect(() => parseSpottrBackup(JSON.stringify(wrongMediaSize))).toThrow(/not a valid Spottr backup/i)

    const oversizedImageDimensions = structuredClone(backup)
    oversizedImageDimensions.entities.exercises[0].media[0] = {
      ...oversizedImageDimensions.entities.exercises[0].media[0],
      mimeType: 'image/png',
      size: 33,
      content: {
        encoding: 'base64',
        data: 'iVBORw0KGgoAAAANSUhEUgAAE4gAABOICAIAAADS+hCc',
      },
    }
    expect(() => parseSpottrBackup(JSON.stringify(oversizedImageDimensions))).toThrow(/not a valid Spottr backup/i)

    const blankIdentity = structuredClone(backup)
    blankIdentity.entities.gyms[0].id = ' '
    expect(() => parseSpottrBackup(JSON.stringify(blankIdentity))).toThrow(/not a valid Spottr backup/i)

    const nonIsoTimestamp = structuredClone(backup)
    nonIsoTimestamp.exportedAt = '0'
    expect(() => parseSpottrBackup(JSON.stringify(nonIsoTimestamp))).toThrow(/not a valid Spottr backup/i)

    const duplicateWorkoutExercise = structuredClone(backup)
    duplicateWorkoutExercise.entities.workouts[0].exercises.push({
      ...duplicateWorkoutExercise.entities.workouts[0].exercises[0],
      id: 'template-exercise-2',
    })
    expect(() => parseSpottrBackup(JSON.stringify(duplicateWorkoutExercise))).toThrow(/not a valid Spottr backup/i)

    const incorrectSummary = structuredClone(backup)
    incorrectSummary.entities.completedSessions[0].summary.completedSets = 0
    expect(() => parseSpottrBackup(JSON.stringify(incorrectSummary))).toThrow(/not a valid Spottr backup/i)

    const conflictingSessionState = structuredClone(backup)
    conflictingSessionState.entities.activeSession!.exercises.push({
      id: 'session-exercise-1',
      exerciseId: exercise.id,
      name: exercise.name,
      sets: [{
        id: 'session-set-1',
        kind: 'working',
        targetWeight: 100,
        targetReps: 5,
        weight: 100,
        reps: 5,
        completedAt: timestamp,
        skippedAt: timestamp,
      }],
    })
    expect(() => parseSpottrBackup(JSON.stringify(conflictingSessionState))).toThrow(/not a valid Spottr backup/i)

    const emptyWorkout = structuredClone(backup)
    emptyWorkout.entities.workouts[0].exercises = []
    expect(() => parseSpottrBackup(JSON.stringify(emptyWorkout))).toThrow(/not a valid Spottr backup/i)

    const collidingSessionIds = structuredClone(backup)
    collidingSessionIds.entities.activeSession!.id = collidingSessionIds.entities.completedSessions[0].id
    expect(() => parseSpottrBackup(JSON.stringify(collidingSessionIds))).toThrow(/not a valid Spottr backup/i)

    const duplicateSessionExercise = structuredClone(backup)
    duplicateSessionExercise.entities.activeSession!.exercises = [
      {
        id: 'session-exercise-1',
        exerciseId: exercise.id,
        name: exercise.name,
        sets: [],
      },
      {
        id: 'session-exercise-2',
        exerciseId: exercise.id,
        name: exercise.name,
        sets: [],
      },
    ]
    expect(() => parseSpottrBackup(JSON.stringify(duplicateSessionExercise))).toThrow(/not a valid Spottr backup/i)

    const emptyActiveSession = structuredClone(backup)
    emptyActiveSession.entities.activeSession!.exercises = []
    expect(() => parseSpottrBackup(JSON.stringify(emptyActiveSession))).toThrow(/not a valid Spottr backup/i)

    const emptyCompletedSession = structuredClone(backup)
    emptyCompletedSession.entities.completedSessions[0].exercises = []
    emptyCompletedSession.entities.completedSessions[0].summary = {
      completedExercises: 0,
      skippedExercises: 0,
      completedSets: 0,
      skippedSets: 0,
      volume: 0,
      durationSeconds: 0,
    }
    expect(() => parseSpottrBackup(JSON.stringify(emptyCompletedSession))).toThrow(/not a valid Spottr backup/i)

    const emptySessionSets = structuredClone(backup)
    emptySessionSets.entities.activeSession!.exercises[0].sets = []
    expect(() => parseSpottrBackup(JSON.stringify(emptySessionSets))).toThrow(/not a valid Spottr backup/i)

    const decisionOnSkippedSet = structuredClone(backup)
    decisionOnSkippedSet.entities.completedSessions[0].exercises = [{
      id: 'session-exercise-1',
      exerciseId: exercise.id,
      name: exercise.name,
      sets: [{
        id: 'session-set-1',
        kind: 'working',
        targetWeight: 100,
        targetReps: 5,
        weight: 100,
        reps: 5,
        completedAt: null,
        skippedAt: timestamp,
        targetDecision: 'accepted',
      }],
    }]
    decisionOnSkippedSet.entities.completedSessions[0].summary = {
      completedExercises: 0,
      skippedExercises: 1,
      completedSets: 0,
      skippedSets: 1,
      volume: 0,
      durationSeconds: 0,
    }
    expect(() => parseSpottrBackup(JSON.stringify(decisionOnSkippedSet))).toThrow(/not a valid Spottr backup/i)

    const pendingDecisionWithoutTemplateReferences = structuredClone(backup)
    pendingDecisionWithoutTemplateReferences.entities.completedSessions[0].exercises = [{
      id: 'session-exercise-1',
      exerciseId: exercise.id,
      name: exercise.name,
      sets: [{
        id: 'session-set-1',
        kind: 'working',
        targetWeight: 100,
        targetReps: 5,
        weight: 105,
        reps: 5,
        completedAt: timestamp,
        skippedAt: null,
        targetDecision: 'accepting',
      }],
    }]
    pendingDecisionWithoutTemplateReferences.entities.completedSessions[0].summary = {
      completedExercises: 1,
      skippedExercises: 0,
      completedSets: 1,
      skippedSets: 0,
      volume: 525,
      durationSeconds: 0,
    }
    expect(() => parseSpottrBackup(JSON.stringify(pendingDecisionWithoutTemplateReferences))).toThrow(/not a valid Spottr backup/i)

    const decisionMatchingTarget = structuredClone(backup)
    decisionMatchingTarget.entities.completedSessions[0].exercises[0].sets[0].targetDecision = 'accepted'
    expect(() => parseSpottrBackup(JSON.stringify(decisionMatchingTarget))).toThrow(/not a valid Spottr backup/i)

    const setBeforeSession = structuredClone(pendingDecisionWithoutTemplateReferences)
    delete setBeforeSession.entities.completedSessions[0].exercises[0].sets[0].targetDecision
    setBeforeSession.entities.completedSessions[0].exercises[0].sets[0].completedAt = '2026-09-29T01:02:02.999Z'
    expect(() => parseSpottrBackup(JSON.stringify(setBeforeSession))).toThrow(/not a valid Spottr backup/i)

    const updatedAfterEnd = structuredClone(backup)
    updatedAfterEnd.entities.completedSessions[0].updatedAt = '2026-09-29T01:02:04.000Z'
    expect(() => parseSpottrBackup(JSON.stringify(updatedAfterEnd))).toThrow(/not a valid Spottr backup/i)

    const oldestHistoryFirst = structuredClone(backup)
    oldestHistoryFirst.entities.completedSessions = [
      {
        ...oldestHistoryFirst.entities.completedSessions[0],
        id: 'session-oldest',
        startedAt: '2026-09-29T01:00:00.000Z',
        updatedAt: '2026-09-29T01:00:00.000Z',
        endedAt: '2026-09-29T01:00:00.000Z',
      },
      oldestHistoryFirst.entities.completedSessions[0],
    ]
    expect(() => parseSpottrBackup(JSON.stringify(oldestHistoryFirst))).toThrow(/not a valid Spottr backup/i)

    const oversizedExport = structuredClone(backup)
    oversizedExport.entities.exercises[0].notes = 'x'.repeat(MAX_BACKUP_FILE_BYTES)
    expect(() => serializeSpottrBackup(oversizedExport)).toThrow(/backup is too large/i)
  })

  it('keeps the object URL alive until an attached download has started', () => {
    vi.useFakeTimers()
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const originalLinkClick = HTMLAnchorElement.prototype.click
    const revoked: string[] = []
    let clickedWhileAttached = false
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:backup' })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: (url: string) => revoked.push(url),
    })
    HTMLAnchorElement.prototype.click = function click() {
      clickedWhileAttached = document.body.contains(this)
    }

    try {
      downloadSpottrBackup(new File(['{}'], 'backup.json', { type: 'application/json' }))
      expect(clickedWhileAttached).toBe(true)
      expect(document.querySelector('a[download="backup.json"]')).not.toBeInTheDocument()
      expect(revoked).toEqual([])
      vi.runAllTimers()
      expect(revoked).toEqual(['blob:backup'])
    } finally {
      vi.useRealTimers()
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl })
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl })
      HTMLAnchorElement.prototype.click = originalLinkClick
    }
  })

  it('rolls every service back when one replacement fails', async () => {
    const sourceGym: Gym = {
      id: 'source-gym',
      name: 'Source Gym',
      address: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const sourceGymService = createGymService(createMemoryGymRepository([sourceGym]))
    const sourceExerciseService = createExerciseService(createMemoryExerciseRepository())
    const sourceWorkoutService = createWorkoutService(createMemoryWorkoutRepository())
    const sourceSessionService = createSessionService(
      createMemorySessionRepository(),
      sourceWorkoutService,
      sourceExerciseService,
    )
    const sourceServices = {
      gymService: sourceGymService,
      exerciseService: sourceExerciseService,
      workoutService: sourceWorkoutService,
      sessionService: sourceSessionService,
      settingsService: createSettingsService(createMemorySettingsRepository()),
      now: () => timestamp,
    }
    const incoming = await createSpottrBackup(sourceServices)

    const currentGym: Gym = {
      id: 'current-gym',
      name: 'Current Gym',
      address: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const gymService = createGymService(createMemoryGymRepository([currentGym]))
    await gymService.select(currentGym.id)
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    const workoutService = createWorkoutService(createMemoryWorkoutRepository())
    const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
    const settingsService = createSettingsService(createMemorySettingsRepository())
    let replacements = 0
    const failingWorkoutService = {
      ...workoutService,
      async replaceAll(templates: WorkoutTemplate[]) {
        replacements += 1
        if (replacements === 1) throw new Error('Simulated storage failure')
        await workoutService.replaceAll(templates)
      },
    }
    const targetServices = {
      gymService,
      exerciseService,
      workoutService: failingWorkoutService,
      sessionService,
      settingsService,
      now: () => timestamp,
    }
    const before = await createSpottrBackup(targetServices)

    await expect(restoreSpottrBackup(incoming, targetServices)).rejects.toThrow(/backup restore failed/i)

    expect(await createSpottrBackup(targetServices)).toEqual(before)
  })
})
