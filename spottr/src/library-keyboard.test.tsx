import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseLibrary } from './ExerciseLibrary'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'

it.each(['success', 'failure'] as const)('returns pending keyboard save focus when overlapping media ends in %s', async (outcome) => {
  const user = userEvent.setup()
  const realService = createExerciseService(createMemoryExerciseRepository(), { prepareVideo: async (file) => file })
  await realService.create({ name: 'Focus probe', muscleGroup: '', equipment: '', notes: '' })
  let releaseSave!: () => void
  let releaseMedia!: () => void
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve })
  const mediaGate = new Promise<void>((resolve) => { releaseMedia = resolve })
  const service = {
    ...realService,
    async update(...args: Parameters<typeof realService.update>) {
      const saved = await realService.update(...args)
      await saveGate
      return saved
    },
    async addMedia(...args: Parameters<typeof realService.addMedia>) {
      await mediaGate
      if (outcome === 'failure') throw new Error('Media preparation failed')
      return realService.addMedia(...args)
    },
  }
  render(<ExerciseLibrary service={service} />)
  const edit = await screen.findByRole('button', { name: 'Edit Focus probe' })
  await user.tab()
  await user.tab()
  await user.tab()
  expect(edit).toHaveFocus()
  await user.keyboard('{Enter}')
  await user.keyboard('{Enter}')
  await screen.findByRole('button', { name: 'Saving…' })
  await user.upload(screen.getByLabelText('Add image or video — Focus probe'), new File(['video'], 'form.mp4', { type: 'video/mp4' }))
  await act(async () => { releaseSave() })
  await waitFor(() => expect(screen.queryByLabelText('Exercise name')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Edit Focus probe' })).toBeDisabled()
  await act(async () => { releaseMedia() })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Focus probe' })).toHaveFocus())
  expect(screen.getByRole('button', { name: 'Edit Focus probe' })).toBeEnabled()
  if (outcome === 'failure') expect(screen.getByRole('alert')).toHaveTextContent('Media preparation failed')
  else expect(screen.getByRole('listitem')).toHaveTextContent('form.mp4')
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('Exercise name')).toHaveValue('Focus probe')
})

it('returns keyboard save focus to search when filtered out, and to the saved exercise when visible', async () => {
  const user = userEvent.setup()
  const service = createExerciseService(createMemoryExerciseRepository())
  render(<ExerciseLibrary service={service} />)
  await screen.findByText('No exercises yet')
  await user.type(screen.getByRole('searchbox'), 'unmatched')
  await screen.findByText('No matching exercises')
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Add exercise' })).toHaveFocus()
  await user.keyboard('{Enter}')
  await user.keyboard('Northside Strength and Conditioning{Enter}')
  await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus())
  expect(screen.getByRole('searchbox')).toHaveValue('unmatched')
  await user.clear(screen.getByRole('searchbox'))
  await screen.findByRole('button', { name: 'Edit Northside Strength and Conditioning' })
  await user.tab()
  await user.keyboard('{Enter}')
  expect(screen.getByLabelText('Exercise name')).toHaveValue('Northside Strength and Conditioning')
  await user.clear(screen.getByLabelText('Exercise name'))
  await user.keyboard('Renamed exercise{Enter}')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Renamed exercise' })).toHaveFocus())
})
