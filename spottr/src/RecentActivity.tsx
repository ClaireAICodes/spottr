import { useEffect, useRef, useState } from 'react'
import { Panel } from './primitives'
import type { CompletedWorkoutSession, SessionService } from './sessions'
import { formatWeight, type AppSettings } from './settings'

export function RecentActivity({ service, settings, onOpen, restoreFocus }: {
  service: SessionService; settings: AppSettings; onOpen: (session: CompletedWorkoutSession) => void; restoreFocus: boolean
}) {
  const [latest, setLatest] = useState<CompletedWorkoutSession | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let current = true
    setStatus('loading')
    service.listHistory().then(history => {
      if (!current) return
      const sorted = [...history].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt) || a.id.localeCompare(b.id))
      setLatest(sorted[0] ?? null)
      setStatus('ready')
    }).catch(() => { if (current) setStatus('error') })
    return () => { current = false }
  }, [service, attempt])
  useEffect(() => { if (restoreFocus && status === 'ready') trigger.current?.focus() }, [restoreFocus, status])
  const records = latest?.exercises.flatMap(exercise => exercise.sets).reduce((count, set) => count + (set.personalRecords?.length ?? 0), 0) ?? 0
  return <Panel role="region" aria-label="Recent activity" className="recent-activity">
    <p className="eyebrow">Your latest completed session</p><h2>Recent activity</h2>
    {status === 'loading' && <p role="status">Loading recent activity…</p>}
    {status === 'error' && <><p role="alert">Recent activity could not be loaded. Your saved data has not been changed.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry recent activity</button></>}
    {status === 'ready' && (latest ? <>
      <h3>{latest.name}</h3><p>{latest.gymName} · <time dateTime={latest.endedAt}>{new Date(latest.endedAt).toLocaleString()}</time></p>
      <p>{latest.summary.completedSets} sets completed · {formatWeight(latest.summary.volume, settings.weightUnit)} volume · {records} personal records</p>
      <button ref={trigger} type="button" aria-label={`View session ${latest.name} at ${latest.gymName} completed ${new Date(latest.endedAt).toLocaleString()}`} onClick={() => onOpen(latest)}>View session</button>
    </> : <p>No completed workouts yet</p>)}
  </Panel>
}
