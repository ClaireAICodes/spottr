import type { ExerciseService } from './exercises'
import type { SetKind, WorkoutService } from './workouts'

export type SessionSet = {
  id: string
  kind: SetKind
  targetWeight: number
  targetReps: number
  weight: number
  reps: number
  completedAt: string | null
  skippedAt: string | null
}

export type SessionExercise = {
  id: string
  exerciseId: string
  name: string
  sets: SessionSet[]
}

export type WorkoutSession = {
  id: string
  templateId: string
  name: string
  gymId: string
  gymName: string
  exercises: SessionExercise[]
  startedAt: string
  updatedAt: string
}

export type SessionSummary = {
  completedExercises: number
  skippedExercises: number
  completedSets: number
  skippedSets: number
  volume: number
  durationSeconds: number
}

export type CompletedWorkoutSession = WorkoutSession & {
  endedAt: string
  summary: SessionSummary
}

export interface SessionRepository {
  getActive(): Promise<WorkoutSession | null>
  createActive(session: WorkoutSession): Promise<boolean>
  updateActive(update: (session: WorkoutSession) => WorkoutSession): Promise<WorkoutSession>
  completeActive(complete: (session: WorkoutSession) => CompletedWorkoutSession): Promise<CompletedWorkoutSession>
  listHistory(): Promise<CompletedWorkoutSession[]>
  getHistory(id: string): Promise<CompletedWorkoutSession | null>
  close?(): Promise<void>
}

export type SessionService = ReturnType<typeof createSessionService>

type SessionServiceOptions = {
  createId?: () => string
  now?: () => string
  resolveGymName?: (gymId: string) => Promise<string | null>
}

function cloneSession<T extends WorkoutSession>(session: T): T {
  const clone = {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  } as T
  if ('summary' in session) {
    const summary = (session as unknown as CompletedWorkoutSession).summary
    return { ...clone, summary: { ...summary } } as T
  }
  return clone
}

export function createSessionService(
  repository: SessionRepository,
  workoutService: WorkoutService,
  exerciseService: ExerciseService,
  options: SessionServiceOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())
  const resolveGymName = options.resolveGymName
  let mutationQueue: Promise<void> = Promise.resolve()

  function mutate<T>(operation: () => Promise<T>) {
    const result = mutationQueue.then(operation, operation)
    mutationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  return {
    async getActive() {
      const session = await repository.getActive()
      return session ? cloneSession(session) : null
    },

    async start(templateId: string, gymName = 'Saved gym') {
      return mutate(async () => {
        if (await repository.getActive()) throw new Error('Resume the active session before starting another workout')
        const template = await workoutService.get(templateId)
        if (!template) throw new Error('Workout not found')
        const timestamp = now()
        const exercises = await Promise.all(template.exercises.map(async (templateExercise) => {
          const exercise = await exerciseService.get(templateExercise.exerciseId)
          if (!exercise) throw new Error('A workout exercise is no longer available')
          return {
            id: createId(),
            exerciseId: exercise.id,
            name: exercise.name,
            sets: templateExercise.sets.map((set) => ({
              id: createId(),
              kind: set.kind,
              targetWeight: set.weight,
              targetReps: set.reps,
              weight: set.weight,
              reps: set.reps,
              completedAt: null,
              skippedAt: null,
            })),
          }
        }))
        const session: WorkoutSession = {
          id: createId(),
          templateId: template.id,
          name: template.name,
          gymId: template.gymId,
          gymName,
          exercises,
          startedAt: timestamp,
          updatedAt: timestamp,
        }
        if (!(await repository.createActive(session))) {
          throw new Error('Resume the active session before starting another workout')
        }
        return cloneSession(session)
      })
    },

    async logSet(sessionExerciseId: string, setId: string, actual: { weight: number; reps: number }) {
      return mutate(async () => {
        if (!Number.isFinite(actual.weight) || actual.weight < 0) throw new Error('Set weight must be zero or greater')
        if (!Number.isInteger(actual.reps) || actual.reps <= 0) throw new Error('Set reps must be a positive whole number')
        const timestamp = now()
        const session = await repository.updateActive((current) => {
          let found = false
          const updated: WorkoutSession = {
            ...current,
            updatedAt: timestamp,
            exercises: current.exercises.map((exercise) => exercise.id === sessionExerciseId
              ? {
                  ...exercise,
                  sets: exercise.sets.map((set) => {
                    if (set.id !== setId) return set
                    found = true
                    if (set.completedAt) throw new Error('Set already logged')
                    return { ...set, ...actual, completedAt: timestamp }
                  }),
                }
              : exercise),
          }
          if (!found) throw new Error('Session set not found')
          return updated
        })
        return cloneSession(session)
      })
    },

    async complete() {
      return mutate(async () => {
        const endedAt = now()
        const active = await repository.getActive()
        const restoredGymName = active && !active.gymName && resolveGymName
          ? await resolveGymName(active.gymId)
          : null
        const completed = await repository.completeActive((current) => {
          const exercises = current.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) => set.completedAt
              ? { ...set, skippedAt: null }
              : { ...set, skippedAt: endedAt }),
          }))
          const sets = exercises.flatMap((exercise) => exercise.sets)
          const completedSets = sets.filter((set) => set.completedAt)
          const completedExercises = exercises.filter((exercise) => exercise.sets.some((set) => set.completedAt)).length
          return {
            ...current,
            gymName: current.gymName || (current.gymId === active?.gymId ? restoredGymName : null) || 'Saved gym',
            exercises,
            updatedAt: endedAt,
            endedAt,
            summary: {
              completedExercises,
              skippedExercises: exercises.length - completedExercises,
              completedSets: completedSets.length,
              skippedSets: sets.length - completedSets.length,
              volume: completedSets.reduce((total, set) => total + (set.weight * set.reps), 0),
              durationSeconds: Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(current.startedAt)) / 1000)),
            },
          }
        })
        return cloneSession(completed)
      })
    },

    async listHistory() {
      return (await repository.listHistory())
        .sort((left, right) => right.endedAt.localeCompare(left.endedAt))
        .map(cloneSession)
    },

    async getHistory(id: string) {
      const session = await repository.getHistory(id)
      return session ? cloneSession(session) : null
    },
  }
}

export function createMemorySessionRepository(
  initialSession: WorkoutSession | null = null,
  initialHistory: CompletedWorkoutSession[] = [],
): SessionRepository {
  let active = initialSession ? cloneSession(initialSession) : null
  const history = new Map(initialHistory.map((session) => [session.id, cloneSession(session)]))
  return {
    async getActive() {
      return active ? cloneSession(active) : null
    },
    async createActive(session) {
      if (active) return false
      active = cloneSession(session)
      return true
    },
    async updateActive(update) {
      if (!active) throw new Error('No active session')
      active = cloneSession(update(cloneSession(active)))
      return cloneSession(active)
    },
    async completeActive(complete) {
      if (!active) throw new Error('No active session')
      const completed = complete(cloneSession(active))
      history.set(completed.id, cloneSession(completed))
      active = null
      return cloneSession(completed)
    },
    async listHistory() {
      return [...history.values()].map(cloneSession)
    },
    async getHistory(id) {
      const session = history.get(id)
      return session ? cloneSession(session) : null
    },
  }
}
