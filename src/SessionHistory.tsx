import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Panel } from './primitives'
import type { CompletedWorkoutSession, SessionService } from './sessions'

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

function formatSets(count: number) {
  return `${count} ${count === 1 ? 'set' : 'sets'}`
}

export function SessionHistory({ sessionService }: { sessionService: SessionService }) {
  const [sessions, setSessions] = useState<CompletedWorkoutSession[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let current = true
    setStatus('loading')
    sessionService.listHistory().then((history) => {
      if (!current) return
      setSessions(history)
      setStatus('ready')
    }).catch(() => {
      if (current) setStatus('error')
    })
    return () => { current = false }
  }, [sessionService])

  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-history" className="session-history">
      <div className="section-heading">
        <div><p className="eyebrow">Saved locally</p><h2>Workout history</h2><p>Newest sessions appear first.</p></div>
      </div>
      {status === 'loading' && <p role="status">Loading workout history…</p>}
      {status === 'error' && <p role="alert" className="form-message error-copy">Your workout history could not be loaded. Your saved data has not been changed.</p>}
      {status === 'ready' && sessions.length === 0 && <div className="state-message"><h3>No completed workouts yet</h3><p>Finish a workout to keep its set-by-set record here.</p></div>}
      <div className="history-list">
        {sessions.map((session) => {
          const expanded = expandedId === session.id
          return (
            <Panel key={session.id} role="article" className="history-card" aria-label={`${session.name} at ${session.gymName}`}>
              <div className="history-card-heading">
                <div>
                  <p className="eyebrow"><time dateTime={session.endedAt}>{new Date(session.endedAt).toLocaleString()}</time></p>
                  <h3>{session.name}</h3>
                  <p>{session.gymName} · {session.summary.volume.toLocaleString()} kg · {formatDuration(session.summary.durationSeconds)}</p>
                </div>
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : session.id)}>
                  {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                  {expanded ? 'Hide details' : 'View details'}
                </button>
              </div>
              {expanded && (
                <div className="history-detail">
                  <dl className="history-context">
                    <div><dt>Gym</dt><dd>{session.gymName}</dd></div>
                    <div><dt>Template</dt><dd>{session.name}</dd></div>
                    <div><dt>Completed</dt><dd>{formatSets(session.summary.completedSets)}</dd></div>
                    <div><dt>Skipped</dt><dd>{formatSets(session.summary.skippedSets)}</dd></div>
                  </dl>
                  {session.exercises.map((exercise) => (
                    <section key={exercise.id} aria-labelledby={`history-exercise-${session.id}-${exercise.id}`}>
                      <h4 id={`history-exercise-${session.id}-${exercise.id}`}>{exercise.name}</h4>
                      <ol>
                        {exercise.sets.map((set, index) => (
                          <li key={set.id}>
                            <span>Set {index + 1}</span>
                            <strong>{set.weight.toLocaleString()} kg × {set.reps} reps</strong>
                            <span>{set.completedAt ? 'Completed' : 'Skipped'}</span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              )}
            </Panel>
          )
        })}
      </div>
    </section>
  )
}
