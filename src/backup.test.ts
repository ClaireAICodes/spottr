import { createSpottrBackup, downloadSpottrBackup, MAX_BACKUP_FILE_BYTES, parseSpottrBackup, serializeSpottrBackup } from './backup'
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
    const mediaBlob = new Blob(['Hi'], { type: 'image/png' })
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
      exercises: [],
      startedAt: timestamp,
      updatedAt: timestamp,
    }
    const completedSession: CompletedWorkoutSession = {
      ...activeSession,
      id: 'session-completed',
      endedAt: timestamp,
      summary: {
        completedExercises: 0,
        skippedExercises: 0,
        completedSets: 0,
        skippedSets: 0,
        volume: 0,
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
            size: 2,
            createdAt: timestamp,
            content: { encoding: 'base64', data: 'SGk=' },
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

    const wrongMediaSize = structuredClone(backup)
    wrongMediaSize.entities.exercises[0].media[0].size = 3
    expect(() => parseSpottrBackup(JSON.stringify(wrongMediaSize))).toThrow(/not a valid Spottr backup/i)

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
    incorrectSummary.entities.completedSessions[0].summary.completedSets = 1
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
})
