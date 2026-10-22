import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, Trophy } from 'lucide-react'
import { ActionButton, Panel } from './primitives'
import type { CompletedWorkoutSession, SessionService } from './sessions'
import { formatWeight, weightsDifferAtDisplayedPrecision, type AppSettings } from './settings'

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

export function SessionSummary({
  session,
  onViewHistory,
  onDone,
  sessionService,
  settings,
  restoreHistoryFocus = false,
  onSessionChange,
}: {
  session: CompletedWorkoutSession
  onViewHistory: () => void
  onDone: () => void
  sessionService: SessionService
  settings: AppSettings
  restoreHistoryFocus?: boolean
  onSessionChange?: (session: CompletedWorkoutSession) => void
}) {
  const [current, setCurrent] = useState(session)
  useEffect(() => { setCurrent(session) }, [session])
  const [pendingSetId, setPendingSetId] = useState('')
  const [error, setError] = useState('')
  const [hasDecided, setHasDecided] = useState(false)
  const [focusDecisionId, setFocusDecisionId] = useState('')
  const decisionResultRefs = useRef<Record<string, HTMLElement | null>>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const historyButton = useRef<HTMLButtonElement>(null)
  const mounted = useRef(false)
  const owner = useRef(session.id)
  owner.current = session.id
  const intent = useRef(0)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const restoreIntent = useRef<number | null>(null)
  useEffect(() => {
    mounted.current = true
    const changed = () => { intent.current += 1 }
    document.addEventListener('focusin', changed)
    document.addEventListener('keydown', changed)
    document.addEventListener('pointerdown', changed)
    return () => {
      mounted.current = false
      document.removeEventListener('focusin', changed)
      document.removeEventListener('keydown', changed)
      document.removeEventListener('pointerdown', changed)
    }
  }, [])
  useEffect(() => { (restoreHistoryFocus ? historyButton.current : heading.current)?.focus() }, [session.id, restoreHistoryFocus])
  const { summary } = current
  const recordSets = current.exercises.flatMap(({ sets }) => sets).filter(({ personalRecords }) => personalRecords?.length)
  const proposals = settings.progressiveOverloadCues
    ? current.exercises.flatMap((exercise) => exercise.sets
        .map((set, index) => ({ exercise, set, index }))
        .filter(({ set }) => set.completedAt && (set.personalRecords?.length || weightsDifferAtDisplayedPrecision(set.weight, set.targetWeight, settings.weightUnit) || set.reps !== set.targetReps)))
    : []

  useEffect(() => {
    if (!focusDecisionId || restoreIntent.current !== intent.current) return
    (focusDecisionId === 'error' ? errorRef.current : decisionResultRefs.current[focusDecisionId])?.focus()
    setFocusDecisionId('')
  }, [current, focusDecisionId, error])

  async function decide(exerciseId: string, setId: string, decision: 'accept' | 'decline') {
    if (pendingSetId) return
    setHasDecided(true)
    const key = JSON.stringify([current.id, exerciseId, setId])
    const sessionId = current.id
    const originIntent = intent.current
    const stillOwned = () => mounted.current && owner.current === sessionId
    setPendingSetId(key)
    setError('')
    try {
      const updated = await sessionService.decideFutureTarget(sessionId, exerciseId, setId, decision)
      // Durable data belongs to the connected flow even after this view departs.
      // Only the originating mounted view may restore decision focus below.
      onSessionChange?.(updated)
      if (!stillOwned()) return
      setCurrent(updated)
      restoreIntent.current = originIntent
      setFocusDecisionId(key)
    } catch (caught) {
      if (!stillOwned()) return
      setError(caught instanceof Error ? caught.message : 'The future target decision could not be saved.')
      restoreIntent.current = originIntent
      setFocusDecisionId('error')
    } finally {
      if (stillOwned()) setPendingSetId('')
    }
  }
  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-home" className="completion-summary">
      <div className="summary-hero">
        <CheckCircle2 size={38} aria-hidden="true" />
        <p className="eyebrow">Session complete</p>
        <h2 ref={heading} tabIndex={-1}>Workout saved</h2>
        <p>{current.name} at {current.gymName}</p>
      </div>
      <p role={!hasDecided && !restoreHistoryFocus ? 'status' : undefined} aria-label="Saved workout status">Workout saved · {countLabel(summary.completedSets, 'set')} completed · {countLabel(summary.skippedSets, 'set')} skipped · {formatWeight(summary.volume, settings.weightUnit)} volume.</p>
      <dl className="summary-metrics" aria-label="Workout summary">
        <div><dt>Volume</dt><dd>{formatWeight(summary.volume, settings.weightUnit)}</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(summary.durationSeconds)}</dd></div>
        <div><dt>Exercises</dt><dd>{countLabel(summary.completedExercises, 'exercise')} completed · {countLabel(summary.skippedExercises, 'exercise')} skipped</dd></div>
        <div><dt>Sets</dt><dd>{countLabel(summary.completedSets, 'set')} completed</dd><dd>{countLabel(summary.skippedSets, 'set')} skipped</dd></div>
      </dl>
      <Panel className="record-summary" aria-labelledby="record-summary-title">
        <Trophy size={24} aria-hidden="true" />
        <strong id="record-summary-title">Personal records</strong>
        <p>{recordSets.length ? `${recordSets.length} completed ${recordSets.length === 1 ? 'set earned' : 'sets earned'} a personal record.` : 'No personal records this time. Skipped sets were not compared.'}</p>
      </Panel>
      {proposals.length > 0 && <div className="future-targets" aria-label="Future target decisions">
        <h3>Targets for next time</h3>
        <p>Only accepted changes update this workout template.</p>
        {proposals.map(({ exercise, set, index }) => (
          <fieldset key={JSON.stringify([current.id, exercise.id, set.id])} aria-label={`Future target for ${exercise.name}${current.exercises.filter(item => item.name === exercise.name).length > 1 ? ` exercise ${current.exercises.findIndex(item => item.id === exercise.id) + 1}` : ''} set ${index + 1}`}>
            <legend>{exercise.name} · Set {index + 1}</legend>
            <p>You completed <strong>{formatWeight(set.weight, settings.weightUnit)} × {set.reps} reps</strong>. Current target: {formatWeight(set.targetWeight, settings.weightUnit)} × {set.targetReps} reps.</p>
            {set.targetDecision ? <strong ref={(node) => { decisionResultRefs.current[JSON.stringify([current.id, exercise.id, set.id])] = node }} role="status" tabIndex={-1}>{set.targetDecision === 'accepted' ? 'Target updated' : set.targetDecision === 'declined' ? 'Current target kept' : 'Updating target…'}</strong> : <div className="target-actions">
              <button type="button" disabled={Boolean(pendingSetId)} onClick={() => void decide(exercise.id, set.id, 'decline')}>Keep current target</button>
              <ActionButton type="button" disabled={Boolean(pendingSetId)} onClick={() => void decide(exercise.id, set.id, 'accept')}>Use this target</ActionButton>
            </div>}
          </fieldset>
        ))}
      </div>}
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="form-message error-copy">{error} Retry the decision above, or leave this summary; logged work is unchanged.</p>}
      <div className="summary-actions">
        <ActionButton ref={historyButton} className="dark-action" onClick={onViewHistory}>View history <ArrowRight size={18} aria-hidden="true" /></ActionButton>
        <button type="button" className="text-button" onClick={onDone}>Back to home</button>
      </div>
    </section>
  )
}
