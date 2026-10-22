import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { SessionSummary } from './SessionSummary'
import { DEFAULT_SETTINGS } from './settings'
import { createGymService, createMemoryGymRepository } from './gyms'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { createSessionService, createMemorySessionRepository } from './sessions'

async function fixture() {
  const gymService = createGymService(createMemoryGymRepository())
  const gym = await gymService.create({ name: 'Connected Gym', address: '' })
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const exercise = await exerciseService.create({ name: 'Original Row', notes: 'Original setup', muscleGroup: '', equipment: '' })
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  const template = await workoutService.create({ name: 'Connected Workout', gymId: gym.id, exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 40, reps: 8 }] }] })
  const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
  return { gymService, exerciseService, workoutService, sessionService, template, exercise }
}

describe('connected Home journey', () => {
  it('keeps equal local set IDs in distinct summary occurrences and restores the chosen result only', async () => {
    const f = await fixture()
    const active = await f.sessionService.start(f.template.id, 'Connected Gym')
    const occurrence = active.exercises[0]
    await f.sessionService.logSet(occurrence.id, occurrence.sets[0].id, { weight: 45, reps: 8 })
    const saved = await f.sessionService.complete()
    const second = { ...saved.exercises[0], id: 'second-occurrence' }
    const session = { ...saved, exercises: [saved.exercises[0], second] }
    const user = userEvent.setup()
    const service = { ...f.sessionService, decideFutureTarget: async (_s: string, exerciseId: string) => ({ ...session, exercises: session.exercises.map(ex => ex.id === exerciseId ? { ...ex, sets: ex.sets.map(set => ({ ...set, targetDecision: 'declined' as const })) } : ex) }) }
    render(<SessionSummary session={session} sessionService={service} settings={DEFAULT_SETTINGS} onDone={() => {}} onViewHistory={() => {}} />)
    const groups = screen.getAllByRole('group')
    expect(groups[0].getAttribute('aria-label')).not.toEqual(groups[1].getAttribute('aria-label'))
    await user.click(within(groups[0]).getByRole('button', { name: /keep current target/i }))
    expect(await within(groups[0]).findByText('Current target kept')).toHaveFocus()
    expect(within(groups[1]).getByRole('button', { name: /keep current target/i })).toBeInTheDocument()
  })

  it('does not steal newer navigation focus on a held target decision success or failure', async () => {
    const f = await fixture()
    const active = await f.sessionService.start(f.template.id, 'Connected Gym')
    await f.sessionService.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 45, reps: 8 })
    const session = await f.sessionService.complete()
    let release!: (value: typeof session) => void
    let reject!: (reason: Error) => void
    const service = { ...f.sessionService, decideFutureTarget: () => new Promise<typeof session>((yes, no) => { release = yes; reject = no }) }
    const user = userEvent.setup()
    render(<SessionSummary session={session} sessionService={service} settings={DEFAULT_SETTINGS} onDone={() => {}} onViewHistory={() => {}} />)
    await user.click(screen.getByRole('button', { name: /keep current target/i }))
    await user.click(screen.getByRole('button', { name: 'View history' }))
    await act(async () => reject(new Error('Decision failed')))
    expect(screen.getByRole('button', { name: 'View history' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /keep current target/i }))
    await user.click(screen.getByRole('button', { name: 'View history' }))
    await act(async () => release({ ...session, exercises: session.exercises.map(ex => ({ ...ex, sets: ex.sets.map(set => ({ ...set, targetDecision: 'declined' as const })) })) }))
    expect(screen.getByRole('button', { name: 'View history' })).toHaveFocus()
  })

  it.each(['accept', 'decline'] as const)('retains %s across history return before and after a held settlement', async decision => {
    const f = await fixture()
    const active = await f.sessionService.start(f.template.id, 'Connected Gym')
    await f.sessionService.logSet(active.exercises[0].id, active.exercises[0].sets[0].id, { weight: 45, reps: 8 })
    const user = userEvent.setup()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const service = { ...f.sessionService, decideFutureTarget: async (...args: Parameters<typeof f.sessionService.decideFutureTarget>) => {
      await gate
      return f.sessionService.decideFutureTarget(...args)
    } }
    render(<App {...f} sessionService={service} />)
    await user.click(await screen.findByRole('button', { name: 'Resume Connected Workout' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    expect(await screen.findByRole('heading', { name: 'Workout saved' })).toHaveFocus()
    const before = (await f.sessionService.listHistory())[0]
    await user.click(screen.getByRole('button', { name: decision === 'accept' ? 'Use this target' : 'Keep current target' }))
    await user.click(screen.getByRole('button', { name: 'View history' }))
    const historyHeading = screen.getByRole('heading', { name: 'Connected Workout', level: 3 })
    expect(historyHeading).toHaveFocus()
    await act(async () => { release(); await gate })
    await waitFor(async () => expect((await f.sessionService.listHistory())[0].exercises[0].sets[0].targetDecision).toBe(decision === 'accept' ? 'accepted' : 'declined'))
    expect(historyHeading).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Back to workout summary' }))
    expect(screen.getByRole('button', { name: 'View history' })).toHaveFocus()
    expect(screen.getByText(decision === 'accept' ? 'Target updated' : 'Current target kept', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this target' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep current target' })).not.toBeInTheDocument()
    // A second round trip covers a decision already committed before departure.
    await user.click(screen.getByRole('button', { name: 'View history' }))
    await user.click(screen.getByRole('button', { name: 'Back to workout summary' }))
    expect(screen.getByText(decision === 'accept' ? 'Target updated' : 'Current target kept', { exact: true })).toBeInTheDocument()
    const saved = (await f.sessionService.listHistory())[0]
    expect({ ...saved.exercises[0].sets[0], targetDecision: undefined }).toEqual(before.exercises[0].sets[0])
    expect(saved.id).toBe(before.id)
    expect(saved.summary).toEqual(before.summary)
    expect((await f.workoutService.get(f.template.id))!.exercises[0].sets[0].weight).toBe(decision === 'accept' ? 45 : 40)
  })

  it('shows persisted recent activity and opens the exact record with a contextual return', async () => {
    const f = await fixture()
    await f.sessionService.start(f.template.id, 'Connected Gym')
    const saved = await f.sessionService.complete()
    const user = userEvent.setup()
    render(<App {...f} />)
    const recent = await screen.findByRole('region', { name: 'Recent activity' })
    await waitFor(() => expect(recent).toHaveTextContent('Connected Workout'))
    expect(recent).toHaveTextContent('0 sets completed')
    await user.click(within(recent).getByRole('button', { name: /view session/i }))
    const article = await screen.findByRole('article', { name: /connected workout/i })
    expect(within(article).getByText('Original Row')).toBeInTheDocument()
    expect(within(article).getByRole('heading', { name: 'Connected Workout' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /back to recent activity/i }))
    expect(await screen.findByRole('button', { name: /view session/i })).toHaveFocus()
    expect((await f.sessionService.listHistory())[0]).toEqual(saved)
  })

  it('announces honest empty, loading and retryable failed activity without stealing departed focus', async () => {
    const f = await fixture()
    let reject!: (error: Error) => void
    let calls = 0
    const service = { ...f.sessionService, listHistory: () => ++calls === 1 ? new Promise<never>((_, no) => { reject = no }) : f.sessionService.listHistory() }
    const user = userEvent.setup()
    render(<App {...f} sessionService={service} />)
    expect(await screen.findByText('Loading recent activity…')).toBeInTheDocument()
    await act(async () => reject(new Error('Read failed')))
    await user.click(screen.getByRole('button', { name: 'Retry recent activity' }))
    expect(await screen.findByText('No completed workouts yet')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Exercises' }))
    expect(screen.getByRole('tab', { name: 'Exercises' })).toHaveFocus()
  })

  it('resolves current shared name and notes on Resume without changing the session snapshot', async () => {
    const f = await fixture()
    await f.sessionService.start(f.template.id, 'Connected Gym')
    const snapshot = await f.sessionService.getActive()
    await f.exerciseService.update(f.exercise.id, { name: 'Current Row', notes: 'Current setup', muscleGroup: '', equipment: '' })
    const user = userEvent.setup()
    render(<App {...f} />)
    await user.click(await screen.findByRole('button', { name: 'Resume Connected Workout' }))
    expect(await screen.findByRole('heading', { name: 'Current Row' })).toBeInTheDocument()
    expect(screen.getByText('Current setup')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log Current Row set 1' })).toBeInTheDocument()
    expect(await f.sessionService.getActive()).toEqual(snapshot)
  })

  it('focuses and announces the durable summary before any traversal, then opens that history record', async () => {
    const f = await fixture()
    await f.sessionService.start(f.template.id, 'Connected Gym')
    const user = userEvent.setup()
    render(<App {...f} />)
    await user.click(await screen.findByRole('button', { name: 'Resume Connected Workout' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    await user.click(screen.getByRole('button', { name: 'Finish and skip 1 set' }))
    expect(await screen.findByRole('heading', { name: 'Workout saved' })).toHaveFocus()
    expect(screen.getByRole('status', { name: 'Saved workout status' })).toHaveTextContent('Workout saved')
    await user.click(screen.getByRole('button', { name: 'View history' }))
    const article = await screen.findByRole('article', { name: /connected workout/i })
    expect(within(article).getByText('Original Row')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to workout summary' }))
    expect(await screen.findByRole('button', { name: 'View history' })).toHaveFocus()
  })
})
