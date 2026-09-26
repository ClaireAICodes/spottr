import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveSession } from './ActiveSession'
import { App } from './App'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createGymService, createMemoryGymRepository } from './gyms'
import { SessionSummary } from './SessionSummary'
import { createMemorySessionRepository, createSessionService, type CompletedWorkoutSession } from './sessions'
import { createMemorySettingsRepository, createSettingsService, DEFAULT_SETTINGS, storedWeight } from './settings'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

function completedSession(sets: CompletedWorkoutSession['exercises'][number]['sets']): CompletedWorkoutSession {
  return {
    id: 'session-1',
    templateId: 'workout-1',
    name: 'Strength',
    gymId: 'gym-1',
    gymName: 'Gym',
    startedAt: '2026-09-26T01:00:00.000Z',
    updatedAt: '2026-09-26T02:00:00.000Z',
    endedAt: '2026-09-26T02:00:00.000Z',
    exercises: [{ id: 'session-exercise-1', templateExerciseId: 'template-exercise-1', exerciseId: 'exercise-1', name: 'Squat', sets }],
    summary: { completedExercises: 1, skippedExercises: 0, completedSets: sets.length, skippedSets: 0, volume: 0, durationSeconds: 3600 },
  }
}

function sessionSet(id: string, targetWeight: number, weight: number, targetReps = 5, reps = targetReps) {
  return {
    id,
    templateSetId: `template-${id}`,
    kind: 'working' as const,
    targetWeight,
    targetReps,
    weight,
    reps,
    completedAt: '2026-09-26T01:30:00.000Z',
    skippedAt: null,
    personalRecords: [],
  }
}

describe('reviewer regressions', () => {
  it('keeps the original set number when only a later set has a future-target offer', () => {
    const session = completedSession([
      sessionSet('set-1', 20, 20),
      sessionSet('set-2', 20, 20, 5, 6),
    ])
    const sessionService = { decideFutureTarget: async () => session } as never

    render(<SessionSummary session={session} sessionService={sessionService} settings={DEFAULT_SETTINGS} onDone={() => undefined} onViewHistory={() => undefined} />)

    expect(screen.getByRole('group', { name: 'Future target for Squat set 2' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Future target for Squat set 1' })).not.toBeInTheDocument()
  })

  it('offers a displayed 0.1 lb change but not an unchanged displayed round trip', () => {
    const target = 1
    const session = completedSession([
      sessionSet('set-round-trip', target, storedWeight(2.2, 'lb')),
      sessionSet('set-tenth', target, storedWeight(2.3, 'lb')),
    ])
    const sessionService = { decideFutureTarget: async () => session } as never

    render(<SessionSummary session={session} sessionService={sessionService} settings={{ ...DEFAULT_SETTINGS, weightUnit: 'lb' }} onDone={() => undefined} onViewHistory={() => undefined} />)

    expect(screen.queryByRole('group', { name: /set 1$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: /set 2$/i })).toHaveTextContent('2.3 lb')
  })

  it('clears a saved-settings confirmation after any subsequent edit', async () => {
    const user = userEvent.setup()
    const settingsService = createSettingsService(createMemorySettingsRepository())
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    render(<App settingsService={settingsService} exerciseService={exerciseService} />)

    await user.click(screen.getByRole('tab', { name: /settings/i }))
    await screen.findByLabelText(/weight unit/i)
    await user.click(screen.getByRole('button', { name: /save settings/i }))
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument()

    await user.click(screen.getByLabelText(/pr celebrations/i))
    expect(screen.queryByText('Settings saved.')).not.toBeInTheDocument()
  })

  it('replaces the live-region node when identical session feedback repeats', async () => {
    const user = userEvent.setup()
    const exerciseService = createExerciseService(createMemoryExerciseRepository(), { createId: () => 'exercise-1' })
    const exercise = await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository(), { createId: (() => { let id = 0; return () => `id-${++id}` })() })
    const template = await workoutService.create({
      name: 'Strength',
      gymId: 'gym-1',
      exercises: [{ exerciseId: exercise.id, sets: [
        { kind: 'working', weight: 20, reps: 5 },
        { kind: 'working', weight: 20, reps: 5 },
      ] }],
    })
    const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
    const session = await sessionService.start(template.id, 'Gym')
    render(<ActiveSession initialSession={session} sessionService={sessionService} onSessionChange={() => undefined} onComplete={() => undefined} settings={{ ...DEFAULT_SETTINGS, prCelebrations: false }} />)

    await user.click(screen.getByRole('button', { name: /log squat set 1/i }))
    const firstAnnouncement = await screen.findByRole('status')
    expect(firstAnnouncement).toHaveTextContent('Rest for 90 seconds')
    await user.click(screen.getByRole('button', { name: /log squat set 2/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /logged squat set 2/i })).toBeDisabled())

    const secondAnnouncement = screen.getByRole('status')
    expect(secondAnnouncement).toHaveTextContent('Rest for 90 seconds')
    expect(secondAnnouncement).not.toBe(firstAnnouncement)
  })

  it('uses the selected weight unit in workout target inputs and stores the converted target', async () => {
    const user = userEvent.setup()
    const gymService = createGymService(createMemoryGymRepository())
    const gym = await gymService.create({ name: 'Gym', address: '' })
    const exerciseService = createExerciseService(createMemoryExerciseRepository())
    const exercise = await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository())
    const template = await workoutService.create({ name: 'Strength', gymId: gym.id, exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 20, reps: 5 }] }] })
    const settingsService = createSettingsService(createMemorySettingsRepository({ ...DEFAULT_SETTINGS, weightUnit: 'lb' }))
    render(<App gymService={gymService} exerciseService={exerciseService} workoutService={workoutService} settingsService={settingsService} />)

    await user.click(screen.getByRole('tab', { name: /plan/i }))
    await user.click(within(await screen.findByRole('article', { name: 'Strength' })).getByRole('button', { name: /edit/i }))
    const weight = screen.getByLabelText('Set 1 weight (lb)')
    expect(weight).toHaveValue(44.1)
    await user.clear(weight)
    await user.type(weight, '44.2')
    await user.click(screen.getByRole('button', { name: /save workout/i }))

    expect((await workoutService.get(template.id))?.exercises[0].sets[0].weight).toBe(storedWeight(44.2, 'lb'))
  })

  it('does not mount an active session with fallback units while persisted settings load', async () => {
    let resolveSettings!: (settings: typeof DEFAULT_SETTINGS) => void
    const settingsService = {
      get: () => new Promise<typeof DEFAULT_SETTINGS>((resolve) => { resolveSettings = resolve }),
      update: async (settings: typeof DEFAULT_SETTINGS) => settings,
    }
    const exerciseService = createExerciseService(createMemoryExerciseRepository(), { createId: () => 'exercise-1' })
    await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository(), { createId: (() => { let id = 0; return () => `id-${++id}` })() })
    const template = await workoutService.create({ name: 'Strength', gymId: 'gym-1', exercises: [{ exerciseId: 'exercise-1', sets: [{ kind: 'working', weight: 20, reps: 5 }] }] })
    const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
    await sessionService.start(template.id, 'Gym')
    render(<App exerciseService={exerciseService} workoutService={workoutService} sessionService={sessionService} settingsService={settingsService} />)

    await userEvent.setup().click(await screen.findByRole('button', { name: /resume strength/i }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved settings')
    expect(screen.queryByLabelText(/squat set 1 weight/i)).not.toBeInTheDocument()
    resolveSettings({ ...DEFAULT_SETTINGS, weightUnit: 'lb' })

    expect(await screen.findByLabelText('Squat set 1 weight (lb)')).toHaveValue(44.1)
  })

  it('keeps loaded settings saveable when media usage fails to load', async () => {
    const user = userEvent.setup()
    const settingsService = createSettingsService(createMemorySettingsRepository({ ...DEFAULT_SETTINGS, weightUnit: 'lb' }))
    const exerciseService = {
      ...createExerciseService(createMemoryExerciseRepository()),
      getMediaStorageUsage: async () => { throw new Error('media unavailable') },
    }
    render(<App settingsService={settingsService} exerciseService={exerciseService} />)

    await user.click(screen.getByRole('tab', { name: /settings/i }))
    expect(await screen.findByLabelText(/weight unit/i)).toHaveValue('lb')
    expect(screen.getByText(/media storage usage is unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save settings/i })).toBeEnabled()
  })

  it('moves keyboard focus to the announced result after a future-target decision', async () => {
    const user = userEvent.setup()
    const session = completedSession([sessionSet('set-1', 20, 25)])
    const decided = completedSession([{ ...session.exercises[0].sets[0], targetDecision: 'accepted' }])
    const sessionService = { decideFutureTarget: async () => decided } as never
    render(<SessionSummary session={session} sessionService={sessionService} settings={DEFAULT_SETTINGS} onDone={() => undefined} onViewHistory={() => undefined} />)

    await user.click(screen.getByRole('button', { name: /use this target/i }))

    const result = await screen.findByRole('status')
    expect(result).toHaveTextContent('Target updated')
    expect(result).toHaveFocus()
  })

  it('keeps a failed settings save editable and retryable', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const settingsService = {
      get: async () => ({ ...DEFAULT_SETTINGS, weightUnit: 'lb' as const }),
      update: async (settings: typeof DEFAULT_SETTINGS) => {
        attempts += 1
        if (attempts === 1) throw new Error('save failed')
        return settings
      },
    }
    render(<App settingsService={settingsService} />)
    await user.click(screen.getByRole('tab', { name: /settings/i }))
    const unit = await screen.findByLabelText(/weight unit/i)
    await user.selectOptions(unit, 'kg')

    await user.click(screen.getByRole('button', { name: /save settings/i }))

    expect(await screen.findByText('save failed')).toHaveAttribute('role', 'alert')
    expect(unit).toHaveValue('kg')
    await user.click(screen.getByRole('button', { name: /save settings/i }))
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument()
  })

  it('gates an open active session when the settings service is replaced', async () => {
    let resolveReplacement!: (settings: typeof DEFAULT_SETTINGS) => void
    const replacement = {
      get: () => new Promise<typeof DEFAULT_SETTINGS>((resolve) => { resolveReplacement = resolve }),
      update: async (settings: typeof DEFAULT_SETTINGS) => settings,
    }
    const exerciseService = createExerciseService(createMemoryExerciseRepository(), { createId: () => 'exercise-1' })
    await exerciseService.create({ name: 'Squat', muscleGroup: '', equipment: '', notes: '' })
    const workoutService = createWorkoutService(createMemoryWorkoutRepository(), { createId: (() => { let id = 0; return () => `id-${++id}` })() })
    const template = await workoutService.create({ name: 'Strength', gymId: 'gym-1', exercises: [{ exerciseId: 'exercise-1', sets: [{ kind: 'working', weight: 20, reps: 5 }] }] })
    const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
    await sessionService.start(template.id, 'Gym')
    const props = { exerciseService, workoutService, sessionService }
    const view = render(<App {...props} settingsService={createSettingsService(createMemorySettingsRepository(DEFAULT_SETTINGS))} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /resume strength/i }))
    expect(await screen.findByLabelText('Squat set 1 weight (kg)')).toHaveValue(20)

    view.rerender(<App {...props} settingsService={replacement} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading saved settings')
    expect(screen.queryByLabelText(/squat set 1 weight/i)).not.toBeInTheDocument()
    resolveReplacement({ ...DEFAULT_SETTINGS, weightUnit: 'lb' })
    expect(await screen.findByLabelText('Squat set 1 weight (lb)')).toHaveValue(44.1)
  })
})
