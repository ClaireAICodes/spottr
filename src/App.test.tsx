import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

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
    render(<App gymService={service} workoutService={createWorkoutService(createMemoryWorkoutRepository())} />)
    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /delete pending/i }))
    const confirm = screen.getByRole('button', { name: /delete gym/i })
    await user.click(confirm)
    fireEvent.click(confirm)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(removeCalls).toBe(1))
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
  it('exerciseMedia_invalidFile_announcesAnActionableError', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const exerciseService = createExerciseService(createMemoryExerciseRepository(), {
      prepareImage: async (file) => file,
    })
    await exerciseService.create({ name: 'Front Squat', muscleGroup: '', equipment: '', notes: '' })
    render(<App exerciseService={exerciseService} />)
    await user.click(screen.getByRole('tab', { name: /train/i }))
    const exercise = await screen.findByRole('article', { name: 'Front Squat' })

    await user.upload(
      within(exercise).getByLabelText(/add image or video/i),
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an image or video/i)
    expect(exercise).toBeInTheDocument()
  })

  it('exerciseMedia_partialBatchFailure_keepsSuccessfulMediaVisible', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const exerciseService = createExerciseService(createMemoryExerciseRepository(), {
      prepareImage: async (file) => file,
    })
    await exerciseService.create({ name: 'Front Squat', muscleGroup: '', equipment: '', notes: '' })
    render(<App exerciseService={exerciseService} />)
    await user.click(screen.getByRole('tab', { name: /train/i }))
    const exercise = await screen.findByRole('article', { name: 'Front Squat' })

    await user.upload(within(exercise).getByLabelText(/add image or video/i), [
      new File(['front'], 'front.png', { type: 'image/png' }),
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      new File(['side'], 'side.mp4', { type: 'video/mp4' }),
    ])

    expect(await within(exercise).findByText('front.png')).toBeInTheDocument()
    expect(await within(exercise).findByText('side.mp4')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an image or video/i)
  })

  it('exerciseMedia_uploadReorderRemove_exposesTheOrderedMediaJourney', async () => {
    const user = userEvent.setup()
    const exerciseService = createExerciseService(createMemoryExerciseRepository(), {
      prepareImage: async (file) => file,
    })
    await exerciseService.create({ name: 'Front Squat', muscleGroup: 'Legs', equipment: 'Barbell', notes: '' })
    render(<App exerciseService={exerciseService} />)
    await user.click(screen.getByRole('tab', { name: /train/i }))
    const exercise = await screen.findByRole('article', { name: 'Front Squat' })

    await user.upload(within(exercise).getByLabelText(/add image or video/i), [
      new File(['front'], 'front.png', { type: 'image/png' }),
      new File(['side'], 'side.mp4', { type: 'video/mp4' }),
    ])

    expect(await within(exercise).findByText('front.png')).toBeInTheDocument()
    const side = await within(exercise).findByRole('listitem', { name: /side.mp4/i })
    const moveUp = within(side).getByRole('button', { name: /move .* up/i })
    await user.click(moveUp)
    expect(moveUp).toHaveFocus()
    expect(within(exercise).getAllByRole('listitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('side.mp4'),
      expect.stringContaining('front.png'),
    ])
    expect(within(exercise).getByLabelText(/preview side.mp4/i)).toHaveAttribute('controls')
    await user.click(within(exercise).getByRole('button', { name: /remove side.mp4/i }))
    expect(within(exercise).queryByText('side.mp4')).not.toBeInTheDocument()
    await waitFor(() => expect(within(exercise).getByLabelText(/add image or video/i)).toHaveFocus())
    expect(within(exercise).getByText(/25 MB total/i)).toBeInTheDocument()
  })

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

describe('workout template journey', () => {
  it('searches shared exercises and deletes only the chosen template', async () => {
    const user = userEvent.setup()
    const gymService = createGymService(createMemoryGymRepository())
    const gym = await gymService.create({ name: 'Gym', address: '' })
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    const squat = await exerciseService.create({ name: 'Back Squat', muscleGroup: '', equipment: '', notes: '' })
    await exerciseService.create({ name: 'Cable Row', muscleGroup: '', equipment: '', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository())
    const original = await workoutService.create({ name: 'Original', gymId: gym.id, exercises: [{ exerciseId: squat.id, sets: [{ kind: 'working', weight: 40, reps: 8 }] }] })
    const copy = await workoutService.duplicate(original.id, gym.id)
    render(<App gymService={gymService} exerciseService={exerciseService} workoutService={workoutService} />)
    await user.click(screen.getByRole('tab', { name: /plan/i }))
    await user.click(screen.getByRole('button', { name: /add workout/i }))
    await user.type(screen.getByRole('searchbox', { name: /search shared exercises/i }), 'row')
    expect(screen.getByRole('button', { name: /add cable row/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add back squat/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    const originalCard = screen.getByRole('article', { name: 'Original' })
    const deleteTrigger = within(originalCard).getByRole('button', { name: /delete/i })
    await user.click(deleteTrigger)
    const dialog = screen.getByRole('dialog', { name: /delete original/i })
    const keep = within(dialog).getByRole('button', { name: /keep workout/i })
    const confirmDelete = within(dialog).getByRole('button', { name: /delete workout/i })
    expect(keep).toHaveFocus()
    await user.keyboard('{Tab}')
    expect(confirmDelete).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteTrigger).toHaveFocus()

    await user.click(deleteTrigger)
    await user.click(within(screen.getByRole('dialog', { name: /delete original/i })).getByRole('button', { name: /delete workout/i }))

    expect(screen.queryByRole('article', { name: 'Original' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add workout/i })).toHaveFocus()
    expect(screen.getByRole('article', { name: 'Original copy' })).toBeInTheDocument()
    expect(await workoutService.get(copy.id)).not.toBeNull()
    expect(await exerciseService.get(squat.id)).not.toBeNull()
  })

  it('prevents deleting a gym while a workout still references it', async () => {
    const user = userEvent.setup()
    const gymService = createGymService(createMemoryGymRepository())
    const gym = await gymService.create({ name: 'Referenced Gym', address: '' })
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    const exercise = await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository())
    await workoutService.create({ name: 'Keep link', gymId: gym.id, exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 40, reps: 8 }] }] })
    render(<App gymService={gymService} exerciseService={exerciseService} workoutService={workoutService} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /delete referenced gym/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete gym/i }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/could not be deleted/i)
    expect(await gymService.getSelected()).toMatchObject({ id: gym.id })
    expect(await workoutService.list(gym.id)).toHaveLength(1)
  })

  it('serializes gym deletion against a concurrent workout write', async () => {
    const user = userEvent.setup()
    const baseGymService = createGymService(createMemoryGymRepository())
    const gym = await baseGymService.create({ name: 'Soon deleted', address: '' })
    let removeStarted = false
    let releaseRemove: () => void = () => undefined
    const removeGate = new Promise<void>((resolve) => { releaseRemove = resolve })
    const gymService = {
      ...baseGymService,
      async remove(id: string) {
        removeStarted = true
        await removeGate
        await baseGymService.remove(id)
      },
    }
    const workoutService = createWorkoutService(createMemoryWorkoutRepository(), {
      gymExists: async (id) => Boolean(await baseGymService.get(id)),
    })
    render(<App gymService={gymService} workoutService={workoutService} />)

    await user.click(await screen.findByRole('button', { name: /manage gyms/i }))
    await user.click(screen.getByRole('button', { name: /delete soon deleted/i }))
    await user.click(screen.getByRole('button', { name: /delete gym/i }))
    await waitFor(() => expect(removeStarted).toBe(true))

    let writeSettled = false
    const writeOutcome = workoutService.create({
      name: 'Stale tab workout',
      gymId: gym.id,
      exercises: [{ exerciseId: 'squat', sets: [{ kind: 'working', weight: 40, reps: 8 }] }],
    }).then(() => 'created', (error: unknown) => error).finally(() => { writeSettled = true })
    await Promise.resolve()
    expect(writeSettled).toBe(false)

    releaseRemove()
    expect(await screen.findByRole('button', { name: /add your first gym/i })).toBeInTheDocument()
    expect(await writeOutcome).toEqual(expect.objectContaining({ message: expect.stringMatching(/gym.*not found/i) }))
    expect(await workoutService.list()).toHaveLength(0)
  })

  it('preserves the workout draft when saving fails', async () => {
    const user = userEvent.setup()
    const gymService = createGymService(createMemoryGymRepository())
    await gymService.create({ name: 'Gym', address: '' })
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    const baseWorkoutService = createWorkoutService(createMemoryWorkoutRepository())
    const workoutService = {
      ...baseWorkoutService,
      create: async () => { throw new Error('Storage unavailable') },
    }
    render(<App gymService={gymService} exerciseService={exerciseService} workoutService={workoutService} />)
    await user.click(screen.getByRole('tab', { name: /plan/i }))
    await user.click(await screen.findByRole('button', { name: /add workout/i }))
    await user.type(screen.getByLabelText(/workout name/i), 'Keep this draft')
    await user.click(screen.getByRole('button', { name: /add squat/i }))

    await user.click(screen.getByRole('button', { name: /save workout/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable')
    expect(screen.getByLabelText(/workout name/i)).toHaveValue('Keep this draft')
    expect(screen.getByRole('article', { name: /squat sets/i })).toBeInTheDocument()
  })

  it('creates, reorders, reloads, duplicates, and varies a gym-linked mixed-set workout', async () => {
    const user = userEvent.setup()
    const gymService = createGymService(createMemoryGymRepository())
    const north = await gymService.create({ name: 'North Gym', address: '' })
    const south = await gymService.create({ name: 'South Gym', address: '' })
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    await exerciseService.create({ name: 'Back Squat', muscleGroup: 'Legs', equipment: 'Barbell', notes: '' })
    await exerciseService.create({ name: 'Cable Row', muscleGroup: 'Back', equipment: 'Cable', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository())
    const firstRender = render(<App gymService={gymService} exerciseService={exerciseService} workoutService={workoutService} />)

    await user.click(screen.getByRole('tab', { name: /plan/i }))
    await user.click(await screen.findByRole('button', { name: /add workout/i }))
    await user.type(screen.getByLabelText(/workout name/i), 'Lower Strength')
    await user.selectOptions(screen.getByLabelText('Gym'), north.id)
    await user.click(screen.getByRole('button', { name: /add back squat/i }))
    const squat = screen.getByRole('article', { name: /back squat sets/i })
    await user.selectOptions(within(squat).getByLabelText(/set 1 type/i), 'warm-up')
    await user.clear(within(squat).getByLabelText(/set 1 weight/i))
    await user.type(within(squat).getByLabelText(/set 1 weight/i), '20')
    await user.clear(within(squat).getByLabelText(/set 1 reps/i))
    await user.type(within(squat).getByLabelText(/set 1 reps/i), '10')
    await user.click(within(squat).getByRole('button', { name: /add set/i }))
    await user.click(within(squat).getByRole('button', { name: /add set/i }))
    await user.selectOptions(within(squat).getByLabelText(/set 3 type/i), 'drop')
    await user.click(screen.getByRole('button', { name: /add cable row/i }))
    await user.click(within(screen.getByRole('article', { name: /cable row sets/i })).getByRole('button', { name: /move exercise up/i }))
    expect(screen.getAllByRole('article', { name: /sets/i }).map((article) => article.getAttribute('aria-label'))).toEqual([
      'Cable Row sets',
      'Back Squat sets',
    ])
    await user.click(screen.getByRole('button', { name: /save workout/i }))
    expect(await screen.findByRole('article', { name: 'Lower Strength' })).toHaveTextContent('2 exercises')

    firstRender.unmount()
    render(<App gymService={gymService} exerciseService={exerciseService} workoutService={workoutService} />)
    await user.click(screen.getByRole('tab', { name: /plan/i }))
    const restored = await screen.findByRole('article', { name: 'Lower Strength' })
    await user.click(within(restored).getByRole('button', { name: /edit/i }))
    expect(screen.getAllByRole('article', { name: /sets/i }).map((article) => article.getAttribute('aria-label'))).toEqual([
      'Cable Row sets',
      'Back Squat sets',
    ])
    expect(within(screen.getByRole('article', { name: /back squat sets/i })).getByLabelText(/set 3 type/i)).toHaveValue('drop')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await user.click(within(screen.getByRole('article', { name: 'Lower Strength' })).getByRole('button', { name: /duplicate/i }))
    await user.selectOptions(screen.getByLabelText(/duplicate to gym/i), south.id)
    await user.click(screen.getByRole('button', { name: /create duplicate/i }))
    const copy = await screen.findByRole('article', { name: 'Lower Strength copy' })
    expect(copy).toHaveTextContent('South Gym')
    await user.click(within(copy).getByRole('button', { name: /edit/i }))
    await user.click(within(screen.getByRole('article', { name: /back squat sets/i })).getByRole('button', { name: /duplicate for variation/i }))
    expect(await screen.findByRole('article', { name: /back squat variation sets/i })).toBeInTheDocument()
    expect(await exerciseService.search('Back Squat')).toHaveLength(2)
  })

  it('shows global exercise edits through shared references', async () => {
    const user = userEvent.setup()
    const gymService = createGymService(createMemoryGymRepository())
    const gym = await gymService.create({ name: 'Gym', address: '' })
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    const exercise = await exerciseService.create({ name: 'Press', muscleGroup: '', equipment: '', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository())
    await workoutService.create({
      name: 'Push',
      gymId: gym.id,
      exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 40, reps: 8 }] }],
    })
    await exerciseService.update(exercise.id, { ...exercise, name: 'Barbell Press' })

    render(<App gymService={gymService} exerciseService={exerciseService} workoutService={workoutService} />)
    await user.click(screen.getByRole('tab', { name: /plan/i }))
    await user.click(within(await screen.findByRole('article', { name: 'Push' })).getByRole('button', { name: /edit/i }))

    expect(screen.getByRole('article', { name: /barbell press sets/i })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /^press sets$/i })).not.toBeInTheDocument()
  })
})
