import { withWorkoutIntegrityLock } from './workoutIntegrity'

export type SetKind = 'warm-up' | 'working' | 'drop'

export type SetTarget = {
  id: string
  kind: SetKind
  weight: number
  reps: number
}

export type TemplateExercise = {
  id: string
  exerciseId: string
  sets: SetTarget[]
}

export type WorkoutTemplate = {
  id: string
  name: string
  gymId: string
  exercises: TemplateExercise[]
  createdAt: string
  updatedAt: string
}

export type SetTargetDraft = Omit<SetTarget, 'id'> & { id?: string }
export type TemplateExerciseDraft = Omit<TemplateExercise, 'id' | 'sets'> & {
  id?: string
  sets: SetTargetDraft[]
}
export type WorkoutTemplateDraft = Pick<WorkoutTemplate, 'name' | 'gymId'> & {
  exercises: TemplateExerciseDraft[]
}

export interface WorkoutRepository {
  list(): Promise<WorkoutTemplate[]>
  get(id: string): Promise<WorkoutTemplate | null>
  save(template: WorkoutTemplate, expectedUpdatedAt?: string | null, operationId?: string): Promise<void>
  getUpdateOutcome?(operationId: string, targetId: string): Promise<WorkoutTemplate | null>
  remove(id: string): Promise<void>
  replaceAll(templates: WorkoutTemplate[]): Promise<void>
  close?(): Promise<void>
}

export type WorkoutService = Omit<ReturnType<typeof createWorkoutService>, 'waitForIdle'> & {
  waitForIdle?: () => Promise<void>
}

type WorkoutServiceOptions = {
  createId?: () => string
  now?: () => string
  gymExists?: (id: string) => Promise<boolean>
}

function cloneTemplate(template: WorkoutTemplate): WorkoutTemplate {
  return {
    ...template,
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  }
}

// Pure preflight: no journal admission or target write has occurred on rejection.
export function validateWorkoutDraft(draft: WorkoutTemplateDraft) {
  if (!draft.name.trim()) throw new Error('Workout name is required')
  if (!draft.gymId.trim()) throw new Error('Choose a gym')
  if (!draft.exercises.length) throw new Error('Add at least one exercise')
  const seen = new Set<string>()
  for (const exercise of draft.exercises) {
    const id = exercise.exerciseId.trim()
    if (!id) throw new Error('Choose a shared exercise')
    if (seen.has(id)) throw new Error('An exercise can only appear once in a workout')
    seen.add(id)
    if (!exercise.sets.length) throw new Error('Each exercise needs at least one set')
    for (const set of exercise.sets) {
      if (!['warm-up', 'working', 'drop'].includes(set.kind)) throw new Error('Choose a valid set type')
      if (!Number.isFinite(set.weight) || set.weight < 0) throw new Error('Set weight must be zero or greater')
      if (!Number.isInteger(set.reps) || set.reps <= 0) throw new Error('Set reps must be a positive whole number')
    }
  }
}

export function createWorkoutService(repository: WorkoutRepository, options: WorkoutServiceOptions = {}) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())
  let mutationQueue: Promise<void> = Promise.resolve()

  function mutate<T>(operation: () => Promise<T>) {
    const run = () => withWorkoutIntegrityLock(operation)
    const result = mutationQueue.then(run, run)
    mutationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async function ensureGymExists(gymId: string) {
    if (options.gymExists && !(await options.gymExists(gymId))) throw new Error('Gym not found')
  }

  function normalize(
    draft: WorkoutTemplateDraft,
    current?: WorkoutTemplate,
    freshIdentities = false,
  ) {
    const name = draft.name.trim()
    const gymId = draft.gymId.trim()
    if (!name) throw new Error('Workout name is required')
    if (!gymId) throw new Error('Choose a gym')
    if (draft.exercises.length === 0) throw new Error('Add at least one exercise')
    const seen = new Set<string>()
    const usedExerciseIds = new Set<string>()
    const exercises = draft.exercises.map((exercise) => {
      // Set identities are local to their exercise occurrence, including imports.
      const usedSetIds = new Set<string>()
      const exerciseId = exercise.exerciseId.trim()
      if (!exerciseId) throw new Error('Choose a shared exercise')
      if (seen.has(exerciseId)) throw new Error('An exercise can only appear once in a workout')
      seen.add(exerciseId)
      if (exercise.sets.length === 0) throw new Error('Each exercise needs at least one set')
      const existingExercise = !freshIdentities
        ? current?.exercises.find(({ id }) => id === exercise.id && !usedExerciseIds.has(id))
        : undefined
      const referenceId = existingExercise?.id ?? createId()
      usedExerciseIds.add(referenceId)
      return {
        id: referenceId,
        exerciseId,
        sets: exercise.sets.map((set) => {
          if (!['warm-up', 'working', 'drop'].includes(set.kind)) throw new Error('Choose a valid set type')
          if (!Number.isFinite(set.weight) || set.weight < 0) throw new Error('Set weight must be zero or greater')
          if (!Number.isInteger(set.reps) || set.reps <= 0) throw new Error('Set reps must be a positive whole number')
          const existingSet = existingExercise?.sets.find(({ id }) => id === set.id && !usedSetIds.has(id))
          const setId = existingSet?.id ?? createId()
          usedSetIds.add(setId)
          return {
            id: setId,
            kind: set.kind,
            weight: set.weight,
            reps: set.reps,
          }
        }),
      }
    })
    return { name, gymId, exercises }
  }

  async function requireTemplate(id: string) {
    const template = await repository.get(id)
    if (!template) throw new Error('Workout not found')
    return template
  }

  async function updateTemplate(id: string, draft: WorkoutTemplateDraft, expectedUpdatedAt?: string, operationId?: string) {
    if (operationId) {
      if (!repository.getUpdateOutcome) throw new Error('Recoverable workout update storage is unavailable')
      const outcome = await repository.getUpdateOutcome(operationId, id)
      if (outcome) return cloneTemplate(outcome)
    }
    const current = await requireTemplate(id)
    await ensureGymExists(draft.gymId.trim())
    const template: WorkoutTemplate = {
      ...current,
      ...normalize(draft, current),
      updatedAt: new Date(Math.max(Date.parse(now()), Date.parse(current.updatedAt) + 1)).toISOString(),
    }
    await repository.save(template, expectedUpdatedAt ?? current.updatedAt, operationId)
    if (operationId) {
      const outcome = await repository.getUpdateOutcome!(operationId, id)
      if (!outcome) throw new Error('Workout update outcome is unavailable')
      return cloneTemplate(outcome)
    }
    return cloneTemplate(template)
  }

  return {
    async list(gymId?: string) {
      const templates = await repository.list()
      return templates
        .filter((template) => !gymId || template.gymId === gymId)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(cloneTemplate)
    },

    async get(id: string) {
      const template = await repository.get(id)
      return template ? cloneTemplate(template) : null
    },

    async create(draft: WorkoutTemplateDraft, operationId?: string) {
      return mutate(async () => {
        if (operationId) {
          const committed = await repository.get(operationId)
          if (committed) return cloneTemplate(committed)
        }
        await ensureGymExists(draft.gymId.trim())
        const timestamp = now()
        const template: WorkoutTemplate = {
          id: operationId ?? createId(),
          ...normalize(draft, undefined, true),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        try { await repository.save(template, operationId ? null : undefined) }
        catch (error) {
          const committed = operationId ? await repository.get(operationId) : null
          if (committed) return cloneTemplate(committed)
          throw error
        }
        return cloneTemplate(template)
      })
    },

    async update(id: string, draft: WorkoutTemplateDraft, expectedUpdatedAt?: string, operationId?: string) {
          return mutate(() => updateTemplate(id, draft, expectedUpdatedAt, operationId))
    },

    async updateSetTarget(id: string, templateExerciseId: string, setId: string, target: { weight: number; reps: number }) {
      return mutate(async () => {
        const current = await requireTemplate(id)
        let found = false
        const exercises = current.exercises.map((exercise) => exercise.id === templateExerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => {
                if (set.id !== setId) return set
                found = true
                return { ...set, ...target }
              }),
            }
          : exercise)
        if (!found) throw new Error('Workout set not found')
        const template: WorkoutTemplate = {
          ...current,
          ...normalize({ name: current.name, gymId: current.gymId, exercises }, current),
          updatedAt: new Date(Math.max(Date.parse(now()), Date.parse(current.updatedAt) + 1)).toISOString(),
        }
        await repository.save(template, current.updatedAt)
        return cloneTemplate(template)
      })
    },

    async duplicate(id: string, gymId: string) {
      return mutate(async () => {
        const current = await requireTemplate(id)
        await ensureGymExists(gymId.trim())
        const timestamp = now()
        const template: WorkoutTemplate = {
          id: createId(),
          ...normalize({
            name: `${current.name} copy`,
            gymId,
            exercises: current.exercises,
          }, undefined, true),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await repository.save(template)
        return cloneTemplate(template)
      })
    },

    async substituteExercise(id: string, templateExerciseId: string, exerciseId: string) {
      return mutate(async () => {
        const current = await requireTemplate(id)
        const exercises = current.exercises.map((exercise) => exercise.id === templateExerciseId
          ? { ...exercise, exerciseId }
          : exercise)
        if (exercises.every((exercise, index) => exercise === current.exercises[index])) {
          throw new Error('Workout exercise not found')
        }
        return updateTemplate(id, { name: current.name, gymId: current.gymId, exercises })
      })
    },

    async removeExercise(id: string, templateExerciseId: string) {
      return mutate(async () => {
        const current = await requireTemplate(id)
        const exercises = current.exercises.filter((exercise) => exercise.id !== templateExerciseId)
        if (exercises.length === current.exercises.length) throw new Error('Workout exercise not found')
        if (exercises.length === 0) throw new Error('A workout needs at least one exercise')
        return updateTemplate(id, { name: current.name, gymId: current.gymId, exercises })
      })
    },

    async remove(id: string) {
      await mutate(() => repository.remove(id))
    },

    async replaceAll(templates: WorkoutTemplate[]) {
      await mutate(() => repository.replaceAll(templates.map(cloneTemplate)))
    },

    async waitForIdle() {
      await mutationQueue
    },
  }
}

export function createMemoryWorkoutRepository(initialTemplates: WorkoutTemplate[] = []): WorkoutRepository {
  const templates = new Map(initialTemplates.map((template) => [template.id, cloneTemplate(template)]))
  const outcomes = new Map<string, WorkoutTemplate>()
  return {
    async getUpdateOutcome(operationId, targetId) {
      const outcome = outcomes.get(operationId)
      if (outcome && outcome.id !== targetId) throw new Error('Workout operation identity conflict')
      return outcome ? cloneTemplate(outcome) : null
    },
    async list() {
      return [...templates.values()].map(cloneTemplate)
    },
    async get(id) {
      const template = templates.get(id)
      return template ? cloneTemplate(template) : null
    },
    async save(template, expectedUpdatedAt, operationId) {
      if (operationId && outcomes.has(operationId)) {
        if (outcomes.get(operationId)!.id !== template.id) throw new Error('Workout operation identity conflict')
        return
      }
      if (expectedUpdatedAt !== undefined && (expectedUpdatedAt === null ? templates.has(template.id) : templates.get(template.id)?.updatedAt !== expectedUpdatedAt)) throw new Error('Workout changed in another editor. Your draft is retained.')
      templates.set(template.id, cloneTemplate(template))
      if (operationId) outcomes.set(operationId, cloneTemplate(template))
    },
    async remove(id) {
      templates.delete(id)
    },
    async replaceAll(nextTemplates) {
      templates.clear()
      nextTemplates.forEach((template) => templates.set(template.id, cloneTemplate(template)))
    },
  }
}
