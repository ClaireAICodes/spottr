import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkoutPlanner } from './WorkoutPlanner'
import { createMemoryDraftRepository, createWorkoutDraftOwner, type DraftRepository } from './workoutDrafts'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { DEFAULT_SETTINGS } from './settings'

async function setup(repository: DraftRepository = createMemoryDraftRepository()) {
  const gymService = createGymService(createMemoryGymRepository())
  const gym = await gymService.create({ name: 'North', address: '' })
  const draftOwner = createWorkoutDraftOwner(repository)
  draftOwner.edit({ schema: 1, id: 'authoring', editorIntentId: 'first', templateId: 'same-template', baseUpdatedAt: null, revision: 1, updatedAt: '2026-10-28T00:00:00Z', datasetGeneration: '0', value: { name: 'Same content', gymId: gym.id, exercises: [] }, numericBuffers: { raw: '42.' }, returnContext: { kind: 'workouts' } })
  const props = { gymService, draftOwner, exerciseService: createExerciseService(createMemoryExerciseRepository()), workoutService: createWorkoutService(createMemoryWorkoutRepository()), settings: DEFAULT_SETTINGS }
  const view = render(<WorkoutPlanner {...props} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  return { props, draftOwner, view }
}

it.each(['revision', 'intent'])('an open confirmation cannot discard a newer %s', async change => {
  const { props, draftOwner, view } = await setup()
  const current = draftOwner.getSnapshot()!
  if (change === 'revision') act(() => draftOwner.edit({ ...current, revision: 2, value: { ...current.value, name: 'Newer revision' } }))
  else {
    await act(async () => {
      await draftOwner.flushDraft(current.id)
      await draftOwner.removeCommitted(current.id, current.revision, current.editorIntentId)
      draftOwner.edit({ ...current, editorIntentId: 'second' })
    })
  }
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not discard the exact draft revision')
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Workout name')).toHaveValue(change === 'revision' ? 'Newer revision' : 'Same content')
  view.unmount()
  render(<WorkoutPlanner {...props} />)
  expect(await screen.findByLabelText('Workout name')).toHaveValue(change === 'revision' ? 'Newer revision' : 'Same content')
  expect(draftOwner.getSnapshot()?.numericBuffers.raw).toBe('42.')
})

it('failed discard keeps a recoverable draft and permits explicit retry', async () => {
  const repository = createMemoryDraftRepository()
  let fail = true
  const { draftOwner } = await setup({ ...repository, async remove(...args) { if (fail) throw new Error('Storage unavailable'); return repository.remove(...args) } })
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your changes are still here')
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Workout name')).toHaveValue('Same content')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  await waitFor(() => expect(screen.queryByLabelText('Workout name')).not.toBeInTheDocument())
  expect(draftOwner.getSnapshot()).toBeNull()
})

it.each(['revision', 'intent'])('held discard disables duplicate submission and Escape, preserving a newer %s arriving during removal', async change => {
  const repository = createMemoryDraftRepository()
  let release!: () => void
  let reached!: () => void
  const held = new Promise<void>(r => { release = r })
  const entered = new Promise<void>(r => { reached = r })
  let calls = 0
  const { draftOwner, view, props } = await setup({ ...repository, async remove(...args) { calls++; reached(); await held; return repository.remove(...args) } })
  try {
    const discard = screen.getByRole('button', { name: 'Discard' })
    await userEvent.click(discard)
    await act(async () => { await entered })
    expect(discard).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeDisabled()
    fireEvent.click(discard)
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Discard draft?' })).toBeInTheDocument()
    const current = draftOwner.getSnapshot()!
    act(() => draftOwner.edit({ ...current, revision: 2, editorIntentId: change === 'intent' ? 'second' : current.editorIntentId, value: { ...current.value, name: 'Arrived during removal' } }))
    await act(async () => { release(); await held })
    if (change === 'intent') {
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not discard the exact draft revision')
      await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Workout name')).toHaveValue('Arrived during removal')
    expect(calls).toBe(1)
    await act(async () => { await draftOwner.flushDraft(current.id) })
    view.unmount()
    const recoveredOwner = createWorkoutDraftOwner(repository)
    await recoveredOwner.recover(current.id, '0')
    render(<WorkoutPlanner {...props} draftOwner={recoveredOwner} />)
    expect(await screen.findByLabelText('Workout name')).toHaveValue('Arrived during removal')
  } finally { release() }
})
