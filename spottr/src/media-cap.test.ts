import 'fake-indexeddb/auto'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createIndexedDbExerciseRepository } from './exerciseRepository'

it.each(['memory', 'indexeddb'])('only one competing fifth attachment commits through %s repository', async (kind) => {
  const name = `media-cap-${crypto.randomUUID()}`
  const repository = kind === 'memory' ? createMemoryExerciseRepository() : createIndexedDbExerciseRepository(name)
  const other = kind === 'memory' ? repository : createIndexedDbExerciseRepository(name)
  const setup = createExerciseService(repository, { prepareImage: async (file) => file })
  const exercise = await setup.create({ name: 'Owned test exercise', muscleGroup: '', equipment: '', notes: '' })
  for (let i = 0; i < 4; i++) await setup.addMedia(exercise.id, new File(['image'], `${i}.png`, { type: 'image/png' }))
  let arrivals = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const prepareImage = async (file: File) => { if (++arrivals === 2) release(); await gate; return file }
  const first = createExerciseService(repository, { prepareImage })
  const second = createExerciseService(other, { prepareImage })
  const results = await Promise.allSettled([
    first.addMedia(exercise.id, new File(['fifth'], 'fifth.png', { type: 'image/png' })),
    second.addMedia(exercise.id, new File(['sixth'], 'sixth.png', { type: 'image/png' })),
  ])
  expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected'])
  expect((await setup.get(exercise.id))?.media).toHaveLength(5)
  expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.message).toMatch(/five/i)
  await repository.close?.()
  await other.close?.()
  if (kind === 'indexeddb') indexedDB.deleteDatabase(name)
})
