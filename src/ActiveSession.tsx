import { useState } from 'react'
import { Check, Dumbbell } from 'lucide-react'
import { Panel } from './primitives'
import type { SessionService, WorkoutSession } from './sessions'

export function ActiveSession({
  initialSession,
  sessionService,
  onSessionChange,
}: {
  initialSession: WorkoutSession
  sessionService: SessionService
  onSessionChange: (session: WorkoutSession) => void
}) {
  const [session, setSession] = useState(initialSession)
  const [values, setValues] = useState(() => Object.fromEntries(
    initialSession.exercises.flatMap((exercise) => exercise.sets.map((set) => [
      set.id,
      { weight: String(set.weight), reps: String(set.reps) },
    ])),
  ))
  const [pendingSetIds, setPendingSetIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState('')
  const allSets = session.exercises.flatMap((exercise) => exercise.sets)
  const completedSets = allSets.filter(({ completedAt }) => completedAt).length

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
    </section>
  )
}
