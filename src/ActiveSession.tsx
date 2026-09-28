import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Dumbbell, Flag } from 'lucide-react'
import { ActionButton, Panel } from './primitives'
import type { CompletedWorkoutSession, SessionService, WorkoutSession } from './sessions'
import { displayWeight, storedWeight, type AppSettings } from './settings'

export function ActiveSession({
  initialSession,
  sessionService,
  onSessionChange,
  onComplete,
  settings,
}: {
  initialSession: WorkoutSession
  sessionService: SessionService
  onSessionChange: (session: WorkoutSession) => void
  onComplete: (session: CompletedWorkoutSession) => void
  settings: AppSettings
}) {
  const [session, setSession] = useState(initialSession)
  const [values, setValues] = useState(() => Object.fromEntries(
    initialSession.exercises.flatMap((exercise) => exercise.sets.map((set) => [
      set.id,
      { weight: String(Number(displayWeight(set.weight, settings.weightUnit).toFixed(1))), reps: String(set.reps) },
    ])),
  ))
  const [pendingSetIds, setPendingSetIds] = useState<Set<string>>(() => new Set())
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null)
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const finishButton = useRef<HTMLButtonElement>(null)
  const keepTrainingButton = useRef<HTMLButtonElement>(null)
  const confirmFinishButton = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{ message: string; sequence: number } | null>(null)
  const allSets = session.exercises.flatMap((exercise) => exercise.sets)
  const completedSets = allSets.filter(({ completedAt }) => completedAt).length
  const skippedSets = allSets.filter(({ skippedAt }) => skippedAt).length
  const remainingSets = allSets.length - completedSets

  useEffect(() => {
    if (isConfirmingFinish) keepTrainingButton.current?.focus()
  }, [isConfirmingFinish])

  function closeFinishDialog() {
    if (isFinishing) return
    setIsConfirmingFinish(false)
    queueMicrotask(() => finishButton.current?.focus())
  }

  function handleFinishDialogKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeFinishDialog()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [keepTrainingButton.current, confirmFinishButton.current].filter(Boolean) as HTMLButtonElement[]
    const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length
    event.preventDefault()
    focusable[nextIndex].focus()
  }

  async function logSet(exerciseId: string, setId: string) {
    const draft = values[setId]
    if (draft.weight.trim() === '') {
      setError('Enter a set weight')
      return
    }
    setPendingSetIds((current) => new Set(current).add(setId))
    setError('')
    try {
      const updated = await sessionService.logSet(exerciseId, setId, {
        weight: storedWeight(Number(draft.weight), settings.weightUnit),
        reps: Number(draft.reps),
      })
      setSession(updated)
      onSessionChange(updated)
      const loggedSet = updated.exercises.flatMap(({ sets }) => sets).find(({ id }) => id === setId)
      const messages: string[] = []
      if (settings.prCelebrations && loggedSet?.personalRecords?.includes('weight')) messages.push('New weight PR')
      if (settings.prCelebrations && loggedSet?.personalRecords?.includes('set-volume')) messages.push('New set volume PR')
      if (settings.restTimerEnabled) messages.push(`Rest for ${settings.restSeconds} seconds`)
      const message = messages.join(' · ')
      setFeedback((current) => message ? { message, sequence: (current?.sequence ?? 0) + 1 } : null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The set could not be logged.')
    } finally {
      setPendingSetIds((current) => {
        const next = new Set(current)
        next.delete(setId)
        return next
      })
    }
  }

  async function changeSetAvailability(exerciseId: string, setId: string, skipped: boolean) {
    setPendingSetIds((current) => new Set(current).add(setId))
    setError('')
    try {
      const updated = skipped
        ? await sessionService.returnSet(exerciseId, setId)
        : await sessionService.skipSet(exerciseId, setId)
      setSession(updated)
      onSessionChange(updated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The set could not be updated.')
    } finally {
      setPendingSetIds((current) => {
        const next = new Set(current)
        next.delete(setId)
        return next
      })
    }
  }

  function navigateToExercise(exerciseId: string) {
    const heading = document.getElementById(`session-exercise-${exerciseId}`)
    heading?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    heading?.focus({ preventScroll: true })
  }

  async function moveExercise(exerciseId: string, direction: 'up' | 'down') {
    setPendingExerciseId(exerciseId)
    setError('')
    try {
      const updated = await sessionService.moveExercise(exerciseId, direction)
      setSession(updated)
      onSessionChange(updated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be moved.')
    } finally {
      setPendingExerciseId(null)
    }
  }

  async function finish() {
    if (isFinishing) return
    setIsFinishing(true)
    setError('')
    try {
      onComplete(await sessionService.complete())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workout could not be finished.')
      setIsConfirmingFinish(false)
      queueMicrotask(() => finishButton.current?.focus())
    } finally {
      setIsFinishing(false)
    }
  }

  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-home" className="active-session">
      <div className="section-heading active-session-heading">
        <div>
          <p className="eyebrow">Active session</p>
          <h2>{session.name}</h2>
          <p>{completedSets} of {allSets.length} sets logged · {skippedSets} skipped</p>
        </div>
        <Dumbbell size={30} aria-hidden="true" />
      </div>
      {error && <p role="alert" className="form-message error-copy">{error}</p>}
      {feedback && <p key={feedback.sequence} role="status" className={`session-feedback${settings.prCelebrations && feedback.message.includes('PR') ? ' pr-celebration' : ''}`}>{feedback.message}</p>}
      <div className="session-exercises">
        {session.exercises.map((exercise, exerciseIndex) => (
          <Panel key={exercise.id} className="session-exercise" aria-labelledby={`session-exercise-${exercise.id}`}>
            <div className="session-exercise-heading">
              <div>
                <p>{exerciseIndex + 1} of {session.exercises.length}</p>
                <h3 id={`session-exercise-${exercise.id}`} tabIndex={-1}>{exercise.name}</h3>
              </div>
              {session.exercises.length > 1 && (
                <div className="session-exercise-controls">
                  <button type="button" disabled={exerciseIndex === 0 || pendingExerciseId !== null} aria-label={`Move ${exercise.name} up`} onClick={() => void moveExercise(exercise.id, 'up')}><ArrowUp size={17} aria-hidden="true" /></button>
                  <button type="button" disabled={exerciseIndex === session.exercises.length - 1 || pendingExerciseId !== null} aria-label={`Move ${exercise.name} down`} onClick={() => void moveExercise(exercise.id, 'down')}><ArrowDown size={17} aria-hidden="true" /></button>
                  <button type="button" disabled={exerciseIndex === 0 || pendingExerciseId !== null} aria-label={`Previous exercise from ${exercise.name}`} onClick={() => navigateToExercise(session.exercises[exerciseIndex - 1].id)}><ChevronLeft size={17} aria-hidden="true" /></button>
                  <button type="button" disabled={exerciseIndex === session.exercises.length - 1 || pendingExerciseId !== null} aria-label={`Next exercise from ${exercise.name}`} onClick={() => navigateToExercise(session.exercises[exerciseIndex + 1].id)}><ChevronRight size={17} aria-hidden="true" /></button>
                </div>
              )}
            </div>
            <ol className="session-set-list">
              {exercise.sets.map((set, index) => {
                const label = `${exercise.name} set ${index + 1}`
                const completed = Boolean(set.completedAt)
                const skipped = Boolean(set.skippedAt)
                const pending = pendingSetIds.has(set.id)
                return (
                  <li key={set.id} className={completed ? 'logged' : skipped ? 'skipped' : undefined}>
                    <span className="set-number">{index + 1}</span>
                    <label>{label} weight ({settings.weightUnit})<input type="number" min="0" step="0.1" disabled={completed || skipped || pending} value={values[set.id].weight} onChange={(event) => setValues({ ...values, [set.id]: { ...values[set.id], weight: event.target.value } })} /></label>
                    <label>{label} reps<input type="number" min="1" step="1" disabled={completed || skipped || pending} value={values[set.id].reps} onChange={(event) => setValues({ ...values, [set.id]: { ...values[set.id], reps: event.target.value } })} /></label>
                    <div className="session-set-actions">
                      <button type="button" disabled={completed || skipped || pending} aria-label={`${completed ? 'Logged' : skipped ? 'Skipped' : 'Log'} ${label}`} onClick={() => void logSet(exercise.id, set.id)}>
                        <Check size={17} aria-hidden="true" /> {completed ? 'Logged' : skipped ? 'Skipped' : pending ? 'Updating…' : 'Log set'}
                      </button>
                      {!completed && (
                        <button type="button" className="set-skip-button" disabled={pending} aria-label={`${skipped ? 'Return to' : 'Skip'} ${label}`} onClick={() => void changeSetAvailability(exercise.id, set.id, skipped)}>
                          {pending ? 'Updating…' : skipped ? 'Return to set' : 'Skip for now'}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </Panel>
        ))}
      </div>
      <div className="finish-session">
        <ActionButton ref={finishButton} disabled={pendingSetIds.size > 0 || pendingExerciseId !== null || isFinishing} onClick={() => remainingSets > 0 ? setIsConfirmingFinish(true) : void finish()}>
          <Flag size={18} aria-hidden="true" /> Finish workout
        </ActionButton>
        <p>{remainingSets > 0 ? `${remainingSets} unfinished ${remainingSets === 1 ? 'set' : 'sets'} will be saved as skipped.` : 'Every planned set is logged.'}</p>
      </div>
      {isConfirmingFinish && (
        <div className="dialog-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="finish-title" className="confirm-dialog" onKeyDown={handleFinishDialogKeyDown}>
            <h3 id="finish-title">Finish this workout?</h3>
            <p>Your {remainingSets} unfinished {remainingSets === 1 ? 'set' : 'sets'} will be saved as skipped. Logged work stays unchanged.</p>
            <div className="form-actions">
              <button ref={keepTrainingButton} type="button" className="text-button" disabled={isFinishing} onClick={closeFinishDialog}>Keep training</button>
              <ActionButton ref={confirmFinishButton} disabled={isFinishing} onClick={() => void finish()}>{isFinishing ? 'Saving…' : `Finish and skip ${remainingSets} ${remainingSets === 1 ? 'set' : 'sets'}`}</ActionButton>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
