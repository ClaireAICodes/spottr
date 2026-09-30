export type GymLocation = {
  latitude: number
  longitude: number
  accuracy: number
}

export type Gym = {
  id: string
  name: string
  address: string
  location?: GymLocation
  createdAt: string
  updatedAt: string
}

export type GymDraft = Pick<Gym, 'name' | 'address'> & { location?: GymLocation }

export interface GymRepository {
  list(): Promise<Gym[]>
  get(id: string): Promise<Gym | null>
  save(gym: Gym): Promise<void>
  saveAndSelectIfNone(gym: Gym): Promise<void>
  remove(id: string): Promise<void>
  select(id: string | null): Promise<void>
  getSelectedId(): Promise<string | null>
  replaceAll(gyms: Gym[], selectedId: string | null): Promise<void>
  close?(): Promise<void>
}

export type GymService = Omit<ReturnType<typeof createGymService>, 'waitForIdle'> & {
  waitForIdle?: () => Promise<void>
}

type GymServiceOptions = {
  createId?: () => string
  now?: () => string
}

export function createGymService(repository: GymRepository, options: GymServiceOptions = {}) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())
  let mutationQueue: Promise<void> = Promise.resolve()

  function mutate<T>(operation: () => Promise<T>) {
    const result = mutationQueue.then(operation, operation)
    mutationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  function normalize(draft: GymDraft): GymDraft {
    const name = draft.name.trim()
    if (!name) throw new Error('Gym name is required')
    return { name, address: draft.address.trim(), location: draft.location }
  }

  return {
    async list() {
      return repository.list()
    },

    async get(id: string) {
      return repository.get(id)
    },

    async create(draft: GymDraft) {
      return mutate(async () => {
        const normalized = normalize(draft)
        const timestamp = now()
        const gym: Gym = {
          id: createId(),
          ...normalized,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await repository.saveAndSelectIfNone(gym)
        return gym
      })
    },

    async update(id: string, draft: GymDraft) {
      return mutate(async () => {
        const current = await repository.get(id)
        if (!current) throw new Error('Gym not found')
        const gym: Gym = { ...current, ...normalize(draft), updatedAt: now() }
        await repository.save(gym)
        return gym
      })
    },

    async remove(id: string) {
      await mutate(() => repository.remove(id))
    },

    async select(id: string) {
      await mutate(async () => {
        if (!(await repository.get(id))) throw new Error('Gym not found')
        await repository.select(id)
      })
    },

    async getSelected() {
      return mutate(async () => {
        const id = await repository.getSelectedId()
        if (!id) return null
        const gym = await repository.get(id)
        if (!gym) await repository.select(null)
        return gym
      })
    },

    async replaceAll(gyms: Gym[], selectedId: string | null) {
      await mutate(() => repository.replaceAll(gyms, selectedId))
    },

    async waitForIdle() {
      await mutationQueue
    },
  }
}

export function createMemoryGymRepository(initialGyms: Gym[] = []): GymRepository {
  const gyms = new Map(initialGyms.map((gym) => [gym.id, structuredClone(gym)]))
  let selectedId: string | null = null

  return {
    async list() {
      return [...gyms.values()].map((gym) => structuredClone(gym))
    },
    async get(id) {
      const gym = gyms.get(id)
      return gym ? structuredClone(gym) : null
    },
    async save(gym) {
      gyms.set(gym.id, structuredClone(gym))
    },
    async saveAndSelectIfNone(gym) {
      gyms.set(gym.id, structuredClone(gym))
      if (!selectedId) selectedId = gym.id
    },
    async remove(id) {
      gyms.delete(id)
      if (selectedId === id) selectedId = null
    },
    async select(id) {
      selectedId = id
    },
    async getSelectedId() {
      return selectedId
    },
    async replaceAll(nextGyms, nextSelectedId) {
      gyms.clear()
      nextGyms.forEach((gym) => gyms.set(gym.id, structuredClone(gym)))
      selectedId = nextSelectedId
    },
  }
}
