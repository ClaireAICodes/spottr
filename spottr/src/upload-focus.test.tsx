import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExerciseLibrary } from './ExerciseLibrary'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'

it.each(['success', 'failure', 'departure', 'replacement', 'unmount'] as const)(
  'preserves the upload focus destination through %s', async (outcome) => {
    const user = userEvent.setup()
    const realService = createExerciseService(createMemoryExerciseRepository())
    await realService.create({ name: 'Upload row', muscleGroup: '', equipment: '', notes: '' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const service = {
      ...realService,
      async addMedia(...args: Parameters<typeof realService.addMedia>) {
        await gate
        if (outcome === 'failure') throw new Error('Upload rejected')
        return realService.addMedia(...args)
      },
    }
    const view = render(<><button>Outside library</button><ExerciseLibrary service={service} /></>)
    const picker = await screen.findByLabelText('Add image or video — Upload row')
    for (let i = 0; i < 10 && document.activeElement !== picker; i++) await user.tab()
    expect(picker).toHaveFocus()
    await user.upload(picker, new File(['video'], 'form.mp4', { type: 'video/mp4' }))
    expect(picker).toBeDisabled()
    if (outcome === 'departure') {
      await user.tab()
      expect(screen.getByRole('button', { name: 'Outside library' })).toHaveFocus()
    }
    if (outcome === 'replacement') {
      await user.click(screen.getByRole('searchbox'))
      await user.type(screen.getByRole('searchbox'), 'absent')
      await screen.findByText('No matching exercises')
      await user.clear(screen.getByRole('searchbox'))
      await screen.findByLabelText('Add image or video — Upload row')
      expect(picker.isConnected).toBe(false)
    }
    if (outcome === 'unmount') {
      await user.click(screen.getByRole('button', { name: 'Outside library' }))
      view.rerender(<button>Outside library</button>)
    }
    await act(async () => { release() })
    if (outcome === 'unmount') {
      expect(screen.getByRole('button', { name: 'Outside library' })).toHaveFocus()
      return
    }
    await waitFor(() => expect(screen.getByLabelText('Add image or video — Upload row')).toBeEnabled())
    if (outcome === 'departure') expect(screen.getByRole('button', { name: 'Outside library' })).toHaveFocus()
    else if (outcome === 'replacement') expect(screen.getByRole('searchbox')).toHaveFocus()
    else expect(picker).toHaveFocus()
    if (outcome === 'failure') {
      expect(screen.getByRole('alert')).toHaveTextContent('Upload rejected')
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    } else expect(screen.getAllByRole('listitem')).toHaveLength(1)
  },
)
