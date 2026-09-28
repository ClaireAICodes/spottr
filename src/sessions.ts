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
  targetDecision?: 'accepting' | 'declining' | 'accepted' | 'declined'
  targetDecisionPreviousTarget?: { weight: number; reps: number }
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
        targetDecisionPreviousTarget: set.targetDecisionPreviousTarget
          ? { ...set.targetDecisionPreviousTarget }
          : undefined,
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

  function updateTargetDecision(
    sessionId: string,
    sessionExerciseId: string,
    setId: string,
    targetDecision: SessionSet['targetDecision'],
    previousTarget?: SessionSet['targetDecisionPreviousTarget'],
  ) {
    return repository.updateHistory(sessionId, (current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => exercise.id === sessionExerciseId
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => {
              if (set.id !== setId) return set
              const { targetDecisionPreviousTarget: _previousTarget, ...setWithoutPreviousTarget } = set
              return {
                ...setWithoutPreviousTarget,
                targetDecision,
                ...(previousTarget ? { targetDecisionPreviousTarget: { ...previousTarget } } : {}),
              }
            }),
          }
        : exercise),
    }))
  }

  async function recoverPendingTargetDecisions() {
    const history = await repository.listHistory()
    for (const completed of history) {
      for (const exercise of completed.exercises) {
        for (const set of exercise.sets) {
          if (set.targetDecision !== 'accepting' && set.targetDecision !== 'declining') continue
          if (!exercise.templateExerciseId || !set.templateSetId) throw new Error('The original workout set is no longer available')
          // An `accepting` marker cannot reveal whether a later decline-intent
          // write failed before it committed. Recovery therefore resolves every
          // unfinished decision conservatively to the captured previous target;
          // an explicit accept retry can still finish acceptance through
          // decideFutureTarget(), but restart must never turn a decline into one.
          const target = set.targetDecisionPreviousTarget
            ?? { weight: set.targetWeight, reps: set.targetReps }
          await workoutService.updateSetTarget(completed.templateId, exercise.templateExerciseId, set.templateSetId, {
            weight: target.weight,
            reps: target.reps,
          })
          await updateTargetDecision(completed.id, exercise.id, set.id, 'declined')
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
        const activeSet = activeExercise?.sets.find(({ id }) => id === setId)
        if (!activeExercise || !activeSet) throw new Error('Session set not found')
        if (activeSet.skippedAt) throw new Error('Return to the skipped set before logging it')
        const historicalSets = (await repository.listHistory())
          .flatMap(({ exercises }) => exercises)
          .filter(({ exerciseId }) => exerciseId === activeExercise.exerciseId)
          .flatMap(({ sets }) => sets)
          .filter((set) => Boolean(set.completedAt))
        const activeSets = activeExercise.sets.filter((set) => set.id !== setId && Boolean(set.completedAt))
        const previousSets = [...historicalSets, ...activeSets]
        const personalRecords: SessionSet['personalRecords'] = []
        if (previousSets.length === 0) {
          // The first completed set establishes both baselines and is intentionally
          // celebrated; later sets must exceed an observed value to earn a PR.
          personalRecords.push('weight', 'set-volume')
        } else {
          const previousMaxWeight = Math.max(...previousSets.map(({ weight }) => weight))
          const previousMaxVolume = Math.max(...previousSets.map(({ weight, reps }) => weight * reps))
          if (actual.weight > previousMaxWeight) personalRecords.push('weight')
          if (actual.weight * actual.reps > previousMaxVolume) personalRecords.push('set-volume')
        }
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
                    if (set.skippedAt) throw new Error('Return to the skipped set before logging it')
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

    async skipSet(sessionExerciseId: string, setId: string) {
      return mutate(() => withSessionLogLock(async () => {
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
                    if (set.completedAt) throw new Error('Completed sets cannot be skipped')
                    return set.skippedAt ? set : { ...set, skippedAt: timestamp }
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

    async returnSet(sessionExerciseId: string, setId: string) {
      return mutate(() => withSessionLogLock(async () => {
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
                    if (set.completedAt) throw new Error('Completed sets cannot be returned')
                    return set.skippedAt ? { ...set, skippedAt: null } : set
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

    async moveExercise(sessionExerciseId: string, direction: 'up' | 'down') {
      return mutate(async () => {
        const timestamp = now()
        const session = await repository.updateActive((current) => {
          const currentIndex = current.exercises.findIndex(({ id }) => id === sessionExerciseId)
          if (currentIndex === -1) throw new Error('Session exercise not found')
          const nextIndex = currentIndex + (direction === 'up' ? -1 : 1)
          if (nextIndex < 0 || nextIndex >= current.exercises.length) {
            throw new Error(`Exercise is already ${direction === 'up' ? 'first' : 'last'}`)
          }
          const exercises = [...current.exercises]
          ;[exercises[currentIndex], exercises[nextIndex]] = [exercises[nextIndex], exercises[currentIndex]]
          return { ...current, exercises, updatedAt: timestamp }
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
        if (set.targetDecision === 'declining' && decision === 'accept') {
          throw new Error('This future target decline is still being finalized')
        }
        if (decision === 'accept') {
          if (!exercise.templateExerciseId || !set.templateSetId) throw new Error('The original workout set is no longer available')
          const currentTemplate = await workoutService.get(completed.templateId)
          const currentTemplateSet = currentTemplate?.exercises
            .find(({ id }) => id === exercise.templateExerciseId)
            ?.sets.find(({ id }) => id === set.templateSetId)
          if (!currentTemplateSet) throw new Error('The original workout set is no longer available')
          const isAcceptanceRetry = set.targetDecision === 'accepting'
          const previousTarget = isAcceptanceRetry
            ? set.targetDecisionPreviousTarget ?? { weight: set.targetWeight, reps: set.targetReps }
            : { weight: currentTemplateSet.weight, reps: currentTemplateSet.reps }
          if (!isAcceptanceRetry) {
            await updateTargetDecision(sessionId, sessionExerciseId, setId, 'accepting', previousTarget)
          }
          try {
            await workoutService.updateSetTarget(
              completed.templateId,
              exercise.templateExerciseId,
              set.templateSetId,
              { weight: set.weight, reps: set.reps },
            )
            return cloneSession(await updateTargetDecision(sessionId, sessionExerciseId, setId, 'accepted'))
          } catch (error) {
            const rollbackErrors: unknown[] = []
            let templateRestored = false
            // The template and history use separate stores, so compensate any
            // partial template write before returning from a failed finalization.
            try {
              await workoutService.updateSetTarget(
                completed.templateId,
                exercise.templateExerciseId,
                set.templateSetId,
                previousTarget,
              )
              templateRestored = true
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError)
            }
            if (!isAcceptanceRetry && templateRestored) {
              try {
                await updateTargetDecision(sessionId, sessionExerciseId, setId, undefined)
              } catch (rollbackError) {
                rollbackErrors.push(rollbackError)
              }
            }
            if (rollbackErrors.length > 0) {
              throw new AggregateError([error, ...rollbackErrors], 'Future target acceptance failed and could not be fully rolled back')
            }
            throw error
          }
        }
        if (set.targetDecision === 'accepting' || set.targetDecision === 'declining') {
          if (!exercise.templateExerciseId || !set.templateSetId) throw new Error('The original workout set is no longer available')
          const previousTarget = set.targetDecisionPreviousTarget
            ?? { weight: set.targetWeight, reps: set.targetReps }
          if (set.targetDecision === 'accepting') {
            try {
              await updateTargetDecision(sessionId, sessionExerciseId, setId, 'declining', previousTarget)
            } catch (error) {
              // The first write may fail before or after the store commits it. Retry
              // the idempotent transition so recovery cannot mistake a decline for
              // an interrupted acceptance, then compensate the visible template.
              const compensationErrors: unknown[] = []
              try {
                await updateTargetDecision(sessionId, sessionExerciseId, setId, 'declining', previousTarget)
              } catch (retryError) {
                compensationErrors.push(retryError)
              }
              try {
                await workoutService.updateSetTarget(
                  completed.templateId,
                  exercise.templateExerciseId,
                  set.templateSetId,
                  previousTarget,
                )
              } catch (rollbackError) {
                compensationErrors.push(rollbackError)
              }
              if (compensationErrors.length > 0) {
                throw new AggregateError(
                  [error, ...compensationErrors],
                  'Future target decline failed and could not be fully preserved',
                )
              }
              throw error
            }
          }
          await workoutService.updateSetTarget(
            completed.templateId,
            exercise.templateExerciseId,
            set.templateSetId,
            previousTarget,
          )
        }
        return cloneSession(await updateTargetDecision(sessionId, sessionExerciseId, setId, 'declined'))
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
