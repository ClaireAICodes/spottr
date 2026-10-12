import 'fake-indexeddb/auto'
import { createIndexedDbExerciseRepository } from './exerciseRepository'
import { createExerciseService, createMemoryExerciseRepository, type Exercise } from './exercises'

const exercise = (count: number): Exercise => ({
  id: 'owned', name: 'Owned', muscleGroup: '', equipment: '', notes: '',
  createdAt: '2026-10-12T12:00:00.000Z', updatedAt: '2026-10-12T12:00:00.000Z',
  media: Array.from({ length: count }, (_, i) => {
    const blob = new Blob([`owned-${i}`], { type: 'image/png' })
    return { id: `m${i}`, kind: 'image', name: `${i}.png`, mimeType: blob.type, size: blob.size, blob, createdAt: '2026-10-12T12:00:00.000Z' }
  }),
})

for (const kind of ['memory', 'indexeddb'] as const) {
  const repository = () => kind === 'memory' ? createMemoryExerciseRepository() : createIndexedDbExerciseRepository(`ingestion-${crypto.randomUUID()}`)
  it(`${kind}: new-record save accepts five, rejects six without writing`, async () => {
    const repo = repository()
    try {
      await repo.save(exercise(5))
      await expect(repo.save({ ...exercise(6), id: 'excess' })).rejects.toThrow(/five/i)
      expect((await repo.list()).map(({ id }) => id)).toEqual(['owned'])
      expect((await repo.get('owned'))?.media.map(({ id }) => id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4'])
    } finally { await repo.close?.() }
  })
  it(`${kind}: repository replacement rejects six before deleting five`, async () => {
    const repo = repository()
    try {
      await repo.replaceAll([exercise(5)])
      await expect(repo.replaceAll([exercise(0), { ...exercise(6), id: 'excess' }])).rejects.toThrow(/five/i)
      expect((await repo.list()).map(({ id }) => id)).toEqual(['owned'])
      expect((await repo.get('owned'))?.media).toHaveLength(5)
    } finally { await repo.close?.() }
  })
  it(`${kind}: service replacement rejects six and preserves current references`, async () => {
    const repo = repository()
    const service = createExerciseService(repo)
    try {
      await service.replaceAll([exercise(5)])
      await expect(service.replaceAll([exercise(6)])).rejects.toThrow(/five/i)
      expect((await service.get('owned'))?.media).toHaveLength(5)
    } finally { await repo.close?.() }
  })
}
