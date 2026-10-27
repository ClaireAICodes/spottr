import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Panel } from './primitives'
import type { CompletedWorkoutSession, SessionService } from './sessions'
import { formatWeight, type AppSettings } from './settings'

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

function formatSets(count: number) {
  return `${count} ${count === 1 ? 'set' : 'sets'}`
}

export function SessionHistory({ sessionService, settings, entry, onBack, backLabel, sessionId, onOpen }: { sessionService: SessionService; settings: AppSettings; entry?: CompletedWorkoutSession; onBack?: () => void; backLabel?: string; sessionId?: string; onOpen?: (session: CompletedWorkoutSession) => void }) {
  const entryHeading = useRef<HTMLHeadingElement>(null)
  const [sessions, setSessions] = useState<CompletedWorkoutSession[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(entry?.id ?? null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let current = true
    if (entry) { setSessions([entry]); setStatus('ready'); return }
    setStatus('loading')
    sessionService.listHistory().then((history) => {
      if (!current) return
      setSessions(sessionId ? history.filter(session => session.id === sessionId) : history)
      setExpandedId(sessionId ?? null)
      setStatus('ready')
    }).catch(() => {
      if (current) setStatus('error')
    })
    return () => { current = false }
  }, [sessionService, entry, sessionId])
  useEffect(() => { if (entry && status === 'ready') entryHeading.current?.focus() }, [entry?.id, status])

  return (
    <section id="main-view" role="tabpanel" aria-label="Workout history" className="session-history">
      <div className="section-heading">
        <div><p className="eyebrow">Saved locally</p><h2>Workout history</h2><p>Newest sessions appear first.</p></div>
      </div>
      {onBack && <button type="button" className="text-button" onClick={onBack}>{backLabel}</button>}
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
                  <h3 ref={entry ? entryHeading : undefined} tabIndex={-1}>{session.name}</h3>
                  <p>{session.gymName} · {formatWeight(session.summary.volume, settings.weightUnit)} · {formatDuration(session.summary.durationSeconds)}</p>
                </div>
                <button type="button" aria-label={`${expanded ? 'Hide details' : 'View details'} for ${session.name} at ${session.gymName} completed ${new Date(session.endedAt).toLocaleString()}`} aria-expanded={expanded} onClick={() => { if (onOpen && !sessionId) onOpen(session); else setExpandedId(expanded ? null : session.id) }}>
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
                            <strong>{formatWeight(set.weight, settings.weightUnit)} × {set.reps} reps</strong>
                            <span>{set.completedAt ? `Completed${set.personalRecords?.length ? ` · ${set.personalRecords.map((record) => record === 'weight' ? 'Weight PR' : 'Set volume PR').join(' + ')}` : ''}` : 'Skipped'}</span>
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
