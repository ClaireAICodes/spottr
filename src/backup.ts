import {
  EXERCISE_IMAGE_MAX_BYTES,
  EXERCISE_MEDIA_TOTAL_BYTES,
  EXERCISE_VIDEO_MAX_BYTES,
  type Exercise,
  type ExerciseService,
} from './exercises'
import type { GymService } from './gyms'
import type { SessionService } from './sessions'
import type { AppSettings, SettingsService } from './settings'
import type { WorkoutService } from './workouts'

export const SPOTTR_BACKUP_VERSION = 1 as const
export const MAX_BACKUP_FILE_BYTES = 40 * 1024 * 1024

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonBlankString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0
}

function isTimestamp(value: unknown) {
  if (!isString(value)) return false
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

function isChronological(start: unknown, end: unknown) {
  return isTimestamp(start) && isTimestamp(end) && Date.parse(end as string) >= Date.parse(start as string)
}

function isWithinSession(timestamp: unknown, start: string, end: string) {
  return timestamp === null || (isTimestamp(timestamp)
    && Date.parse(timestamp as string) >= Date.parse(start)
    && Date.parse(timestamp as string) <= Date.parse(end))
}

function hasUniqueIds(values: unknown[]) {
  const ids = values.map((value) => isRecord(value) ? value.id : undefined)
  return ids.every(isNonBlankString) && new Set(ids).size === ids.length
}

function isHistoryNewestFirst(sessions: unknown[]) {
  for (let index = 1; index < sessions.length; index += 1) {
    const previous = sessions[index - 1]
    const current = sessions[index]
    if (!isRecord(previous) || !isRecord(current)
      || !isString(previous.endedAt) || !isString(current.endedAt)
      || current.endedAt > previous.endedAt) return false
  }
  return true
}

function isGym(value: unknown) {
  if (!isRecord(value)) return false
  const location = value.location
  return isNonBlankString(value.id)
    && isNonBlankString(value.name)
    && isString(value.address)
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt)
    && isChronological(value.createdAt, value.updatedAt)
    && (location === undefined || (isRecord(location)
      && typeof location.latitude === 'number' && Number.isFinite(location.latitude)
      && typeof location.longitude === 'number' && Number.isFinite(location.longitude)
      && typeof location.accuracy === 'number' && Number.isFinite(location.accuracy)))
}

function decodedBase64Size(value: unknown) {
  if (!isString(value) || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null
  try {
    const decoded = atob(value)
    return btoa(decoded) === value ? decoded.length : null
  } catch {
    return null
  }
}

function isExportedExercise(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.media) || !hasUniqueIds(value.media)) return false
  return isNonBlankString(value.id)
    && isNonBlankString(value.name)
    && isString(value.muscleGroup)
    && isString(value.equipment)
    && isString(value.notes)
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt)
    && isChronological(value.createdAt, value.updatedAt)
    && value.media.every((media) => isRecord(media)
      && isNonBlankString(media.id)
      && (media.kind === 'image' || media.kind === 'video')
      && isNonBlankString(media.name)
      && isNonBlankString(media.mimeType)
      && typeof media.size === 'number' && Number.isSafeInteger(media.size) && media.size >= 0
      && media.size <= (media.kind === 'image' ? EXERCISE_IMAGE_MAX_BYTES : EXERCISE_VIDEO_MAX_BYTES)
      && isTimestamp(media.createdAt)
      && isRecord(media.content)
      && media.content.encoding === 'base64'
      && decodedBase64Size(media.content.data) === media.size)
}

function isSetTarget(value: unknown) {
  return isRecord(value)
    && isNonBlankString(value.id)
    && (value.kind === 'warm-up' || value.kind === 'working' || value.kind === 'drop')
    && typeof value.weight === 'number' && Number.isFinite(value.weight) && value.weight >= 0
    && typeof value.reps === 'number' && Number.isSafeInteger(value.reps) && value.reps > 0
}

function isWorkout(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.exercises) || !hasUniqueIds(value.exercises)) return false
  const exerciseIds = value.exercises.map((exercise) => (exercise as Record<string, unknown>).exerciseId)
  return isNonBlankString(value.id)
    && isNonBlankString(value.name)
    && isNonBlankString(value.gymId)
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt)
    && isChronological(value.createdAt, value.updatedAt)
    && value.exercises.length > 0
    && value.exercises.every((exercise) => isRecord(exercise)
      && isNonBlankString(exercise.id)
      && isNonBlankString(exercise.exerciseId)
      && Array.isArray(exercise.sets)
      && exercise.sets.length > 0
      && hasUniqueIds(exercise.sets)
      && exercise.sets.every(isSetTarget))
    && new Set(exerciseIds).size === exerciseIds.length
}

function isSessionSet(value: unknown, start: string, end: string, completedSession: boolean) {
  if (!isRecord(value)) return false
  const previousTarget = value.targetDecisionPreviousTarget
  const hasTargetDecision = value.targetDecision !== undefined
  return isNonBlankString(value.id)
    && (value.templateSetId === undefined || isNonBlankString(value.templateSetId))
    && (value.kind === 'warm-up' || value.kind === 'working' || value.kind === 'drop')
    && typeof value.targetWeight === 'number' && Number.isFinite(value.targetWeight) && value.targetWeight >= 0
    && typeof value.targetReps === 'number' && Number.isSafeInteger(value.targetReps) && value.targetReps > 0
    && typeof value.weight === 'number' && Number.isFinite(value.weight) && value.weight >= 0
    && typeof value.reps === 'number' && Number.isSafeInteger(value.reps) && value.reps > 0
    && isWithinSession(value.completedAt, start, end)
    && isWithinSession(value.skippedAt, start, end)
    && !(value.completedAt && value.skippedAt)
    && (value.personalRecords === undefined || (Array.isArray(value.personalRecords)
      && value.personalRecords.every((record) => record === 'weight' || record === 'set-volume')))
    && (value.targetDecision === undefined || ['accepting', 'declining', 'accepted', 'declined'].includes(String(value.targetDecision)))
    && (!hasTargetDecision || (completedSession && Boolean(value.completedAt) && !value.skippedAt))
    && (previousTarget === undefined || (isRecord(previousTarget)
      && typeof previousTarget.weight === 'number' && Number.isFinite(previousTarget.weight) && previousTarget.weight >= 0
      && typeof previousTarget.reps === 'number' && Number.isSafeInteger(previousTarget.reps) && previousTarget.reps > 0))
}

function isSession(value: unknown, completed: boolean) {
  if (!isRecord(value) || !Array.isArray(value.exercises) || !hasUniqueIds(value.exercises)) return false
  if (!isTimestamp(value.startedAt) || !isTimestamp(value.updatedAt)) return false
  const sessionEnd = completed && isTimestamp(value.endedAt) ? value.endedAt : value.updatedAt
  const exerciseIds = value.exercises.map((exercise) => (exercise as Record<string, unknown>).exerciseId)
  const baseValid = isNonBlankString(value.id)
    && isNonBlankString(value.templateId)
    && isNonBlankString(value.name)
    && isNonBlankString(value.gymId)
    && isNonBlankString(value.gymName)
    && isChronological(value.startedAt, value.updatedAt)
    && (value.restTimer === undefined || (isRecord(value.restTimer)
      && isTimestamp(value.restTimer.startedAt)
      && isTimestamp(value.restTimer.endsAt)
      && isChronological(value.restTimer.startedAt, value.restTimer.endsAt)))
    && value.exercises.every((exercise) => isRecord(exercise)
      && isNonBlankString(exercise.id)
      && (exercise.templateExerciseId === undefined || isNonBlankString(exercise.templateExerciseId))
      && isNonBlankString(exercise.exerciseId)
      && isNonBlankString(exercise.name)
      && Array.isArray(exercise.sets)
      && hasUniqueIds(exercise.sets)
      && exercise.sets.every((set) => isSessionSet(set, value.startedAt as string, sessionEnd as string, completed))
      && (!completed || (exercise.sets as Array<Record<string, unknown>>).every((set) => {
        const pendingDecision = set.targetDecision === 'accepting' || set.targetDecision === 'declining'
        return !pendingDecision || (isNonBlankString(exercise.templateExerciseId) && isNonBlankString(set.templateSetId))
      })))
    && new Set(exerciseIds).size === exerciseIds.length
  if (!baseValid || !completed) return baseValid
  if (!isTimestamp(value.endedAt)
    || !isChronological(value.startedAt, value.endedAt)
    || !isChronological(value.updatedAt, value.endedAt)
    || !isRecord(value.summary)) return false
  const exercises = value.exercises as Array<Record<string, unknown>>
  const sets = exercises.flatMap((exercise) => exercise.sets as Array<Record<string, unknown>>)
  if (sets.some((set) => !set.completedAt && !set.skippedAt)) return false
  const completedSets = sets.filter((set) => set.completedAt)
  const completedExercises = exercises.filter((exercise) => (
    exercise.sets as Array<Record<string, unknown>>
  ).some((set) => set.completedAt)).length
  const durationSeconds = Math.max(0, Math.floor((Date.parse(value.endedAt as string) - Date.parse(value.startedAt as string)) / 1000))
  const { summary } = value
  return ['completedExercises', 'skippedExercises', 'completedSets', 'skippedSets', 'volume', 'durationSeconds']
      .every((key) => typeof summary[key] === 'number' && Number.isFinite(summary[key]) && (summary[key] as number) >= 0)
    && summary.completedExercises === completedExercises
    && summary.skippedExercises === exercises.length - completedExercises
    && summary.completedSets === completedSets.length
    && summary.skippedSets === sets.length - completedSets.length
    && summary.volume === completedSets.reduce((total, set) => total + ((set.weight as number) * (set.reps as number)), 0)
    && summary.durationSeconds === durationSeconds
}

function isSettings(value: unknown) {
  return isRecord(value)
    && (value.weightUnit === 'kg' || value.weightUnit === 'lb')
    && typeof value.progressiveOverloadCues === 'boolean'
    && typeof value.prCelebrations === 'boolean'
    && typeof value.restTimerEnabled === 'boolean'
    && typeof value.restSeconds === 'number'
    && Number.isSafeInteger(value.restSeconds)
    && value.restSeconds >= 15
    && value.restSeconds <= 600
}

function isSpottrBackup(value: unknown): value is SpottrBackup {
  if (!isRecord(value) || !isRecord(value.entities)) return false
  const { entities } = value
  if (!Array.isArray(entities.gyms) || !Array.isArray(entities.exercises)
    || !Array.isArray(entities.workouts) || !Array.isArray(entities.completedSessions)) return false
  if (!hasUniqueIds(entities.gyms) || !hasUniqueIds(entities.exercises)
    || !hasUniqueIds(entities.workouts) || !hasUniqueIds(entities.completedSessions)) return false
  const completedSessions = entities.completedSessions as unknown[]
  const gymIds = new Set(entities.gyms.map((gym) => (gym as Record<string, unknown>).id))
  const exerciseIds = new Set(entities.exercises.map((exercise) => (exercise as Record<string, unknown>).id))
  const completedSessionIds = new Set(completedSessions.map((session) => (
    session as Record<string, unknown>
  ).id))

  const totalMediaBytes = entities.exercises.reduce((total, exercise) => total + (
    isRecord(exercise) && Array.isArray(exercise.media)
      ? exercise.media.reduce((mediaTotal, media) => mediaTotal + (
          isRecord(media) && typeof media.size === 'number' ? media.size : 0
        ), 0)
      : 0
  ), 0)
  return value.format === 'spottr-backup'
    && value.version === SPOTTR_BACKUP_VERSION
    && isTimestamp(value.exportedAt)
    && entities.gyms.every(isGym)
    && (entities.selectedGymId === null || (isString(entities.selectedGymId) && gymIds.has(entities.selectedGymId)))
    && entities.exercises.every(isExportedExercise)
    && totalMediaBytes <= EXERCISE_MEDIA_TOTAL_BYTES
    && entities.workouts.every((workout) => isWorkout(workout)
      && gymIds.has((workout as Record<string, unknown>).gymId)
      && ((workout as Record<string, unknown>).exercises as Array<Record<string, unknown>>)
        .every((exercise) => exerciseIds.has(exercise.exerciseId)))
    && (entities.activeSession === null || isSession(entities.activeSession, false))
    && completedSessions.every((session) => isSession(session, true))
    && (entities.activeSession === null
      || !completedSessionIds.has((entities.activeSession as Record<string, unknown>).id))
    && isHistoryNewestFirst(completedSessions)
    && isSettings(value.settings)
}

export function parseSpottrBackup(serialized: string): SpottrBackup {
  if (new Blob([serialized]).size > MAX_BACKUP_FILE_BYTES) {
    throw new Error('This backup file is too large. Your saved data has not been changed.')
  }
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('This file is not a valid Spottr backup. Your saved data has not been changed.')
  }
  if (isRecord(value) && value.format === 'spottr-backup'
    && typeof value.version === 'number' && value.version !== SPOTTR_BACKUP_VERSION) {
    throw new Error(`Spottr backup version ${value.version} is not supported. Your saved data has not been changed.`)
  }
  if (!isSpottrBackup(value)) {
    throw new Error('This file is not a valid Spottr backup. Your saved data has not been changed.')
  }
  return value
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
  const serialized = JSON.stringify(backup, null, 2)
  const contents = new Blob([serialized], { type: 'application/json' })
  if (contents.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error('This backup is too large to download safely.')
  }
  return new File(
    [contents],
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
