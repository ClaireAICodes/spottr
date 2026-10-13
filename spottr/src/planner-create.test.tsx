import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkoutPlanner } from './WorkoutPlanner'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { DEFAULT_SETTINGS } from './settings'

async function setup() {
  const user = userEvent.setup()
  const gymService = createGymService(createMemoryGymRepository())
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  const gym = await gymService.create({ name: 'North', address: '' })
  render(<WorkoutPlanner {...{ gymService, exerciseService, workoutService }} settings={DEFAULT_SETTINGS} />)
  await screen.findByText('Shared exercises', { exact: true }).catch(() => undefined)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add workout' })).toBeEnabled())
  return { user, gym, exerciseService, workoutService }
}

it('creates from an empty library, selects exactly one shared exercise and saves its reference', async () => {
  const { user, gym, exerciseService, workoutService } = await setup()
  await user.click(screen.getByRole('button', { name: 'Add workout' }))
  await user.type(screen.getByLabelText('Workout name'), 'Strength')
  await user.click(screen.getByRole('button', { name: 'Create new exercise' }))
  expect(screen.getByLabelText('Exercise name')).toHaveFocus()
  await user.type(screen.getByLabelText('Exercise name'), 'Row')
  await user.click(screen.getByRole('button', { name: 'Save exercise' }))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Set 1 type — Row, exercise 1' })).toHaveFocus())
  expect(screen.getByLabelText('Workout name')).toHaveValue('Strength')
  expect(screen.getByLabelText('Gym', { exact: true })).toHaveValue(gym.id)
  const entries = await exerciseService.search()
  expect(entries).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Save workout' }))
  await screen.findByRole('button', { name: 'Edit Strength' })
  expect((await workoutService.list())[0].exercises[0].exerciseId).toBe(entries[0].id)
})

it('cancel creates nothing and retains a populated draft, then creation appends without changing targets', async () => {
  const { user, exerciseService, workoutService } = await setup()
  await user.click(screen.getByRole('button', { name: 'Add workout' }))
  await user.type(screen.getByLabelText('Workout name'), 'Draft')
  await user.click(screen.getByRole('button', { name: 'Create new exercise' }))
  await user.type(screen.getByLabelText('Exercise name'), 'Row')
  await user.click(screen.getByRole('button', { name: 'Save exercise' }))
  await screen.findByRole('article', { name: 'Row sets' })
  const weight = screen.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Row, exercise 1' })
  await user.clear(weight)
  await user.type(weight, '42')
  const reps = screen.getByRole('spinbutton', { name: 'Set 1 reps — Row, exercise 1' })
  await user.clear(reps)
  await user.type(reps, '12')
  await user.click(screen.getByRole('button', { name: 'Create new exercise' }))
  await user.type(screen.getByLabelText('Exercise name'), 'Discard me')
  await user.click(screen.getByRole('button', { name: 'Cancel exercise' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create new exercise' })).toHaveFocus())
  expect(await exerciseService.search()).toHaveLength(1)
  expect(weight).toHaveValue(42)
  expect(reps).toHaveValue(12)
  await user.keyboard('{Enter}')
  await user.type(screen.getByLabelText('Exercise name'), 'Squat')
  await user.click(screen.getByRole('button', { name: 'Save exercise' }))
  await screen.findByRole('article', { name: 'Squat sets' })
  await user.click(screen.getByRole('button', { name: 'Save workout' }))
  await screen.findByRole('button', { name: 'Edit Draft' })
  const saved = (await workoutService.list())[0]
  expect(saved.exercises.map((entry) => entry.exerciseId)).toEqual((await exerciseService.search()).map((entry) => entry.id))
  expect(saved.exercises[0].sets[0]).toMatchObject({ weight: 42, reps: 12 })
})
