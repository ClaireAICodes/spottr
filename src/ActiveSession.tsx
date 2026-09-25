import { useEffect, useRef, useState } from 'react'
import { Check, Dumbbell, Flag } from 'lucide-react'
import { ActionButton, Panel } from './primitives'
import type { CompletedWorkoutSession, SessionService, WorkoutSession } from './sessions'

export function ActiveSession({
  initialSession,
  sessionService,
  onSessionChange,
  onComplete,
}: {
  initialSession: WorkoutSession
  sessionService: SessionService
  onSessionChange: (session: WorkoutSession) => void
  onComplete: (session: CompletedWorkoutSession) => void
}) {
  const [session, setSession] = useState(initialSession)
  const [values, setValues] = useState(() => Object.fromEntries(
    initialSession.exercises.flatMap((exercise) => exercise.sets.map((set) => [
      set.id,
      { weight: String(set.weight), reps: String(set.reps) },
    ])),
  ))
  const [pendingSetIds, setPendingSetIds] = useState<Set<string>>(() => new Set())
  const [isConfirmingFinish, setIsConfirmingFinish] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const finishButton = useRef<HTMLButtonElement>(null)
  const keepTrainingButton = useRef<HTMLButtonElement>(null)
  const confirmFinishButton = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')
  const allSets = session.exercises.flatMap((exercise) => exercise.sets)
  const completedSets = allSets.filter(({ completedAt }) => completedAt).length
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
        weight: Number(draft.weight),
        reps: Number(draft.reps),
      })
      setSession(updated)
      onSessionChange(updated)
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
          <p>{completedSets} of {allSets.length} sets logged</p>
        </div>
        <Dumbbell size={30} aria-hidden="true" />
      </div>
      {error && <p role="alert" className="form-message error-copy">{error}</p>}
      <div className="session-exercises">
        {session.exercises.map((exercise) => (
          <Panel key={exercise.id} className="session-exercise" aria-labelledby={`session-exercise-${exercise.id}`}>
            <h3 id={`session-exercise-${exercise.id}`}>{exercise.name}</h3>
            <ol className="session-set-list">
              {exercise.sets.map((set, index) => {
                const label = `${exercise.name} set ${index + 1}`
                const completed = Boolean(set.completedAt)
                return (
                  <li key={set.id} className={completed ? 'logged' : undefined}>
                    <span className="set-number">{index + 1}</span>
                    <label>{label} weight<input type="number" min="0" step="0.5" disabled={completed || pendingSetIds.has(set.id)} value={values[set.id].weight} onChange={(event) => setValues({ ...values, [set.id]: { ...values[set.id], weight: event.target.value } })} /></label>
                    <label>{label} reps<input type="number" min="1" step="1" disabled={completed || pendingSetIds.has(set.id)} value={values[set.id].reps} onChange={(event) => setValues({ ...values, [set.id]: { ...values[set.id], reps: event.target.value } })} /></label>
                    <button type="button" disabled={completed || pendingSetIds.has(set.id)} aria-label={`${completed ? 'Logged' : 'Log'} ${label}`} onClick={() => void logSet(exercise.id, set.id)}>
                      <Check size={17} aria-hidden="true" /> {completed ? 'Logged' : pendingSetIds.has(set.id) ? 'Logging…' : 'Log set'}
                    </button>
                  </li>
                )
              })}
            </ol>
          </Panel>
        ))}
      </div>
      <div className="finish-session">
        <ActionButton ref={finishButton} disabled={pendingSetIds.size > 0 || isFinishing} onClick={() => remainingSets > 0 ? setIsConfirmingFinish(true) : void finish()}>
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
