import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'
import { GymManager } from './GymManager'
import { createGymService, createMemoryGymRepository } from './gyms'

afterEach(() => vi.unstubAllGlobals())

it.each([1, 2, 3])('keeps typed details and allows retry and manual save after location error %s', async code => {
  const user = userEvent.setup()
  vi.stubGlobal('isSecureContext', true)
  const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback | null) => error?.({ code } as GeolocationPositionError))
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
  const service = createGymService(createMemoryGymRepository())
  render(<GymManager service={service} onClose={() => {}} onSelectionChange={() => {}} />)
  await user.click(await screen.findByRole('button', { name: 'Add your first gym' }))
  await user.type(screen.getByLabelText('Gym name'), 'Fallback gym')
  await user.type(screen.getByLabelText('Address (optional)'), 'Manual address')
  await user.click(screen.getByRole('button', { name: 'Use current location' }))
  expect(await screen.findByText('Location unavailable. Enter details manually.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Retry location' }))
  expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  await user.click(screen.getByRole('button', { name: 'Save gym' }))
  await screen.findByRole('button', { name: 'Edit Fallback gym' })
  expect((await service.list())[0]).toMatchObject({ name: 'Fallback gym', address: 'Manual address' })
})

it('does not request GPS from an insecure context', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('isSecureContext', false)
  const getCurrentPosition = vi.fn()
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
  render(<GymManager service={createGymService(createMemoryGymRepository())} onClose={() => {}} onSelectionChange={() => {}} />)
  await user.click(await screen.findByRole('button', { name: 'Add your first gym' }))
  await user.click(screen.getByRole('button', { name: 'Use current location' }))
  expect(await screen.findByText('Location unavailable. Enter details manually.')).toBeVisible()
  expect(getCurrentPosition).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save gym' })).toBeEnabled()
})

it('requests fresh coordinates and keeps manual input when GPS returns invalid coordinates', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('isSecureContext', true)
  const getCurrentPosition = vi.fn((success: PositionCallback, _error?: PositionErrorCallback | null, _options?: PositionOptions) => success({ coords: { latitude: 91, longitude: 2, accuracy: 3 } } as GeolocationPosition))
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
  const service = createGymService(createMemoryGymRepository())
  render(<GymManager service={service} onClose={() => {}} onSelectionChange={() => {}} />)
  await user.click(await screen.findByRole('button', { name: 'Add your first gym' }))
  await user.type(screen.getByLabelText('Gym name'), 'Invalid GPS gym')
  await user.click(screen.getByRole('button', { name: 'Use current location' }))
  expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
  expect(await screen.findByText('Location unavailable. Enter details manually.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Save gym' }))
  await screen.findByRole('button', { name: 'Edit Invalid GPS gym' })
  expect((await service.list())[0].location).toBeUndefined()
})

it('saves manually while GPS is pending and ignores its late result in a new editor', async () => {
  const user = userEvent.setup()
  let success!: PositionCallback
  vi.stubGlobal('isSecureContext', true)
  const getCurrentPosition = vi.fn((callback: PositionCallback) => { success = callback })
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
  const service = createGymService(createMemoryGymRepository())
  render(<GymManager service={service} onClose={() => {}} onSelectionChange={() => {}} />)
  await user.click(await screen.findByRole('button', { name: 'Add your first gym' }))
  await user.type(screen.getByLabelText('Gym name'), 'Manual gym')
  await user.type(screen.getByLabelText('Address (optional)'), 'Offline address')
  await user.click(screen.getByRole('button', { name: 'Use current location' }))
  expect(screen.getByRole('button', { name: 'Save gym' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Save gym' }))
  await screen.findByRole('button', { name: 'Edit Manual gym' })
  await user.click(screen.getByRole('button', { name: 'Add gym' }))
  await user.type(screen.getByLabelText('Gym name'), 'Next gym')
  act(() => success({ coords: { latitude: 1, longitude: 2, accuracy: 3 } } as GeolocationPosition))
  expect(screen.queryByText(/Current location added/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Save gym' }))
  await waitFor(async () => expect(await service.list()).toHaveLength(2))
  expect((await service.list()).map(({ name, address, location }) => ({ name, address, location }))).toEqual([
    { name: 'Manual gym', address: 'Offline address', location: undefined },
    { name: 'Next gym', address: '', location: undefined },
  ])
})
