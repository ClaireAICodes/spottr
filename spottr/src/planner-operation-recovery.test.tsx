import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect } from 'vitest'
import { WorkoutPlanner } from './WorkoutPlanner'
import { createWorkoutDraftOwner, createMemoryDraftRepository } from './workoutDrafts'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { DEFAULT_SETTINGS } from './settings'

function barrier() {
  let release!: () => void
  let reached!: () => void
  const held = new Promise<void>(r => { release = r })
  const entered = new Promise<void>(r => { reached = r })
  return { held, entered, release, reached }
}
async function setup() {
  const gymService = createGymService(createMemoryGymRepository())
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  const gym = await gymService.create({ name: 'North', address: '' })
  const exercise = await exerciseService.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })
  const repository = createMemoryDraftRepository()
  let failCleanup = false
  const draftOwner = createWorkoutDraftOwner({
    ...repository,
    async remove(...args) { if (failCleanup) throw new Error('Cleanup unavailable'); return repository.remove(...args) },
  }, { debounceMs: 60_000 })
  draftOwner.edit({ schema: 1, id: 'authoring', templateId: 'new-intent', baseUpdatedAt: null, revision: 1, updatedAt: '2026-10-26T00:00:00.000Z', datasetGeneration: '0', value: { name: 'Revision one', gymId: gym.id, exercises: [{ id: 'entry', exerciseId: exercise.id, sets: [{ id: 'set', kind: 'working', weight: 20, reps: 8 }] }] }, numericBuffers: { raw: '42.' }, returnContext: { kind: 'workouts' } })
  const props = { gymService, exerciseService, workoutService, draftOwner, settings: DEFAULT_SETTINGS }
  return { props, draftOwner, failCleanup(value: boolean) { failCleanup = value } }
}

it.each(['nested', 'variation'])('rejects duplicate %s admission across remount and does not overwrite later edits', async kind => {
  const { props, draftOwner } = await setup()
  if (kind === 'nested') {
    const current = draftOwner.getSnapshot()!
    draftOwner.edit({ ...current, revision: current.revision + 1, nested: { name: 'New row', muscleGroup: '', equipment: '', notes: '' } })
  }
  const gate = barrier()
  let calls = 0
  const create = props.exerciseService.create
  const duplicate = props.exerciseService.duplicate
  props.exerciseService.create = async draft => { calls++; gate.reached(); await gate.held; return create(draft) }
  props.exerciseService.duplicate = async id => { calls++; gate.reached(); await gate.held; return duplicate(id) }
  const label = kind === 'nested' ? 'Save exercise' : 'Duplicate for variation — Row, exercise 1'
  const first = render(<WorkoutPlanner {...props} />)
  await screen.findByRole('button', { name: label })
  await userEvent.click(screen.getByRole('button', { name: label }))
  await gate.entered
  first.unmount()
  render(<WorkoutPlanner {...props} />)
  await screen.findByLabelText(kind === 'nested' ? 'Exercise name' : 'Workout name')
  if (kind === 'nested') fireEvent.submit(screen.getByLabelText('Exercise name').closest('form')!)
  else fireEvent.click(screen.getByRole('button', { name: label }))
  expect(calls).toBe(1)
  const current = draftOwner.getSnapshot()!
  act(() => draftOwner.edit({ ...current, revision: current.revision + 1, value: { ...current.value, name: 'Later parent' }, nested: kind === 'nested' ? { ...current.nested!, name: 'Later nested' } : null }))
  await act(async () => { gate.release(); await gate.held })
  await waitFor(() => expect(draftOwner.getBusy()).toBe(false))
  expect(draftOwner.getSnapshot()?.value.name).toBe('Later parent')
  expect(draftOwner.getSnapshot()?.value.exercises[0].exerciseId).toBe(current.value.exercises[0].exerciseId)
  if (kind === 'nested') expect(draftOwner.getSnapshot()?.nested?.name).toBe('Later nested')
  expect(calls).toBe(1)
})

it('a held Save never discards a later remounted editor revision', async () => {
  const { props, draftOwner } = await setup()
  const gate = barrier()
  const create = props.workoutService.create
  props.workoutService.create = async draft => { gate.reached(); await gate.held; return create(draft) }
  const first = render(<WorkoutPlanner {...props} />)
  await screen.findByRole('button', { name: 'Save workout' })
  await userEvent.click(screen.getByRole('button', { name: 'Save workout' }))
  await gate.entered
  first.unmount()
  render(<WorkoutPlanner {...props} />)
  const input = await screen.findByLabelText('Workout name')
  expect(input).toBeDisabled()
  const current = draftOwner.getSnapshot()!
  act(() => draftOwner.edit({ ...current, revision: current.revision + 1, value: { ...current.value, name: 'Later revision' } }))
  await act(async () => { gate.release(); await gate.held })
  await waitFor(async () => expect(await props.workoutService.list()).toHaveLength(1))
  expect(screen.getByLabelText('Workout name')).toHaveValue('Later revision')
  expect(draftOwner.getSnapshot()?.numericBuffers.raw).toBe('42.')
  expect((await props.workoutService.list())[0].name).toBe('Revision one')
})

it('held existing-template Save survives remount, discard and reopen at the same revision without consuming the new intent', async () => {
  const { props, draftOwner } = await setup()
  const initial = draftOwner.getSnapshot()!
  const template = await props.workoutService.create(initial.value)
  await draftOwner.flushDraft(initial.id)
  await draftOwner.removeCommitted(initial.id, initial.revision)
  const gate = barrier()
  const update = props.workoutService.update
  props.workoutService.update = async (...args) => { gate.reached(); await gate.held; return update(...args) }
  const first = render(<WorkoutPlanner {...props} />)
  await userEvent.click(await screen.findByRole('button', { name: `Edit ${template.name}` }))
  const captured = draftOwner.getSnapshot()!
  await userEvent.click(screen.getByRole('button', { name: 'Save workout' }))
  await gate.entered
  // Native service reads wait behind its pending write; the remount must still
  // offer the captured existing template after an explicit discard.
  const list = props.workoutService.list
  props.workoutService.list = async () => { await gate.held; return list() }
  first.unmount()
  render(<WorkoutPlanner {...props} />)
  expect(await screen.findByLabelText('Workout name')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(await screen.findByRole('button', { name: `Edit ${template.name}` }))
  const reopened = draftOwner.getSnapshot()!
  expect(reopened.revision).toBe(captured.revision)
  expect(reopened.editorIntentId).not.toBe(captured.editorIntentId)
  await act(async () => { gate.release(); await gate.held })
  await waitFor(() => expect(draftOwner.getBusy()).toBe(false))
  expect(draftOwner.getSnapshot()?.editorIntentId).toBe(reopened.editorIntentId)
  expect(screen.getByLabelText('Workout name')).toHaveValue(template.name)
  expect(screen.getByLabelText('Workout name')).not.toBeDisabled()
})

it('remounted nested completion refresh failure retains committed library ID and refresh retry does not replay creation', async () => {
  const { props, draftOwner } = await setup()
  const current = draftOwner.getSnapshot()!
  draftOwner.edit({ ...current, revision: 2, nested: { name: 'Committed remount row', muscleGroup: '', equipment: '', notes: '' } })
  const gate = barrier()
  const create = props.exerciseService.create
  const search = props.exerciseService.search
  let calls = 0
  let failRefresh = false
  props.exerciseService.create = async value => { calls++; gate.reached(); await gate.held; const result = await create(value); failRefresh = true; return result }
  props.exerciseService.search = async (...args) => { if (failRefresh) throw new Error('Refresh unavailable'); return search(...args) }
  const first = render(<WorkoutPlanner {...props} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Save exercise' }))
  await gate.entered
  first.unmount()
  render(<WorkoutPlanner {...props} />)
  await screen.findByLabelText('Exercise name')
  await act(async () => { gate.release(); await gate.held })
  const createdId = draftOwner.getSnapshot()!.value.exercises.at(-1)!.exerciseId
  expect(await screen.findByRole('alert')).toHaveTextContent(`Library exercise saved as ${createdId}`)
  failRefresh = false
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('article', { name: 'Committed remount row sets' })
  expect(calls).toBe(1)
  expect(await search()).toHaveLength(2)
})

it('retries cleanup after committed create without creating a second template', async () => {
  const { props, failCleanup } = await setup()
  failCleanup(true)
  render(<WorkoutPlanner {...props} />)
  await screen.findByRole('button', { name: 'Save workout' })
  await userEvent.click(screen.getByRole('button', { name: 'Save workout' }))
  await screen.findByRole('alert')
  expect(await props.workoutService.list()).toHaveLength(1)
  failCleanup(false)
  await userEvent.click(screen.getByRole('button', { name: 'Save workout' }))
  await screen.findByRole('button', { name: 'Edit Revision one' })
  expect(await props.workoutService.list()).toHaveLength(1)
})
