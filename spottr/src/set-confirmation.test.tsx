import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ActiveSession } from './ActiveSession'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createMemorySessionRepository, createSessionService } from './sessions'
import { DEFAULT_SETTINGS } from './settings'
import { createMemoryWorkoutRepository, createWorkoutService } from './workouts'

async function fixture() {
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const exercise = await exerciseService.create({ name: 'Row', muscleGroup: '', equipment: '', notes: 'Keep control' })
  const workouts = createWorkoutService(createMemoryWorkoutRepository())
  const template = await workouts.create({ name: 'Training', gymId: 'gym', exercises: [{ exerciseId: exercise.id, sets: [{ kind: 'working', weight: 40, reps: 8 }] }] })
  const sessionService = createSessionService(createMemorySessionRepository(), workouts, exerciseService)
  const initialSession = await sessionService.start(template.id, 'Gym')
  return { props: { initialSession, sessionService, exerciseService, settings: DEFAULT_SETTINGS, onSessionChange: vi.fn(), onComplete: vi.fn(), onExit: vi.fn() }, workouts, template }
}

test('Complete ends timing without logging; confirmation edits and retry durably save once before rest', async () => {
  const { props, workouts, template } = await fixture()
  const user = userEvent.setup()
  render(<ActiveSession {...props} />)
  await user.clear(screen.getByLabelText('Row set 1 weight (kg)'))
  await user.type(screen.getByLabelText('Row set 1 weight (kg)'), '42.5')
  await user.click(screen.getByRole('button', { name: 'Start Row set 1' }))
  await user.click(await screen.findByRole('button', { name: 'Complete Row set 1' }))
  const dialog = await screen.findByRole('dialog', { name: 'Confirm Row set 1' })
  expect(within(dialog).getByLabelText('Actual weight (kg)')).toHaveValue(42.5)
  const ended = (await props.sessionService.getActive())!.exercises[0].sets[0]
  expect(ended.timing?.endedAt).toBeTruthy()
  expect(ended.completedAt).toBeNull()
  expect(screen.queryByRole('timer', { name: 'Rest timer' })).not.toBeInTheDocument()
  await user.clear(within(dialog).getByLabelText('Actual reps'))
  await user.type(within(dialog).getByLabelText('Actual reps'), '7')
  const original = props.sessionService.logSet
  vi.spyOn(props.sessionService, 'logSet').mockRejectedValueOnce(new Error('Storage unavailable')).mockImplementation(original)
  await user.click(within(dialog).getByRole('button', { name: 'Log set' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Storage unavailable')
  expect(within(dialog).getByLabelText('Actual reps')).toHaveValue(7)
  expect((await props.sessionService.getActive())!.exercises[0].sets[0].completedAt).toBeNull()
  await user.dblClick(within(dialog).getByRole('button', { name: 'Retry log set' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('timer', { name: 'Rest timer' })).toBeVisible()
  const saved = (await props.sessionService.getActive())!.exercises[0].sets[0]
  expect(saved).toMatchObject({ weight: 42.5, reps: 7, timing: ended.timing })
  expect(saved.completedAt).toBeTruthy()
  expect(props.sessionService.logSet).toHaveBeenCalledTimes(2)
  expect(await workouts.get(template.id)).toEqual(template)
})

test('Back and remount preserve ended timing and reconstruct confirmation without restarting or logging', async () => {
  const { props } = await fixture()
  const user = userEvent.setup()
  const view = render(<ActiveSession {...props} />)
  await user.click(screen.getByRole('button', { name: 'Start Row set 1' }))
  await user.click(await screen.findByRole('button', { name: 'Complete Row set 1' }))
  const dialog = await screen.findByRole('dialog', { name: 'Confirm Row set 1' })
  await user.clear(within(dialog).getByLabelText('Actual reps'))
  await user.type(within(dialog).getByLabelText('Actual reps'), '6')
  const ended = await props.sessionService.getActive()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Row set 1 weight (kg)')).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Log Row set 1' }))
  expect(within(screen.getByRole('dialog')).getByLabelText('Actual reps')).toHaveValue(6)
  expect(await props.sessionService.getActive()).toEqual(ended)
  view.unmount()
  render(<ActiveSession {...props} initialSession={ended!} />)
  const resumed = screen.getByRole('dialog', { name: 'Confirm Row set 1' })
  expect(within(resumed).getByRole('heading')).toHaveFocus()
  expect(within(resumed).getByLabelText('Actual reps')).toHaveValue(8)
  expect(await props.sessionService.getActive()).toEqual(ended)
  await user.click(within(resumed).getByRole('button', { name: 'Log set' }))
  await screen.findByRole('timer', { name: 'Rest timer' })
  await user.click(screen.getByRole('button', { name: 'Stop rest' }))
  await waitFor(() => expect(screen.queryByRole('timer', { name: 'Rest timer' })).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Finish workout' }))
  await waitFor(() => expect(props.onComplete).toHaveBeenCalledTimes(1))
  expect(await props.sessionService.getActive()).toBeNull()
  const history = await props.sessionService.listHistory()
  expect(history).toHaveLength(1)
  expect(history[0].exercises[0].sets[0]).toMatchObject({ reps: 8, timing: ended!.exercises[0].sets[0].timing })
})
