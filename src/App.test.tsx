import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'

describe('Spottr application shell', () => {
  it('exposes five named tabs with Home selected', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: /primary/i })
    const tabs = screen.getAllByRole('tab')

    expect(navigation).toBeInTheDocument()
    expect(tabs).toHaveLength(5)
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Home'),
      expect.stringContaining('Train'),
      expect.stringContaining('Plan'),
      expect.stringContaining('Progress'),
      expect.stringContaining('Profile'),
    ])
    expect(screen.getByRole('tab', { name: /home/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('moves selection and focus with arrow keys', async () => {
    const user = userEvent.setup()
    render(<App />)

    const home = screen.getByRole('tab', { name: /home/i })
    await user.click(home)
    await user.keyboard('{ArrowRight}')

    const train = screen.getByRole('tab', { name: /train/i })
    expect(train).toHaveFocus()
    expect(train).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'Train' })).toBeInTheDocument()
  })

  it('renders presentation-only empty and resume frames on Home', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /ready when you are/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /resume your session/i })).toBeInTheDocument()
    expect(screen.getByText(/preview only/i)).toBeInTheDocument()
  })
})

describe('gym management journey', () => {
  it('creates two gyms, edits and selects one, then restores it after reload', async () => {
    const user = userEvent.setup()
    const service = createGymService(createMemoryGymRepository())
    const firstRender = render(<App gymService={service} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /add gym/i }))
    await user.type(screen.getByLabelText(/gym name/i), 'Northside')
    await user.type(screen.getByLabelText(/address/i), '12 River Road')
    await user.click(screen.getByRole('button', { name: /save gym/i }))

    await user.click(screen.getByRole('button', { name: /add gym/i }))
    await user.type(screen.getByLabelText(/gym name/i), 'Downtown')
    await user.type(screen.getByLabelText(/address/i), '8 Market Street')
    await user.click(screen.getByRole('button', { name: /save gym/i }))

    const downtown = screen.getByRole('article', { name: 'Downtown' })
    await user.click(within(downtown).getByRole('button', { name: /edit/i }))
    const name = screen.getByLabelText(/gym name/i)
    await user.clear(name)
    await user.type(name, 'Downtown Strength')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await user.click(within(screen.getByRole('article', { name: 'Downtown Strength' })).getByRole('button', { name: /select/i }))
    await user.click(screen.getByRole('button', { name: /back to home/i }))

    expect(screen.getByRole('button', { name: /start workout at downtown strength/i })).toBeInTheDocument()

    firstRender.unmount()
    render(<App gymService={service} />)
    expect(await screen.findByRole('button', { name: /start workout at downtown strength/i })).toBeInTheDocument()
  })

  it('falls back to manual entry when location permission is denied', async () => {
    const user = userEvent.setup()
    const service = createGymService(createMemoryGymRepository())
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: 'Permission denied' } as GeolocationPositionError)
        },
      },
    })
    render(<App gymService={service} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /add gym/i }))
    await user.click(screen.getByRole('button', { name: /use current location/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter an address manually/i)
    expect(screen.getByLabelText(/address/i)).toBeEnabled()
  })

  it('ignores a stale location result after moving to a different editor', async () => {
    const user = userEvent.setup()
    const service = createGymService(createMemoryGymRepository())
    let resolveLocation: PositionCallback = () => undefined
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => { resolveLocation = success },
      },
    })
    render(<App gymService={service} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /add gym/i }))
    await user.click(screen.getByRole('button', { name: /use current location/i }))
    expect(screen.getByRole('button', { name: /save gym/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    await user.click(screen.getByRole('button', { name: /add gym/i }))
    act(() => resolveLocation({
      coords: { latitude: 1, longitude: 2, accuracy: 3 } as GeolocationCoordinates,
      timestamp: Date.now(),
      toJSON: () => ({}),
    }))

    expect(screen.getByRole('button', { name: /use current location/i })).toBeInTheDocument()
    expect(screen.queryByText(/current location added/i)).not.toBeInTheDocument()
  })

  it('persists only one gym when save is submitted repeatedly', async () => {
    const user = userEvent.setup()
    const baseService = createGymService(createMemoryGymRepository())
    let createCalls = 0
    let releaseCreate: () => void = () => undefined
    const waitForRelease = new Promise<void>((resolve) => { releaseCreate = resolve })
    const service = {
      ...baseService,
      async create(draft: Parameters<typeof baseService.create>[0]) {
        createCalls += 1
        await waitForRelease
        return baseService.create(draft)
      },
    }
    render(<App gymService={service} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /add gym/i }))
    await user.type(screen.getByLabelText(/gym name/i), 'One Gym')
    const form = screen.getByRole('button', { name: /save gym/i }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(createCalls).toBe(1)
    releaseCreate()
    expect(await screen.findByRole('article', { name: 'One Gym' })).toBeInTheDocument()
  })

  it('prevents another gym mutation while a save is pending', async () => {
    const user = userEvent.setup()
    const baseService = createGymService(createMemoryGymRepository())
    await baseService.create({ name: 'Existing', address: '' })
    let releaseCreate: () => void = () => undefined
    const waitForRelease = new Promise<void>((resolve) => { releaseCreate = resolve })
    const service = {
      ...baseService,
      async create(draft: Parameters<typeof baseService.create>[0]) {
        await waitForRelease
        return baseService.create(draft)
      },
    }
    render(<App gymService={service} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /add gym/i }))
    await user.type(screen.getByLabelText(/gym name/i), 'Pending')
    fireEvent.submit(screen.getByRole('button', { name: /save gym/i }).closest('form')!)

    expect(screen.getByRole('button', { name: /add gym/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /delete existing/i })).toBeDisabled()
    releaseCreate()
    expect(await screen.findByRole('article', { name: 'Pending' })).toBeInTheDocument()
  })

  it('prevents out-of-order gym selections', async () => {
    const user = userEvent.setup()
    const baseService = createGymService(createMemoryGymRepository())
    await baseService.create({ name: 'First', address: '' })
    await baseService.create({ name: 'Second', address: '' })
    await baseService.create({ name: 'Third', address: '' })
    let releaseSelection: () => void = () => undefined
    const waitForRelease = new Promise<void>((resolve) => { releaseSelection = resolve })
    const service = {
      ...baseService,
      async select(id: string) {
        await waitForRelease
        return baseService.select(id)
      },
    }
    render(<App gymService={service} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(within(screen.getByRole('article', { name: 'Second' })).getByRole('button', { name: 'Select' }))

    expect(within(screen.getByRole('article', { name: 'Third' })).getByRole('button', { name: 'Select' })).toBeDisabled()
    releaseSelection()
    expect(await within(screen.getByRole('article', { name: 'Second' })).findByText('Current gym')).toBeInTheDocument()
  })

  it('ignores an older selected-gym load after the service changes', async () => {
    const firstBase = createGymService(createMemoryGymRepository())
    const firstGym = await firstBase.create({ name: 'Old Gym', address: '' })
    const secondService = createGymService(createMemoryGymRepository())
    await secondService.create({ name: 'Current Gym', address: '' })
    let releaseOld: (gym: typeof firstGym) => void = () => undefined
    const oldSelection = new Promise<typeof firstGym>((resolve) => { releaseOld = resolve })
    const firstService = { ...firstBase, getSelected: () => oldSelection }
    const view = render(<App gymService={firstService} />)

    view.rerender(<App gymService={secondService} />)
    expect(await screen.findByRole('button', { name: /start workout at current gym/i })).toBeInTheDocument()
    releaseOld(firstGym)
    await act(async () => { await oldSelection })
    expect(screen.getByRole('button', { name: /start workout at current gym/i })).toBeInTheDocument()
  })

  it('announces selection and deletion failures without hiding existing data', async () => {
    const user = userEvent.setup()
    const baseService = createGymService(createMemoryGymRepository())
    await baseService.create({ name: 'First', address: '' })
    await baseService.create({ name: 'Second', address: '' })
    const service = {
      ...baseService,
      select: async () => { throw new Error('select failed') },
      remove: async () => { throw new Error('remove failed') },
    }
    render(<App gymService={service} />)
    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(within(screen.getByRole('article', { name: 'Second' })).getByRole('button', { name: 'Select' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be selected/i)
    await user.click(screen.getByRole('button', { name: /delete first/i }))
    await user.click(screen.getByRole('button', { name: /delete gym/i }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/could not be deleted/i)
    expect(screen.getByRole('article', { name: 'First', hidden: true })).toBeInTheDocument()
  })

  it('locks a pending delete and moves focus after it succeeds', async () => {
    const user = userEvent.setup()
    const baseService = createGymService(createMemoryGymRepository())
    await baseService.create({ name: 'Pending', address: '' })
    let removeCalls = 0
    let releaseRemove: () => void = () => undefined
    const waitForRemove = new Promise<void>((resolve) => { releaseRemove = resolve })
    const service = {
      ...baseService,
      async remove(id: string) {
        removeCalls += 1
        await waitForRemove
        return baseService.remove(id)
      },
    }
    render(<App gymService={service} />)
    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /delete pending/i }))
    const confirm = screen.getByRole('button', { name: /delete gym/i })
    await user.click(confirm)
    fireEvent.click(confirm)
    await user.keyboard('{Escape}')
    expect(removeCalls).toBe(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep gym/i })).toBeDisabled()
    releaseRemove()
    expect(await screen.findByRole('button', { name: /back to home/i })).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('requires confirmation before deleting a gym', async () => {
    const user = userEvent.setup()
    const service = createGymService(createMemoryGymRepository())
    await service.create({ name: 'Keep Me', address: '' })
    render(<App gymService={service} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /delete keep me/i }))

    const dialog = screen.getByRole('dialog', { name: /delete keep me/i })
    expect(dialog).toBeInTheDocument()
    const keep = within(dialog).getByRole('button', { name: /keep gym/i })
    const confirm = within(dialog).getByRole('button', { name: /delete gym/i })
    expect(keep).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(confirm).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(keep).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete keep me/i })).toHaveFocus()
    expect(screen.getByRole('article', { name: 'Keep Me' })).toBeInTheDocument()
  })
})

describe('exercise library journey', () => {
  it('exerciseLibrary_createSearchEditReload_preservesTheSharedExercise', async () => {
    const user = userEvent.setup()
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    const firstRender = render(<App exerciseService={exerciseService} />)

    await user.click(screen.getByRole('tab', { name: /train/i }))
    await user.click(await screen.findByRole('button', { name: /add exercise/i }))
    await user.type(screen.getByLabelText(/exercise name/i), 'Goblet Squat')
    await user.type(screen.getByLabelText(/muscle group/i), 'Legs')
    await user.type(screen.getByLabelText(/equipment/i), 'Kettlebell')
    await user.type(screen.getByLabelText(/notes/i), 'Keep torso tall')
    await user.click(screen.getByRole('button', { name: /save exercise/i }))

    expect(await screen.findByRole('article', { name: 'Goblet Squat' })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: /search exercises/i }), 'kettle')
    const result = screen.getByRole('article', { name: 'Goblet Squat' })
    await user.click(within(result).getByRole('button', { name: /edit/i }))
    const name = screen.getByLabelText(/exercise name/i)
    await user.clear(name)
    await user.type(name, 'Double Kettlebell Squat')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByRole('article', { name: 'Double Kettlebell Squat' })).toBeInTheDocument()

    firstRender.unmount()
    render(<App exerciseService={exerciseService} />)
    await user.click(screen.getByRole('tab', { name: /train/i }))
    expect(await screen.findByRole('article', { name: 'Double Kettlebell Squat' })).toBeInTheDocument()
  })

  it('exerciseLibrary_searchChangedDuringSave_keepsResultsAlignedWithVisibleQuery', async () => {
    const user = userEvent.setup()
    const baseService = createExerciseService(createMemoryExerciseRepository())
    await baseService.create({ name: 'Goblet Squat', muscleGroup: 'Legs', equipment: 'Kettlebell', notes: '' })
    let releaseUpdate: () => void = () => undefined
    const waitForUpdate = new Promise<void>((resolve) => { releaseUpdate = resolve })
    const service = {
      ...baseService,
      async update(id: string, draft: Parameters<typeof baseService.update>[1]) {
        await waitForUpdate
        return baseService.update(id, draft)
      },
    }
    render(<App exerciseService={service} />)
    await user.click(screen.getByRole('tab', { name: /train/i }))
    const exercise = await screen.findByRole('article', { name: 'Goblet Squat' })
    await user.click(within(exercise).getByRole('button', { name: /edit/i }))
    const name = screen.getByLabelText(/exercise name/i)
    await user.clear(name)
    await user.type(name, 'Double Kettlebell Squat')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await user.type(screen.getByRole('searchbox', { name: /search exercises/i }), 'no-match')
    await waitFor(() => expect(screen.queryByRole('article')).not.toBeInTheDocument())

    releaseUpdate()
    await act(async () => { await waitForUpdate })
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
