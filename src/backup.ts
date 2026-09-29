import type { Exercise, ExerciseService } from './exercises'
import type { GymService } from './gyms'
import type { SessionService } from './sessions'
import type { AppSettings, SettingsService } from './settings'
import type { WorkoutService } from './workouts'

export const SPOTTR_BACKUP_VERSION = 1 as const

export type ExportedExercise = Omit<Exercise, 'media'> & {
  media: Array<Omit<Exercise['media'][number], 'blob'> & {
    content: {
      encoding: 'base64'
      data: string
    }
  }>
}

export type SpottrBackup = {
  format: 'spottr-backup'
  version: typeof SPOTTR_BACKUP_VERSION
  exportedAt: string
  entities: {
    gyms: Awaited<ReturnType<GymService['list']>>
    selectedGymId: string | null
    exercises: ExportedExercise[]
    workouts: Awaited<ReturnType<WorkoutService['list']>>
    activeSession: Awaited<ReturnType<SessionService['getActive']>>
    completedSessions: Awaited<ReturnType<SessionService['listHistory']>>
  }
  settings: AppSettings
}

type BackupServices = {
  gymService: GymService
  exerciseService: ExerciseService
  workoutService: WorkoutService
  sessionService: SessionService
  settingsService: SettingsService
  now?: () => string
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const separator = result.indexOf(',')
      if (separator < 0) {
        reject(new Error('Exercise media could not be encoded for backup'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Exercise media could not be read for backup'))
    reader.readAsDataURL(blob)
  })
}

async function exportExercise(exercise: Exercise): Promise<ExportedExercise> {
  return {
    ...exercise,
    media: await Promise.all(exercise.media.map(async ({ blob, ...metadata }) => ({
      ...metadata,
      content: {
        encoding: 'base64' as const,
        data: await blobToBase64(blob),
      },
    }))),
  }
}

export async function createSpottrBackup({
  gymService,
  exerciseService,
  workoutService,
  sessionService,
  settingsService,
  now = () => new Date().toISOString(),
}: BackupServices): Promise<SpottrBackup> {
  const [gyms, selectedGym, exercises, workouts, activeSession, completedSessions, settings] = await Promise.all([
    gymService.list(),
    gymService.getSelected(),
    exerciseService.search(),
    workoutService.list(),
    sessionService.getActive(),
    sessionService.listHistory(),
    settingsService.get(),
  ])

  return {
    format: 'spottr-backup',
    version: SPOTTR_BACKUP_VERSION,
    exportedAt: now(),
    entities: {
      gyms,
      selectedGymId: selectedGym?.id ?? null,
      exercises: await Promise.all(exercises.map(exportExercise)),
      workouts,
      activeSession,
      completedSessions,
    },
    settings,
  }
}

export function serializeSpottrBackup(backup: SpottrBackup) {
  const timestamp = backup.exportedAt.replace(/[:.]/g, '-')
  return new File(
    [JSON.stringify(backup, null, 2)],
    `spottr-backup-${timestamp}.json`,
    { type: 'application/json' },
  )
}

export function downloadSpottrBackup(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
