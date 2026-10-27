import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { test, expect, vi } from 'vitest'
import { ActiveSession } from './ActiveSession'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'
import { createSessionService, createMemorySessionRepository } from './sessions'
import { createWorkoutService, createMemoryWorkoutRepository } from './workouts'
import { DEFAULT_SETTINGS } from './settings'

test('session_5x4_focusesOneSetAndOverviewSelectionNeverLogs', async () => {
  const user = userEvent.setup()
  const exerciseService = createExerciseService(createMemoryExerciseRepository())
  const exercises = await Promise.all(Array.from({ length: 5 }, () => exerciseService.create({ name: 'Long repeated controlled cable row', notes: 'Keep control', equipment: '', muscleGroup: '' })))
  const workouts = createWorkoutService(createMemoryWorkoutRepository())
  const template = await workouts.create({ name: 'Twenty sets', gymId: 'gym', exercises: exercises.map(exercise => ({ exerciseId: exercise.id, sets: Array.from({ length: 4 }, () => ({ kind: 'working' as const, weight: 40, reps: 8 })) })) })
  const sessionService = createSessionService(createMemorySessionRepository(), workouts, exerciseService)
  const initialSession = await sessionService.start(template.id, 'Gym')
  render(<ActiveSession initialSession={initialSession} sessionService={sessionService} exerciseService={exerciseService} settings={DEFAULT_SETTINGS} onSessionChange={vi.fn()} onComplete={vi.fn()} onExit={vi.fn()} />)
  const stage = screen.getByRole('region', { name: 'Current set' })
  expect(within(stage).getByText('Set 1 of 4')).toBeVisible()
  expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Workout overview' }))
  expect(screen.getAllByRole('spinbutton')).toHaveLength(40)
  await user.click(screen.getByRole('button', { name: 'Select current Long repeated controlled cable row exercise 3 set 2' }))
  expect(screen.queryByRole('region', { name: 'Workout overview' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
  expect(screen.getByText('Set 2 of 4')).toBeVisible()
  expect(await sessionService.getActive()).toEqual(initialSession)
  await user.click(screen.getByRole('button', { name: 'Start Long repeated controlled cable row exercise 3 set 2' }))
  await user.click(await screen.findByRole('button', { name: 'Complete Long repeated controlled cable row exercise 3 set 2' }))
  const confirmation = await screen.findByRole('dialog')
  await user.click(within(confirmation).getByRole('button', { name: 'Log set' }))
  await screen.findByRole('timer', { name: 'Rest timer' })
  expect((await sessionService.getActive())!.exercises[2].sets[1].completedAt).toBeTruthy()
  expect(await workouts.get(template.id)).toEqual(template)
})
