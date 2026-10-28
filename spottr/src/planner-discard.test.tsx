import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkoutPlanner } from './WorkoutPlanner'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { DEFAULT_SETTINGS } from './settings'

it('Cancel asks before discarding and Keep editing restores the live Cancel control', async () => {
  const user = userEvent.setup()
  const gymService = createGymService(createMemoryGymRepository())
  await gymService.create({ name: 'North', address: '' })
  render(<WorkoutPlanner gymService={gymService} exerciseService={createExerciseService(createMemoryExerciseRepository())} workoutService={createWorkoutService(createMemoryWorkoutRepository())} settings={DEFAULT_SETTINGS} />)
  await user.click(await screen.findByRole('button', { name: 'Add workout' }))
  await user.type(screen.getByLabelText('Workout name'), 'Keep this exact draft')
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  await user.click(cancel)
  expect(await screen.findByRole('dialog', { name: 'Discard draft?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Workout name')).toHaveValue('Keep this exact draft')
  await waitFor(() => expect(cancel).toHaveFocus())
  await user.click(cancel)
  await user.keyboard('{Escape}')
  expect(screen.getByLabelText('Workout name')).toHaveValue('Keep this exact draft')
  await waitFor(() => expect(cancel).toHaveFocus())
  await user.click(cancel)
  await user.click(screen.getByRole('button', { name: 'Discard' }))
  await waitFor(() => expect(screen.queryByLabelText('Workout name')).not.toBeInTheDocument())
})
