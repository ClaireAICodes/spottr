import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseLibrary } from './ExerciseLibrary'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'

it('addresses repeated exercise and media names independently through public actions', async () => {
  const user = userEvent.setup()
  const service = createExerciseService(createMemoryExerciseRepository())
  const first = await service.create({ name: 'Long repeated exercise name', muscleGroup: '', equipment: '', notes: 'First destination' })
  const second = await service.create({ name: 'Long repeated exercise name', muscleGroup: '', equipment: '', notes: 'Second destination' })
  for (const exercise of [first, second]) {
    for (let i = 0; i < 2; i++) await service.addMedia(exercise.id, new File(['video'], 'same.mp4', { type: 'video/mp4' }))
  }
  render(<ExerciseLibrary service={service} />)
  const destination = await screen.findByRole('article', { name: 'Long repeated exercise name, exercise 2' })
  expect(within(destination).getByText('Second destination')).toBeVisible()
  const remove = screen.getByRole('button', { name: 'Remove same.mp4 — Long repeated exercise name, exercise 2, media 2' })
  await user.click(remove)
  expect(within(destination).getAllByRole('listitem')).toHaveLength(1)
  expect(within(screen.getByRole('article', { name: 'Long repeated exercise name, exercise 1' })).getAllByRole('listitem')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Edit Long repeated exercise name, exercise 2' }))
  expect(screen.getByLabelText('Notes')).toHaveValue('Second destination')
})
