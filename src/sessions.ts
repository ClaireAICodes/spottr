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
  exercises: SessionExercise[]
  startedAt: string
  updatedAt: string
}

export interface SessionRepository {
  getActive(): Promise<WorkoutSession | null>
  createActive(session: WorkoutSession): Promise<boolean>
  updateActive(update: (session: WorkoutSession) => WorkoutSession): Promise<WorkoutSession>
  close?(): Promise<void>
}

export type SessionService = ReturnType<typeof createSessionService>

type SessionServiceOptions = {
  createId?: () => string
  now?: () => string
}

function cloneSession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  }
}

export function createSessionService(
  repository: SessionRepository,
  workoutService: WorkoutService,
  exerciseService: ExerciseService,
  options: SessionServiceOptions = {},
) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())
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

    async start(templateId: string) {
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
            })),
          }
        }))
        const session: WorkoutSession = {
          id: createId(),
          templateId: template.id,
          name: template.name,
          gymId: template.gymId,
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
  }
}

export function createMemorySessionRepository(initialSession: WorkoutSession | null = null): SessionRepository {
  let active = initialSession ? cloneSession(initialSession) : null
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
  }
}
