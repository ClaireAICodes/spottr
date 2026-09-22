export type Exercise = {
  id: string
  name: string
  muscleGroup: string
  equipment: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type ExerciseDraft = Pick<Exercise, 'name' | 'muscleGroup' | 'equipment' | 'notes'>

export interface ExerciseRepository {
  list(): Promise<Exercise[]>
  get(id: string): Promise<Exercise | null>
  save(exercise: Exercise): Promise<void>
  close?(): Promise<void>
}

export type ExerciseService = ReturnType<typeof createExerciseService>

type ExerciseServiceOptions = {
  createId?: () => string
  now?: () => string
}

export function createExerciseService(repository: ExerciseRepository, options: ExerciseServiceOptions = {}) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())

  function normalize(draft: ExerciseDraft): ExerciseDraft {
    const name = draft.name.trim()
    if (!name) throw new Error('Exercise name is required')
    return {
      name,
      muscleGroup: draft.muscleGroup.trim(),
      equipment: draft.equipment.trim(),
      notes: draft.notes.trim(),
    }
  }

  return {
    async search(query = '') {
      const normalizedQuery = query.trim().toLocaleLowerCase()
      const exercises = await repository.list()
      return exercises
        .filter((exercise) => !normalizedQuery || [
          exercise.name,
          exercise.muscleGroup,
          exercise.equipment,
          exercise.notes,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
        .sort((left, right) => left.name.localeCompare(right.name))
    },

    async create(draft: ExerciseDraft) {
      const normalized = normalize(draft)
      const timestamp = now()
      const exercise: Exercise = {
        id: createId(),
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await repository.save(exercise)
      return exercise
    },

    async update(id: string, draft: ExerciseDraft) {
      const current = await repository.get(id)
      if (!current) throw new Error('Exercise not found')
      const exercise: Exercise = { ...current, ...normalize(draft), updatedAt: now() }
      await repository.save(exercise)
      return exercise
    },
  }
}

export function createMemoryExerciseRepository(initialExercises: Exercise[] = []): ExerciseRepository {
  const exercises = new Map(initialExercises.map((exercise) => [exercise.id, structuredClone(exercise)]))

  return {
    async list() {
      return [...exercises.values()].map((exercise) => structuredClone(exercise))
    },
    async get(id) {
      const exercise = exercises.get(id)
      return exercise ? structuredClone(exercise) : null
    },
    async save(exercise) {
      exercises.set(exercise.id, structuredClone(exercise))
    },
  }
}
