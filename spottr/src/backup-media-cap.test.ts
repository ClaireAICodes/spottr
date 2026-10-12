/// <reference types="node" />
import { createSpottrBackup, parseSpottrBackup, restoreSpottrBackup } from './backup'
import { createExerciseService, createMemoryExerciseRepository, type Exercise } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createSessionService, createMemorySessionRepository } from './sessions'
import { createSettingsService, createMemorySettingsRepository } from './settings'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import 'fake-indexeddb/auto'
import { createIndexedDbExerciseRepository } from './exerciseRepository'
import { Blob as NodeBlob } from 'node:buffer'

const pngs = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg+M8AAAICAQB7CYF4AAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4/58BAAT/Af9dfQKHAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z/AfAAQAAf8iCjrwAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg+P8fAAMBAf+2EqLVAAAAAElFTkSuQmCC',
]

const timestamp = '2026-10-12T12:00:00.000Z'
function setup(count: number) {
  const blobs = pngs.map(data => new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'image/png' }))
  const exercise: Exercise = {
    id: 'owned', name: 'Owned reference', muscleGroup: '', equipment: '', notes: '', createdAt: timestamp, updatedAt: timestamp,
    media: Array.from({ length: count }, (_, i) => ({ id: `media-${i}`, kind: 'image', name: `${i}.png`, mimeType: 'image/png', size: blobs[i].size, blob: blobs[i], createdAt: timestamp })),
  }
  const exerciseService = createExerciseService(createMemoryExerciseRepository([exercise]))
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  return {
    exerciseService, workoutService,
    gymService: createGymService(createMemoryGymRepository()),
    sessionService: createSessionService(createMemorySessionRepository(), workoutService, exerciseService),
    settingsService: createSettingsService(createMemorySettingsRepository()),
    now: () => timestamp,
  }
}

it('accepts five but rejects six imported references before replacing any saved domain', async () => {
  const incoming = setup(5)
  const valid = await createSpottrBackup(incoming)
  expect(parseSpottrBackup(JSON.stringify(valid))).toEqual(valid)
  const excess = await createSpottrBackup(setup(6))
  expect(() => parseSpottrBackup(JSON.stringify(excess))).toThrow(/five.*remove.*source/i)
  const current = setup(1)
  const before = await createSpottrBackup(current)
  await expect(restoreSpottrBackup(excess, current)).rejects.toThrow(/five/i)
  expect(await createSpottrBackup(current)).toEqual(before)
})

it('retains all legacy bytes for read/export/reorder/removal and rollback after failed replacement', async () => {
  const legacy = setup(6)
  const before = await createSpottrBackup(legacy)
  expect(before.entities.exercises[0].media).toHaveLength(6)
  await legacy.exerciseService.moveMedia('owned', 'media-5', 'up')
  const reordered = await createSpottrBackup(legacy)
  expect(reordered.entities.exercises[0].media.map(({ id }) => id)).toEqual(['media-0', 'media-1', 'media-2', 'media-3', 'media-5', 'media-4'])
  expect(Object.fromEntries(reordered.entities.exercises[0].media.map(({ id, content }) => [id, content]))).toEqual(Object.fromEntries(before.entities.exercises[0].media.map(({ id, content }) => [id, content])))
  const replaceAll = legacy.workoutService.replaceAll.bind(legacy.workoutService)
  let calls = 0
  legacy.workoutService.replaceAll = async (workouts) => {
    if (++calls === 1) throw new Error('Owned replacement failure')
    await replaceAll(workouts)
  }
  await expect(restoreSpottrBackup(await createSpottrBackup(setup(0)), legacy)).rejects.toThrow(/restore failed/i)
  expect(await createSpottrBackup(legacy)).toEqual(reordered)
  await legacy.exerciseService.removeMedia('owned', 'media-5')
  const reduced = await createSpottrBackup(legacy)
  expect(reduced.entities.exercises[0].media).toHaveLength(5)
  expect(parseSpottrBackup(JSON.stringify(reduced))).toEqual(reduced)
})

it('preserves distinct inherited IndexedDB bytes across failed replacement, reopen, edit and explicit removal', async () => {
  const name = `legacy-rollback-${crypto.randomUUID()}`
  const inherited = await setup(6).exerciseService.search()
  // fake-indexeddb uses Node structuredClone, which cannot clone jsdom Blobs.
  // Use native cloneable Blobs and adapt only FileReader at this test seam.
  inherited[0].media.forEach((media, i) => {
    media.blob = new NodeBlob([Buffer.from(pngs[i], 'base64')], { type: 'image/png' }) as unknown as Blob
  })
  const Reader = globalThis.FileReader
  class NativeBlobReader {
    result = ''
    error: Error | null = null
    onload?: () => void
    onerror?: () => void
    readAsDataURL(blob: NodeBlob) {
      void blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`
        this.onload?.()
      }, error => { this.error = error; this.onerror?.() })
    }
  }
  vi.stubGlobal('FileReader', NativeBlobReader)
  // Fixture-only legacy migration setup. Observe behavior through services/export.
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name, 1)
    open.onupgradeneeded = () => open.result.createObjectStore('exercises', { keyPath: 'id' })
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('exercises', 'readwrite')
      inherited.forEach(item => tx.objectStore('exercises').put(item))
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })
  const repo = createIndexedDbExerciseRepository(name)
  const legacy = setup(0)
  legacy.exerciseService = createExerciseService(repo)
  try {
    await legacy.exerciseService.update('owned', { name: 'Edited legacy', muscleGroup: '', equipment: '', notes: 'Keep all references' })
    await legacy.exerciseService.moveMedia('owned', 'media-5', 'up')
    const before = await createSpottrBackup(legacy)
    expect(new Set(before.entities.exercises[0].media.map(m => m.content.data)).size).toBe(6)
    const replace = legacy.workoutService.replaceAll.bind(legacy.workoutService)
    let calls = 0
    legacy.workoutService.replaceAll = async (workouts) => {
      if (++calls === 1) throw new Error('Injected replacement failure')
      await replace(workouts)
    }
    await expect(restoreSpottrBackup(await createSpottrBackup(setup(0)), legacy)).rejects.toThrow(/restore failed/i)
    await repo.close?.()
    expect(await createSpottrBackup(legacy)).toEqual(before)
    await expect(legacy.exerciseService.replaceAll(inherited)).rejects.toThrow(/five/i)
    expect(await createSpottrBackup(legacy)).toEqual(before)
    await legacy.exerciseService.removeMedia('owned', 'media-5')
    await repo.close?.()
    const reduced = await createSpottrBackup(legacy)
    expect(reduced.entities.exercises[0].media.map(m => m.id)).toEqual(['media-0', 'media-1', 'media-2', 'media-3', 'media-4'])
    for (const m of reduced.entities.exercises[0].media) {
      expect(m.content).toEqual(before.entities.exercises[0].media.find(entry => entry.id === m.id)!.content)
    }
    expect(parseSpottrBackup(JSON.stringify(reduced))).toEqual(reduced)
  } finally {
    vi.stubGlobal('FileReader', Reader)
    await repo.close?.()
    indexedDB.deleteDatabase(name)
  }
})
