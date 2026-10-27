import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkoutPlanner } from './WorkoutPlanner'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { DEFAULT_SETTINGS } from './settings'

type Fixture = 'initial' | 'sets-reordered' | 'row-reduced' | 'exercise-reordered' | 'both-reordered' | 'squat-first-reduced' | 'row-only'

// Pre-action fixtures are not proof of preceding mutations. The unchanged native
// journeys retain that sequence coverage; each scenario owns fresh services/user.
async function setup(collision: boolean, fixture: Fixture) {
  const user = userEvent.setup()
  const gymService = createGymService(createMemoryGymRepository())
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const gym = await gymService.create({ name: 'North', address: '' })
  const row = await exerciseService.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })
  const squat = await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
  const row42 = { id: 'shared', kind: 'working' as const, weight: 42, reps: 12 }
  const row17 = { id: 'other', kind: 'drop' as const, weight: 17, reps: 8 }
  const reduced = ['row-reduced', 'squat-first-reduced', 'row-only'].includes(fixture)
  const reversedSets = ['sets-reordered', 'both-reordered'].includes(fixture)
  const rowEntry = { id: 'shared', exerciseId: row.id, sets: reduced ? [row17] : reversedSets ? [row17, row42] : [row42, row17] }
  const squatEntry = { id: 'squat-entry', exerciseId: squat.id, sets: [
    { id: 'other', kind: 'working' as const, weight: 60, reps: 5 },
    ...(collision ? [{ id: 'shared', kind: 'working' as const, weight: 25, reps: 8 }] : []),
  ] }
  const squatFirst = ['exercise-reordered', 'both-reordered', 'squat-first-reduced'].includes(fixture)
  const exercises = fixture === 'row-only' ? [rowEntry] : squatFirst ? [squatEntry, rowEntry] : [rowEntry, squatEntry]
  const name = collision ? 'Collision' : 'Strength'
  const workoutService = createWorkoutService(createMemoryWorkoutRepository(collision ? [{
    id: 'collision', name, gymId: gym.id, createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z', exercises,
  }] : []))
  if (!collision) {
    // Ordinary identities remain service-generated, as in the original test.
    await workoutService.create({ name, gymId: gym.id, exercises: exercises.map(entry => ({
      exerciseId: entry.exerciseId, sets: entry.sets.map(({ kind, weight, reps }) => ({ kind, weight, reps })),
    })) })
  }
  render(<WorkoutPlanner {...{ gymService, exerciseService, workoutService }} settings={DEFAULT_SETTINGS} />)
  await screen.findByRole('button', { name: `Edit ${name}` })
  async function enter(label: string) {
    const target = screen.getByRole('button', { name: label })
    for (let i = 0; i < (collision ? 90 : 70) && document.activeElement !== target; i++) {
      const active = document.activeElement
      const shift = active !== document.body && !!active &&
        Boolean(active.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING)
      await user.tab({ shift })
    }
    expect(target).toHaveFocus()
    await user.keyboard('{Enter}')
  }
  await enter(`Edit ${name}`)
  return { user, enter }
}

function focused(role: 'button' | 'combobox', name: string) {
  const target = screen.getByRole(role, { name })
  expect(target).toHaveFocus()
  expect(target.isConnected).toBe(true)
}

it('moves imported Row set down without selecting an overlapping Squat set', async () => {
  const { enter } = await setup(true, 'initial')
  await enter('Move set 1 down — Row, exercise 1')
  focused('button', 'Move set 2 up — Row, exercise 1')
})

it('keeps imported Row exercise down and up destinations connected', async () => {
  const { enter } = await setup(true, 'sets-reordered')
  await enter('Move exercise down — Row, exercise 1')
  focused('button', 'Move exercise up — Row, exercise 2')
  await enter('Move exercise up — Row, exercise 2')
  focused('button', 'Move exercise down — Row, exercise 1')
})

it('removes imported Row second set and focuses its remaining type', async () => {
  const { enter } = await setup(true, 'sets-reordered')
  await enter('Remove set 2 — Row, exercise 1')
  focused('combobox', 'Set 1 type — Row, exercise 1')
})

it('moves reduced imported Row down within its own exercise identity', async () => {
  const { enter } = await setup(true, 'row-reduced')
  await enter('Move exercise down — Row, exercise 1')
  focused('button', 'Move exercise up — Row, exercise 2')
})

it('removes imported Squat retaining Row weight17 and automatic Add set focus', async () => {
  const { enter } = await setup(true, 'squat-first-reduced')
  await enter('Remove Squat — Squat, exercise 1')
  focused('button', 'Add set — Row, exercise 1')
  expect(screen.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' })).toHaveValue(17)
})

it('moves ordinary Row down and automatically focuses its up control', async () => {
  const { enter } = await setup(false, 'initial')
  await enter('Move exercise down — Row, exercise 1')
  focused('button', 'Move exercise up — Row, exercise 2')
})

it('moves ordinary Row set down keeping weight42 associated with set2', async () => {
  const { enter } = await setup(false, 'exercise-reordered')
  await enter('Move set 1 down — Row, exercise 2')
  focused('button', 'Move set 2 up — Row, exercise 2')
  expect(screen.getByRole('spinbutton', { name: 'Set 2 weight (kg) — Row, exercise 2' })).toHaveValue(42)
})

it('removes ordinary Row second set and automatically focuses remaining type', async () => {
  const { enter } = await setup(false, 'both-reordered')
  await enter('Remove set 2 — Row, exercise 2')
  focused('combobox', 'Set 1 type — Row, exercise 2')
})

it('removes ordinary Squat and automatically focuses remaining Row Add set', async () => {
  const { enter } = await setup(false, 'squat-first-reduced')
  await enter('Remove Squat — Squat, exercise 1')
  focused('button', 'Add set — Row, exercise 1')
})

it('saves Row associations, reopens directly from automatic Edit focus and returns from cancel', async () => {
  const { user, enter } = await setup(false, 'row-only')
  await enter('Save workout')
  await waitFor(() => focused('button', 'Edit Strength'))
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('article', { name: 'Squat sets' })).not.toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: 'Row sets' })).getByRole('spinbutton', { name: /weight/ })).toHaveValue(17)
  await enter('Cancel')
  await waitFor(() => focused('button', 'Edit Strength'))
})
