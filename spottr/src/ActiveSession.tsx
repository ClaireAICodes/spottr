import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Dumbbell, Flag } from 'lucide-react'
import { ActionButton, Panel } from './primitives'
import { ExerciseReference } from './ExerciseReference'
import type { ExerciseService } from './exercises'
import type { CompletedWorkoutSession, SessionService, WorkoutSession } from './sessions'
import { elapsedSetSeconds } from './sessions'
import { displayWeight, storedWeight, type AppSettings } from './settings'

function elapsedRestSeconds(startedAt?: string) {
  return startedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)) : 0
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function setKey(exerciseId: string, setId: string) {
  return encodeURIComponent(JSON.stringify([exerciseId, setId]))
}

export function ActiveSession({
  initialSession,
  sessionService,
  exerciseService,
  onSessionChange,
  onComplete,
  onExit,
  settings,
}: {
  initialSession: WorkoutSession
  sessionService: SessionService
  exerciseService: ExerciseService
  onSessionChange: (session: WorkoutSession) => void
  onComplete: (session: CompletedWorkoutSession) => void
  onExit: () => void
  settings: AppSettings
}) {
  const [session, setSession] = useState(initialSession)
  const [currentSetId, setCurrentSetId] = useState(() => {
    const sets = initialSession.exercises.flatMap(exercise => exercise.sets.map(set => ({ ...set, key: setKey(exercise.id, set.id) })))
    return (sets.find(set => set.timing && !set.completedAt && !set.skippedAt) ?? sets.find(set => !set.completedAt && !set.skippedAt))?.key
  })
  const [clock, setClock] = useState(Date.now)
  const [timingFocus, setTimingFocus] = useState<string | null>(null)
  const [values, setValues] = useState(() => Object.fromEntries(
    initialSession.exercises.flatMap((exercise) => exercise.sets.map((set) => [
      setKey(exercise.id, set.id),
      { weight: String(Number(displayWeight(set.weight, settings.weightUnit).toFixed(1))), reps: String(set.reps) },
    ])),
  ))
  const [pendingSetIds, setPendingSetIds] = useState<Set<string>>(() => new Set())
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null)
  const [restoreExerciseFocus, setRestoreExerciseFocus] = useState<string | null>(null)
  const [restoreSetFocus, setRestoreSetFocus] = useState<{ target: HTMLButtonElement; owner: string; intent: number } | null>(null)
  const availabilityOwner = useRef(initialSession.id)
  availabilityOwner.current = initialSession.id
  const availabilityMounted = useRef(false)
  const focusIntent = useRef(0)
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const finishButton = useRef<HTMLButtonElement>(null)
  const sessionTitle = useRef<HTMLHeadingElement>(null)
  const keepTrainingButton = useRef<HTMLButtonElement>(null)
  const confirmFinishButton = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{ message: string; sequence: number } | null>(null)
  const [isStoppingRest, setIsStoppingRest] = useState(false)
  const [restoreRestFocus, setRestoreRestFocus] = useState(false)
  const [restSecondsElapsed, setRestSecondsElapsed] = useState(
    () => elapsedRestSeconds(initialSession.restTimer?.startedAt),
  )
  const allSets = session.exercises.flatMap((exercise) => exercise.sets)
  const completedSets = allSets.filter(({ completedAt }) => completedAt).length
  const skippedSets = allSets.filter(({ skippedAt }) => skippedAt).length
  const remainingSets = allSets.length - completedSets

  useEffect(() => { sessionTitle.current?.focus() }, [])
  useEffect(() => {
    availabilityMounted.current = true
    const changedIntent = () => { focusIntent.current += 1 }
    document.addEventListener('focusin', changedIntent)
    document.addEventListener('keydown', changedIntent)
    document.addEventListener('pointerdown', changedIntent)
    return () => {
      availabilityMounted.current = false
      document.removeEventListener('focusin', changedIntent)
      document.removeEventListener('keydown', changedIntent)
      document.removeEventListener('pointerdown', changedIntent)
    }
  }, [])
  useEffect(() => {
    if (!restoreSetFocus || pendingSetIds.size || pendingExerciseId !== null || isFinishing) return
    const { target, owner, intent } = restoreSetFocus
    // Disabled controls can lose focus to the body; never override newer navigation.
    if (availabilityMounted.current && availabilityOwner.current === owner && focusIntent.current === intent && target.isConnected && !target.disabled
      && (document.activeElement === document.body || document.activeElement === target)) target.focus()
    setRestoreSetFocus(null)
  }, [restoreSetFocus, pendingSetIds.size, pendingExerciseId, isFinishing])
  useEffect(() => {
    const update = () => setClock(Date.now())
    const interval = window.setInterval(update, 250)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', update) }
  }, [])
  useEffect(() => {
    if (!timingFocus || pendingSetIds.size) return
    document.getElementById(timingFocus)?.focus()
    setTimingFocus(null)
  }, [timingFocus, pendingSetIds.size])

  useEffect(() => {
    if (isConfirmingFinish) keepTrainingButton.current?.focus()
  }, [isConfirmingFinish])

  useEffect(() => {
    const updateTimer = () => setRestSecondsElapsed(elapsedRestSeconds(session.restTimer?.startedAt))
    updateTimer()
    if (!session.restTimer?.startedAt) return
    const interval = window.setInterval(updateTimer, 250)
    return () => window.clearInterval(interval)
  }, [session.restTimer?.startedAt])

  useEffect(() => {
    if (!restoreRestFocus || isStoppingRest) return
    const target = finishButton.current
    if (!target?.isConnected || target.disabled) return
    target.focus()
    if (document.activeElement === target) setRestoreRestFocus(false)
  }, [restoreRestFocus, isStoppingRest, pendingSetIds.size, pendingExerciseId, isFinishing])

  useEffect(() => {
    if (!restoreExerciseFocus) return
    const target = document.getElementById(`exercise-availability-${restoreExerciseFocus}`) as HTMLButtonElement | null
    if (!target?.isConnected || target.disabled) return
    target.focus()
    if (document.activeElement === target) setRestoreExerciseFocus(null)
  }, [restoreExerciseFocus, pendingExerciseId, pendingSetIds.size, isFinishing])

  async function stopRest() {
    if (isStoppingRest || !session.restTimer) return
    setIsStoppingRest(true)
    setError('')
    try {
      const updated = await sessionService.stopRest(session.id, session.restTimer)
      setSession(updated)
      onSessionChange(updated)
      setFeedback((current) => ({ message: 'Rest stopped', sequence: (current?.sequence ?? 0) + 1 }))
      setRestoreRestFocus(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Rest could not be stopped. Try again.')
    } finally {
      setIsStoppingRest(false)
    }
  }

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
    const draft = values[setKey(exerciseId, setId)]
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
      }, settings.restTimerEnabled ? settings.restSeconds : undefined, session.id)
      setSession(updated)
      onSessionChange(updated)
      const loggedSet = updated.exercises.flatMap(({ sets }) => sets).find(({ id }) => id === setId)
      const messages: string[] = []
      if (settings.prCelebrations && loggedSet?.personalRecords?.includes('weight')) messages.push('New weight PR')
      if (settings.prCelebrations && loggedSet?.personalRecords?.includes('set-volume')) messages.push('New set volume PR')
      if (settings.restTimerEnabled) messages.push(`Suggested rest: ${settings.restSeconds} seconds`)
      const occurrence = updated.exercises.find(exercise => exercise.id === exerciseId)!
      messages.unshift(`Logged ${occurrence.name} set ${occurrence.sets.findIndex(set => set.id === setId) + 1}: ${draft.weight} ${settings.weightUnit}, ${draft.reps} reps`)
      const message = messages.join(' · ')
      setFeedback((current) => message ? { message, sequence: (current?.sequence ?? 0) + 1 } : null)
      const next = updated.exercises.flatMap(exercise => exercise.sets.map(set => ({ ...set, key: setKey(exercise.id, set.id) }))).find(set => !set.completedAt && !set.skippedAt)
      setCurrentSetId(next?.key)
      setTimingFocus(updated.restTimer ? 'stop-session-rest' : next ? `actual-${next.key}` : 'finish-session-workout')
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

  async function changeTiming(exerciseId: string, setId: string, running: boolean) {
    const key = setKey(exerciseId, setId)
    const draft = values[key]
    if (!running && draft.weight.trim() === '') { setError('Enter a set weight'); return }
    setPendingSetIds(current => new Set(current).add(setId))
    setError('')
    try {
      const updated = running
        ? await sessionService.completeTimedSet(session.id, exerciseId, setId)
        : await sessionService.startSet(session.id, exerciseId, setId, { weight: storedWeight(Number(draft.weight), settings.weightUnit), reps: Number(draft.reps) })
      setSession(updated)
      onSessionChange(updated)
      setTimingFocus(`${running ? 'actual' : 'timing'}-${key}`)
      setFeedback(current => ({ message: running ? 'Set complete. Confirm actuals and log.' : 'Set started', sequence: (current?.sequence ?? 0) + 1 }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Timing could not be saved. Try again.')
      setTimingFocus(`timing-${key}`)
    } finally {
      setPendingSetIds(current => { const next = new Set(current); next.delete(setId); return next })
    }
  }

  async function changeSetAvailability(exerciseId: string, setId: string, skipped: boolean) {
    const owner = session.id
    const target = document.getElementById(`set-availability-${setKey(owner, setKey(exerciseId, setId))}`) as HTMLButtonElement | null
    const restore = target && document.activeElement === target ? { target, owner, intent: focusIntent.current } : null
    const stillOwned = () => availabilityMounted.current && availabilityOwner.current === owner
    setPendingSetIds((current) => new Set(current).add(setId))
    setError('')
    try {
      const updated = skipped
        ? await sessionService.returnSet(exerciseId, setId, session.id)
        : await sessionService.skipSet(exerciseId, setId, session.id)
      if (!stillOwned()) return
      setSession(updated)
      onSessionChange(updated)
    } catch (caught) {
      if (!stillOwned()) return
      setError(caught instanceof Error ? caught.message : 'The set could not be updated.')
    } finally {
      if (stillOwned()) {
        setRestoreSetFocus(restore)
        setPendingSetIds((current) => {
          const next = new Set(current)
          next.delete(setId)
          return next
        })
      }
    }
  }

  async function changeExerciseAvailability(exerciseId: string, skipped: boolean) {
    const restoreFocus = document.activeElement?.id === `exercise-availability-${exerciseId}`
    setPendingExerciseId(exerciseId)
    setError('')
    try {
      const updated = await sessionService.changeExerciseAvailability(exerciseId, skipped, session.id)
      setSession(updated)
      onSessionChange(updated)
      setFeedback((current) => ({ message: skipped ? 'Incomplete exercise sets skipped' : 'Incomplete exercise sets returned', sequence: (current?.sequence ?? 0) + 1 }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be updated. Try again.')
    } finally {
      if (restoreFocus) setRestoreExerciseFocus(exerciseId)
      setPendingExerciseId(null)
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
      const updated = await sessionService.moveExercise(exerciseId, direction, session.id)
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
      onComplete(await sessionService.complete(session.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workout could not be finished.')
      setIsConfirmingFinish(false)
      queueMicrotask(() => finishButton.current?.focus())
    } finally {
      setIsFinishing(false)
    }
  }

  return (
    <section id="main-view" aria-labelledby="active-session-title" className="active-session">
      <button type="button" className="text-button session-exit" disabled={pendingSetIds.size > 0 || pendingExerciseId !== null || isFinishing || isStoppingRest || isConfirmingFinish} onClick={onExit}>Exit workout</button>
      <div className="section-heading active-session-heading">
        <div>
          <p className="eyebrow">Active session</p>
          <h2 id="active-session-title" ref={sessionTitle} tabIndex={-1}>{session.name}</h2>
          <p>{completedSets} of {allSets.length} sets logged · {skippedSets} skipped</p>
        </div>
        <Dumbbell size={30} aria-hidden="true" />
      </div>
      {error && <p role="alert" className="form-message error-copy">{error}</p>}
      {feedback && <p key={feedback.sequence} role="status" className={`session-feedback${settings.prCelebrations && feedback.message.includes('PR') ? ' pr-celebration' : ''}`}>{feedback.message}</p>}
      {session.restTimer && (
        <div className="rest-timer">
          <div>
            <p className="eyebrow">Rest elapsed</p>
            <strong role="timer" aria-label="Rest timer">{formatTimer(restSecondsElapsed)}</strong>
          </div>
          <p>Suggested rest: {Math.round((Date.parse(session.restTimer.endsAt) - Date.parse(session.restTimer.startedAt)) / 1000)} seconds. Keep resting as long as you need, even if you leave or reload.</p>
          <ActionButton id="stop-session-rest" disabled={isStoppingRest || isFinishing} onClick={() => void stopRest()}>{isStoppingRest ? 'Stopping…' : 'Stop rest'}</ActionButton>
        </div>
      )}
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
            <ExerciseReference exerciseId={exercise.exerciseId} name={exercise.name} service={exerciseService} />
            <ActionButton
              id={`exercise-availability-${exercise.id}`}
              disabled={pendingExerciseId !== null || pendingSetIds.size > 0 || isFinishing || exercise.sets.every((set) => set.completedAt)}
              aria-label={`${exercise.sets.some((set) => !set.completedAt) && exercise.sets.filter((set) => !set.completedAt).every((set) => set.skippedAt) ? 'Return to' : 'Skip'} exercise ${exercise.name}`}
              onClick={() => void changeExerciseAvailability(exercise.id, !exercise.sets.filter((set) => !set.completedAt).every((set) => set.skippedAt))}
            >
              {exercise.sets.filter((set) => !set.completedAt).every((set) => set.skippedAt) && exercise.sets.some((set) => !set.completedAt) ? 'Return to exercise' : 'Skip exercise for now'}
            </ActionButton>
            <ol className="session-set-list">
              {exercise.sets.map((set, index) => {
                const label = `${exercise.name}${session.exercises.filter(item => item.name === exercise.name).length > 1 ? ` exercise ${exerciseIndex + 1}` : ''} set ${index + 1}`
                const key = setKey(exercise.id, set.id)
                const completed = Boolean(set.completedAt)
                const skipped = Boolean(set.skippedAt)
                const pending = pendingSetIds.has(set.id) || pendingExerciseId !== null || isFinishing
                const running = Boolean(set.timing && !set.timing.endedAt)
                const anyRunning = allSets.some(set => set.timing && !set.timing.endedAt)
                const selected = currentSetId === key
                return (
                  <li key={set.id} className={completed ? 'logged' : skipped ? 'skipped' : undefined}>
                    <span className="set-number">{index + 1}</span>
                    <label>{label} weight ({settings.weightUnit})<input id={`actual-${key}`} type="number" min="0" step="0.1" disabled={completed || skipped || pending || running} value={values[key].weight} onChange={(event) => setValues({ ...values, [key]: { ...values[key], weight: event.target.value } })} /></label>
                    <label>{label} reps<input type="number" min="1" step="1" disabled={completed || skipped || pending || running} value={values[key].reps} onChange={(event) => setValues({ ...values, [key]: { ...values[key], reps: event.target.value } })} /></label>
                    <div className="session-set-actions">
                      {!completed && !skipped && <>
                        <button type="button" aria-pressed={selected} disabled={pending || anyRunning} aria-label={`Select current ${label}`} onClick={() => setCurrentSetId(key)}>{selected ? 'Current set' : 'Select set'}</button>
                        {(selected || running) && !set.timing?.endedAt && <button id={`timing-${key}`} type="button" disabled={pending || (!running && anyRunning)} aria-label={`${running ? 'Complete' : 'Start'} ${label}`} onClick={() => void changeTiming(exercise.id, set.id, running)}>{running ? 'Complete set' : 'Start timed set'}</button>}
                      </>}
                      {set.timing && <span>{running ? <strong role="timer" aria-label={`Elapsed ${label}`}>{formatTimer(elapsedSetSeconds(set.timing.startedAt, clock))}</strong> : `Duration ${formatTimer(set.timing.durationSeconds ?? 0)}`}</span>}
                      <span>{completed ? 'Logged' : skipped ? 'Skipped' : running ? 'Timing' : set.timing?.endedAt ? 'Awaiting actuals' : selected ? 'Current' : 'Remaining'}</span>
                      <span>Planned: {Number(displayWeight(set.targetWeight, settings.weightUnit).toFixed(1))} {settings.weightUnit} × {set.targetReps}</span>
                      <button type="button" disabled={completed || skipped || pending || running} aria-label={`${completed ? 'Logged' : skipped ? 'Skipped' : 'Log'} ${label}`} onClick={() => void logSet(exercise.id, set.id)}>
                        <Check size={17} aria-hidden="true" /> {completed ? 'Logged' : skipped ? 'Skipped' : pending ? 'Updating…' : 'Log set'}
                      </button>
                      {!completed && (
                        <button id={`set-availability-${setKey(session.id, key)}`} type="button" className="set-skip-button" disabled={pending} aria-label={`${skipped ? 'Return to' : 'Skip'} ${label}`} onClick={() => void changeSetAvailability(exercise.id, set.id, skipped)}>
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
        <ActionButton id="finish-session-workout" ref={finishButton} disabled={pendingSetIds.size > 0 || pendingExerciseId !== null || isFinishing || isStoppingRest} onClick={() => remainingSets > 0 ? setIsConfirmingFinish(true) : void finish()}>
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
