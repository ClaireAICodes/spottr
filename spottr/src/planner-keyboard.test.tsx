import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkoutPlanner } from './WorkoutPlanner'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { DEFAULT_SETTINGS } from './settings'

it('keeps reorder and removal focus within the intended exercise when imported identities overlap', async () => {
  const user = userEvent.setup()
  const gymService = createGymService(createMemoryGymRepository())
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const gym = await gymService.create({ name: 'North', address: '' })
  const row = await exerciseService.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })
  const squat = await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
  const workoutService = createWorkoutService(createMemoryWorkoutRepository([{
    id: 'collision', name: 'Collision', gymId: gym.id, createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z',
    exercises: [
      { id: 'shared', exerciseId: row.id, sets: [{ id: 'shared', kind: 'working', weight: 42, reps: 12 }, { id: 'other', kind: 'drop', weight: 17, reps: 8 }] },
      { id: 'squat-entry', exerciseId: squat.id, sets: [{ id: 'other', kind: 'working', weight: 60, reps: 5 }, { id: 'shared', kind: 'working', weight: 25, reps: 8 }] },
    ],
  }]))
  render(<WorkoutPlanner {...{ gymService, exerciseService, workoutService }} settings={DEFAULT_SETTINGS} />)
  await screen.findByRole('button', { name: 'Edit Collision' })
  async function enter(name: string) {
    const target = screen.getByRole('button', { name })
    // Use Shift+Tab for earlier controls, avoiding a full editor wraparound.
    // Focus is still obtained only through natural keyboard traversal.
    for (let i = 0; i < 90 && document.activeElement !== target; i++) {
      const active = document.activeElement
      const shift = active !== document.body && !!active &&
        Boolean(active.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING)
      await user.tab({ shift })
    }
    expect(target).toHaveFocus()
    await user.keyboard('{Enter}')
  }
  await enter('Edit Collision')
  await enter('Move set 1 down — Row, exercise 1')
  expect(screen.getByRole('button', { name: 'Move set 2 up — Row, exercise 1' })).toHaveFocus()
  await enter('Move exercise down — Row, exercise 1')
  expect(screen.getByRole('button', { name: 'Move exercise up — Row, exercise 2' })).toHaveFocus()
  await enter('Move exercise up — Row, exercise 2')
  expect(screen.getByRole('button', { name: 'Move exercise down — Row, exercise 1' })).toHaveFocus()
  await enter('Remove set 2 — Row, exercise 1')
  expect(screen.getByRole('combobox', { name: 'Set 1 type — Row, exercise 1' })).toHaveFocus()
  await enter('Move exercise down — Row, exercise 1')
  expect(screen.getByRole('button', { name: 'Move exercise up — Row, exercise 2' })).toHaveFocus()
  await enter('Remove Squat — Squat, exercise 1')
  expect(screen.getByRole('button', { name: 'Add set — Row, exercise 1' })).toHaveFocus()
  expect(screen.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' })).toHaveValue(17)
})

it('keeps keyboard reorder and removal destinations live, saves associations and returns from cancel', async () => {
  const user = userEvent.setup()
  const gymService = createGymService(createMemoryGymRepository())
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  const gym = await gymService.create({ name: 'North', address: '' })
  const row = await exerciseService.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })
  const squat = await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
  await workoutService.create({ name: 'Strength', gymId: gym.id, exercises: [
    { exerciseId: row.id, sets: [{ kind: 'working', weight: 42, reps: 12 }, { kind: 'drop', weight: 17, reps: 8 }] },
    { exerciseId: squat.id, sets: [{ kind: 'working', weight: 60, reps: 5 }] },
  ] })
  render(<WorkoutPlanner {...{ gymService, exerciseService, workoutService }} settings={DEFAULT_SETTINGS} />)
  await screen.findByRole('button', { name: 'Edit Strength' })
  async function enter(name: string) {
    const target = screen.getByRole('button', { name })
    // Use Shift+Tab for earlier controls, avoiding a full editor wraparound.
    // Focus is still obtained only through natural keyboard traversal.
    for (let i = 0; i < 70 && document.activeElement !== target; i++) {
      const active = document.activeElement
      const shift = active !== document.body && !!active &&
        Boolean(active.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING)
      await user.tab({ shift })
    }
    expect(target).toHaveFocus()
    await user.keyboard('{Enter}')
  }
  await enter('Edit Strength')
  await enter('Move exercise down — Row, exercise 1')
  expect(screen.getByRole('button', { name: 'Move exercise up — Row, exercise 2' })).toHaveFocus()
  await enter('Move set 1 down — Row, exercise 2')
  expect(screen.getByRole('button', { name: 'Move set 2 up — Row, exercise 2' })).toHaveFocus()
  expect(screen.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 2' })).toHaveValue(42)
  await enter('Remove set 2 — Row, exercise 2')
  expect(screen.getByRole('combobox', { name: 'Set 1 type — Row, exercise 2' })).toHaveFocus()
  await enter('Remove Squat — Squat, exercise 1')
  expect(screen.getByRole('button', { name: 'Add set — Row, exercise 1' })).toHaveFocus()
  await enter('Save workout')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Strength' })).toHaveFocus())
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('article', { name: 'Squat sets' })).not.toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: 'Row sets' })).getByRole('spinbutton', { name: /weight/ })).toHaveValue(17)
  await enter('Cancel')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Strength' })).toHaveFocus())
})
