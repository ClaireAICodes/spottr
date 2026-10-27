import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { WorkoutStage } from './WorkoutStage'

test('stage_ready_showsOneTargetAndDelegatesStartWithoutLogging', async () => {
  const start = vi.fn()
  render(<WorkoutStage title="Long exercise name" setNumber={2} totalSets={4} target="20 kg · 8 reps" phase="ready" onPrimary={start} onOverview={() => {}} />)
  expect(screen.getByRole('heading', { name: 'Long exercise name' })).toBeVisible()
  expect(screen.getByText('Set 2 of 4')).toBeVisible()
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Start set' }))
  expect(start).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Workout overview' })).toBeEnabled()
})
