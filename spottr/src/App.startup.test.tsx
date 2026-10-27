import 'fake-indexeddb/auto'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const startup = vi.hoisted(() => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  return { pending, release }
})

// Hold only startup scheduling; use the real recovery implementation and stores.
vi.mock('./datasetRecovery', async (importOriginal) => {
  const original = await importOriginal<typeof import('./datasetRecovery')>()
  return {
    ...original,
    createDatasetRecovery: (...args: Parameters<typeof original.createDatasetRecovery>) => {
      const recovery = original.createDatasetRecovery(...args)
      return {
        ...recovery,
        async recover(...recoverArgs: Parameters<typeof recovery.recover>) {
          await startup.pending
          return recovery.recover(...recoverArgs)
        },
      }
    },
  }
})

import { App } from './App'

it('preserves keyboard navigation through pending startup until the selected panel is ready', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: /home/i }))
  await user.keyboard('{ArrowRight}')

  const exercises = screen.getByRole('tab', { name: /exercises/i })
  expect(exercises).toHaveFocus()
  expect(exercises).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { level: 1, name: 'Exercises' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Recovering local data…')
  try {
    expect(screen.queryByRole('tabpanel', { name: 'Exercises' })).not.toBeInTheDocument()
  } finally {
    await act(async () => { startup.release(); await startup.pending })
  }
  expect(await screen.findByRole('tabpanel', { name: 'Exercises' })).toBeInTheDocument()
  expect(screen.queryByText('Recovering local data…')).not.toBeInTheDocument()
  expect(exercises).toHaveFocus()
  expect(exercises).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { level: 1, name: 'Exercises' })).toBeInTheDocument()
})
