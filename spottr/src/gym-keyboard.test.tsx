import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GymManager } from './GymManager'
import { createGymService, createMemoryGymRepository } from './gyms'

it('saves a gym by keyboard and leaves focus at its live edit action', async () => {
  const user = userEvent.setup()
  const service = createGymService(createMemoryGymRepository())
  render(<GymManager service={service} onClose={() => {}} onSelectionChange={() => {}} />)
  await screen.findByRole('button', { name: 'Add your first gym' })
  await user.tab()
  await user.tab()
  expect(screen.getByRole('button', { name: /^Add gym$/ })).toHaveFocus()
  await user.keyboard('{Enter}')
  await user.type(screen.getByLabelText('Gym name'), 'Northside Strength and Conditioning')
  await user.keyboard('{Enter}')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Northside Strength and Conditioning' })).toHaveFocus())
})

it('distinguishes repeated gym names and keeps keyboard focus after selection', async () => {
  const user = userEvent.setup()
  const service = createGymService(createMemoryGymRepository())
  await service.create({ name: 'Northside', address: 'First location' })
  await service.create({ name: 'Northside', address: 'Second location' })
  render(<GymManager service={service} onClose={() => {}} onSelectionChange={() => {}} />)
  await screen.findByText('Second location')
  await user.tab()
  await user.tab()
  await user.tab()
  await user.tab()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Select Northside, gym 2' })).toHaveFocus()
  await user.keyboard('{Enter}')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Northside, gym 2' })).toHaveFocus())
  expect(screen.getByRole('button', { name: 'Selected Northside, gym 2' })).toBeDisabled()
})
