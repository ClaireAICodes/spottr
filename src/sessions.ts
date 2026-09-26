import type { ExerciseService } from './exercises'
import type { SetKind, WorkoutService } from './workouts'

export type SessionSet = {
  id: string
  templateSetId?: string
  kind: SetKind
  targetWeight: number
  targetReps: number
  weight: number
  reps: number
  completedAt: string | null
  skippedAt: string | null
  personalRecords?: Array<'weight' | 'set-volume'>
  targetDecision?: 'accepting' | 'accepted' | 'declined'
}

export type SessionExercise = {
  id: string
  templateExerciseId?: string
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
  completeActive(expectedSessionId: string, complete: (session: WorkoutSession) => CompletedWorkoutSession): Promise<CompletedWorkoutSession>
  listHistory(): Promise<CompletedWorkoutSession[]>
  getHistory(id: string): Promise<CompletedWorkoutSession | null>
  updateHistory(id: string, update: (session: CompletedWorkoutSession) => CompletedWorkoutSession): Promise<CompletedWorkoutSession>
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
      sets: exercise.sets.map((set) => ({
        ...set,
        personalRecords: set.personalRecords ? [...set.personalRecords] : undefined,
      })),
    })),
  } as T
  if ('summary' in session) {
    const summary = (session as unknown as CompletedWorkoutSession).summary
    return { ...clone, summary: { ...summary } } as T
  }
  return clone
}

const futureTargetDecisionLockName = 'spottr-future-target-decision'
let futureTargetDecisionQueue: Promise<void> = Promise.resolve()
const sessionLogLockName = 'spottr-session-log'
let sessionLogQueue: Promise<void> = Promise.resolve()

async function withFutureTargetDecisionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(futureTargetDecisionLockName, operation)
  }

  const previous = futureTargetDecisionQueue
  let release: () => void = () => undefined
  futureTargetDecisionQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    return await operation()
  } finally {
    release()
  }
}

async function withSessionLogLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(sessionLogLockName, operation)
  }

  const previous = sessionLogQueue
  let release: () => void = () => undefined
  sessionLogQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    return await operation()
  } finally {
    release()
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
  const resolveGymName = options.resolveGymName
  let mutationQueue: Promise<void> = Promise.resolve()

  function mutate<T>(operation: () => Promise<T>) {
    const result = mutationQueue.then(operation, operation)
    mutationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async function recoverPendingTargetDecisions() {
    const history = await repository.listHistory()
    for (const completed of history) {
      for (const exercise of completed.exercises) {
        for (const set of exercise.sets) {
          if (set.targetDecision !== 'accepting') continue
          if (!exercise.templateExerciseId || !set.templateSetId) throw new Error('The original workout set is no longer available')
          await workoutService.updateSetTarget(completed.templateId, exercise.templateExerciseId, set.templateSetId, {
            weight: set.weight,
            reps: set.reps,
          })
          await repository.updateHistory(completed.id, (current) => ({
            ...current,
            exercises: current.exercises.map((item) => item.id === exercise.id
              ? { ...item, sets: item.sets.map((target) => target.id === set.id ? { ...target, targetDecision: 'accepted' } : target) }
              : item),
          }))
        }
      }
    }
  }

  return {
    async getActive() {
      const session = await repository.getActive()
      return session ? cloneSession(session) : null
    },

    async start(templateId: string, gymName = 'Saved gym') {
      return mutate(async () => {
        if (await repository.getActive()) throw new Error('Resume the active session before starting another workout')
        await withFutureTargetDecisionLock(recoverPendingTargetDecisions)
        const template = await workoutService.get(templateId)
        if (!template) throw new Error('Workout not found')
        const timestamp = now()
        const exercises = await Promise.all(template.exercises.map(async (templateExercise) => {
          const exercise = await exerciseService.get(templateExercise.exerciseId)
          if (!exercise) throw new Error('A workout exercise is no longer available')
          return {
            id: createId(),
            templateExerciseId: templateExercise.id,
            exerciseId: exercise.id,
            name: exercise.name,
            sets: templateExercise.sets.map((set) => ({
              id: createId(),
              templateSetId: set.id,
              kind: set.kind,
              targetWeight: set.weight,
              targetReps: set.reps,
              weight: set.weight,
              reps: set.reps,
              completedAt: null,
              skippedAt: null,
              personalRecords: [],
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
      return mutate(() => withSessionLogLock(async () => {
        if (!Number.isFinite(actual.weight) || actual.weight < 0) throw new Error('Set weight must be zero or greater')
        if (!Number.isInteger(actual.reps) || actual.reps <= 0) throw new Error('Set reps must be a positive whole number')
        const active = await repository.getActive()
        const activeExercise = active?.exercises.find(({ id }) => id === sessionExerciseId)
        if (!activeExercise?.sets.some(({ id }) => id === setId)) throw new Error('Session set not found')
        const historicalSets = (await repository.listHistory())
          .flatMap(({ exercises }) => exercises)
          .filter(({ exerciseId }) => exerciseId === activeExercise.exerciseId)
          .flatMap(({ sets }) => sets)
          .filter((set) => Boolean(set.completedAt))
        const activeSets = activeExercise.sets.filter((set) => set.id !== setId && Boolean(set.completedAt))
        const previousSets = [...historicalSets, ...activeSets]
        const previousMaxWeight = Math.max(...previousSets.map(({ weight }) => weight), Number.NEGATIVE_INFINITY)
        const previousMaxVolume = Math.max(...previousSets.map(({ weight, reps }) => weight * reps), Number.NEGATIVE_INFINITY)
        const personalRecords: SessionSet['personalRecords'] = []
        if (actual.weight > previousMaxWeight) personalRecords.push('weight')
        if (actual.weight * actual.reps > previousMaxVolume) personalRecords.push('set-volume')
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
                    return { ...set, ...actual, completedAt: timestamp, personalRecords }
                  }),
                }
              : exercise),
          }
          if (!found) throw new Error('Session set not found')
          return updated
        })
        return cloneSession(session)
      }))
    },

    async complete() {
      return mutate(async () => {
        const endedAt = now()
        const active = await repository.getActive()
        const restoredGymName = active && !active.gymName && resolveGymName
          ? await resolveGymName(active.gymId)
          : null
        if (!active) throw new Error('No active session')
        const completed = await repository.completeActive(active.id, (current) => {
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

    async decideFutureTarget(
      sessionId: string,
      sessionExerciseId: string,
      setId: string,
      decision: 'accept' | 'decline',
    ) {
      return mutate(() => withFutureTargetDecisionLock(async () => {
        const completed = await repository.getHistory(sessionId)
        if (!completed) throw new Error('Completed workout not found')
        const exercise = completed.exercises.find(({ id }) => id === sessionExerciseId)
        const set = exercise?.sets.find(({ id }) => id === setId)
        if (!exercise || !set?.completedAt) throw new Error('Completed session set not found')
        if (set.targetDecision === 'accepted' || set.targetDecision === 'declined') return cloneSession(completed)
        if (set.weight === set.targetWeight && set.reps === set.targetReps) {
          throw new Error('This set already matches its future target')
        }
        if (decision === 'accept') {
          if (!exercise.templateExerciseId || !set.templateSetId) throw new Error('The original workout set is no longer available')
          if (set.targetDecision !== 'accepting') {
            await repository.updateHistory(sessionId, (current) => ({
              ...current,
              exercises: current.exercises.map((item) => item.id === sessionExerciseId
                ? { ...item, sets: item.sets.map((target) => target.id === setId ? { ...target, targetDecision: 'accepting' } : target) }
                : item),
            }))
          }
          await workoutService.updateSetTarget(
            completed.templateId,
            exercise.templateExerciseId,
            set.templateSetId,
            { weight: set.weight, reps: set.reps },
          )
          return cloneSession(await repository.updateHistory(sessionId, (current) => ({
            ...current,
            exercises: current.exercises.map((item) => item.id === sessionExerciseId
              ? {
                  ...item,
                  sets: item.sets.map((target) => target.id === setId
                    ? { ...target, targetDecision: 'accepted' }
                    : target),
                }
              : item),
          })))
        }
        return cloneSession(await repository.updateHistory(sessionId, (current) => ({
          ...current,
          exercises: current.exercises.map((item) => item.id === sessionExerciseId
            ? {
                ...item,
                sets: item.sets.map((target) => target.id === setId
                ? { ...target, targetDecision: 'declined' }
                : target),
              }
            : item),
        })))
      }))
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
    async completeActive(expectedSessionId, complete) {
      if (!active) throw new Error('No active session')
      if (active.id !== expectedSessionId) throw new Error('Active session changed before completion')
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
    async updateHistory(id, update) {
      const session = history.get(id)
      if (!session) throw new Error('Completed workout not found')
      const updated = cloneSession(update(cloneSession(session)))
      history.set(id, updated)
      return cloneSession(updated)
    },
  }
}
