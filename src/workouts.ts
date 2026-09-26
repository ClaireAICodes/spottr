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
  save(template: WorkoutTemplate): Promise<void>
  remove(id: string): Promise<void>
  close?(): Promise<void>
}

export type WorkoutService = ReturnType<typeof createWorkoutService>

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

export function createWorkoutService(repository: WorkoutRepository, options: WorkoutServiceOptions = {}) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())

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
    const usedSetIds = new Set<string>()
    const exercises = draft.exercises.map((exercise) => {
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

    async create(draft: WorkoutTemplateDraft) {
      return withWorkoutIntegrityLock(async () => {
        await ensureGymExists(draft.gymId.trim())
        const timestamp = now()
        const template: WorkoutTemplate = {
          id: createId(),
          ...normalize(draft, undefined, true),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await repository.save(template)
        return cloneTemplate(template)
      })
    },

    async update(id: string, draft: WorkoutTemplateDraft) {
      return withWorkoutIntegrityLock(async () => {
        const current = await requireTemplate(id)
        await ensureGymExists(draft.gymId.trim())
        const template: WorkoutTemplate = {
          ...current,
          ...normalize(draft, current),
          updatedAt: now(),
        }
        await repository.save(template)
        return cloneTemplate(template)
      })
    },

    async updateSetTarget(id: string, templateExerciseId: string, setId: string, target: { weight: number; reps: number }) {
      return withWorkoutIntegrityLock(async () => {
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
          updatedAt: now(),
        }
        await repository.save(template)
        return cloneTemplate(template)
      })
    },

    async duplicate(id: string, gymId: string) {
      return withWorkoutIntegrityLock(async () => {
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
      const current = await requireTemplate(id)
      const exercises = current.exercises.map((exercise) => exercise.id === templateExerciseId
        ? { ...exercise, exerciseId }
        : exercise)
      if (exercises.every((exercise, index) => exercise === current.exercises[index])) {
        throw new Error('Workout exercise not found')
      }
      return this.update(id, { name: current.name, gymId: current.gymId, exercises })
    },

    async removeExercise(id: string, templateExerciseId: string) {
      const current = await requireTemplate(id)
      const exercises = current.exercises.filter((exercise) => exercise.id !== templateExerciseId)
      if (exercises.length === current.exercises.length) throw new Error('Workout exercise not found')
      if (exercises.length === 0) throw new Error('A workout needs at least one exercise')
      return this.update(id, { name: current.name, gymId: current.gymId, exercises })
    },

    async remove(id: string) {
      await withWorkoutIntegrityLock(() => repository.remove(id))
    },
  }
}

export function createMemoryWorkoutRepository(initialTemplates: WorkoutTemplate[] = []): WorkoutRepository {
  const templates = new Map(initialTemplates.map((template) => [template.id, cloneTemplate(template)]))
  return {
    async list() {
      return [...templates.values()].map(cloneTemplate)
    },
    async get(id) {
      const template = templates.get(id)
      return template ? cloneTemplate(template) : null
    },
    async save(template) {
      templates.set(template.id, cloneTemplate(template))
    },
    async remove(id) {
      templates.delete(id)
    },
  }
}
