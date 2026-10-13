import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ActiveSession } from './ActiveSession'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createMemorySessionRepository, createSessionService, type WorkoutSession } from './sessions'
import { DEFAULT_SETTINGS } from './settings'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

async function fixture() {
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const exercise = await exerciseService.create({ name: 'Row', muscleGroup: '', equipment: '', notes: '' })
  const workoutService = createWorkoutService(createMemoryWorkoutRepository())
  const template = await workoutService.create({ name: 'Training', gymId: 'gym', exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 40, reps: 5 }] }] })
  const sessionService = createSessionService(createMemorySessionRepository(), workoutService, exerciseService)
  const initialSession = await sessionService.start(template.id, 'Gym')
  return { initialSession, sessionService, exerciseService, settings: DEFAULT_SETTINGS, onSessionChange: vi.fn(), onComplete: vi.fn(), onExit: vi.fn() }
}

async function keyboardActivate(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  for (let i = 0; i < 30 && document.activeElement !== target; i++) await user.tab()
  expect(target).toHaveFocus()
  await user.keyboard('{Enter}')
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('set availability focus settlement', () => {
  it('retains the same occurrence/set trigger after successful Skip and Return', async () => {
    const props = await fixture()
    const user = userEvent.setup()
    render(<ActiveSession {...props} />)
    const trigger = screen.getByRole('button', { name: 'Skip Row set 1' })
    await keyboardActivate(user, trigger)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Return to Row set 1' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Return to Row set 1' })).toBe(trigger)
    expect((await props.sessionService.getActive())?.exercises[0].sets[0].skippedAt).toBeTruthy()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skip Row set 1' })).toHaveFocus())
    expect((await props.sessionService.getActive())?.exercises[0].sets[0].skippedAt).toBeNull()
  })

  it.each(['skipSet', 'returnSet'] as const)('restores after handled %s failure and permits a real retry', async method => {
    const props = await fixture()
    const occurrence = props.initialSession.exercises[0]
    if (method === 'returnSet') props.initialSession = await props.sessionService.skipSet(occurrence.id, occurrence.sets[0].id, props.initialSession.id)
    const original = props.sessionService[method]
    vi.spyOn(props.sessionService, method).mockRejectedValueOnce(new Error('write failed')).mockImplementation(original)
    const user = userEvent.setup()
    render(<ActiveSession {...props} />)
    const name = method === 'skipSet' ? 'Skip Row set 1' : 'Return to Row set 1'
    const trigger = screen.getByRole('button', { name })
    await keyboardActivate(user, trigger)
    expect(await screen.findByRole('alert')).toHaveTextContent('write failed')
    expect(trigger).toBeEnabled()
    expect(trigger).toHaveFocus()
    expect(Boolean((await props.sessionService.getActive())?.exercises[0].sets[0].skippedAt)).toBe(method === 'returnSet')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('button', { name: method === 'skipSet' ? 'Return to Row set 1' : 'Skip Row set 1' })).toHaveFocus())
    expect(Boolean((await props.sessionService.getActive())?.exercises[0].sets[0].skippedAt)).toBe(method === 'skipSet')
  })

  it.each(['navigation', 'unmount', 'replacement'] as const)('does not steal focus after %s during a held write', async departure => {
    const props = await fixture()
    const gate = deferred()
    const original = props.sessionService.skipSet
    const heldWrite = vi.spyOn(props.sessionService, 'skipSet').mockImplementation(async (...args) => { await gate.promise; return original(...args) })
    const user = userEvent.setup()
    const view = render(<><button>Outside</button><ActiveSession {...props} /></>)
    await keyboardActivate(user, screen.getByRole('button', { name: 'Skip Row set 1' }))
    expect(screen.getByRole('button', { name: 'Skip Row set 1' })).toBeDisabled()
    if (departure === 'unmount') view.rerender(<button>Outside</button>)
    if (departure === 'replacement') {
      const replacement: WorkoutSession = { ...props.initialSession, id: 'replacement-session' }
      view.rerender(<><button>Outside</button><ActiveSession {...props} initialSession={replacement} /></>)
    }
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    await act(async () => { gate.resolve(); await heldWrite.mock.results[0].value })
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
    if (departure !== 'navigation') expect(props.onSessionChange).not.toHaveBeenCalled()
    else await waitFor(() => expect(props.onSessionChange).toHaveBeenCalledTimes(1))
  })
})
