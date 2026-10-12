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
}: {
  session: CompletedWorkoutSession
  onViewHistory: () => void
  onDone: () => void
  sessionService: SessionService
  settings: AppSettings
}) {
  const [current, setCurrent] = useState(session)
  const [pendingSetId, setPendingSetId] = useState('')
  const [error, setError] = useState('')
  const [focusDecisionId, setFocusDecisionId] = useState('')
  const decisionResultRefs = useRef<Record<string, HTMLElement | null>>({})
  const { summary } = current
  const recordSets = current.exercises.flatMap(({ sets }) => sets).filter(({ personalRecords }) => personalRecords?.length)
  const proposals = settings.progressiveOverloadCues
    ? current.exercises.flatMap((exercise) => exercise.sets
        .map((set, index) => ({ exercise, set, index }))
        .filter(({ set }) => set.completedAt && (weightsDifferAtDisplayedPrecision(set.weight, set.targetWeight, settings.weightUnit) || set.reps !== set.targetReps)))
    : []

  useEffect(() => {
    if (!focusDecisionId) return
    decisionResultRefs.current[focusDecisionId]?.focus()
    setFocusDecisionId('')
  }, [current, focusDecisionId])

  async function decide(exerciseId: string, setId: string, decision: 'accept' | 'decline') {
    if (pendingSetId) return
    setPendingSetId(setId)
    setError('')
    try {
      setCurrent(await sessionService.decideFutureTarget(current.id, exerciseId, setId, decision))
      setFocusDecisionId(setId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The future target decision could not be saved.')
    } finally {
      setPendingSetId('')
    }
  }
  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-home" className="completion-summary">
      <div className="summary-hero">
        <CheckCircle2 size={38} aria-hidden="true" />
        <p className="eyebrow">Session complete</p>
        <h2>Workout saved</h2>
        <p>{current.name} at {current.gymName}</p>
      </div>
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
          <fieldset key={set.id} aria-label={`Future target for ${exercise.name} set ${index + 1}`}>
            <legend>{exercise.name} · Set {index + 1}</legend>
            <p>You completed <strong>{formatWeight(set.weight, settings.weightUnit)} × {set.reps} reps</strong>. Current target: {formatWeight(set.targetWeight, settings.weightUnit)} × {set.targetReps} reps.</p>
            {set.targetDecision ? <strong ref={(node) => { decisionResultRefs.current[set.id] = node }} role="status" tabIndex={-1}>{set.targetDecision === 'accepted' ? 'Target updated' : set.targetDecision === 'declined' ? 'Current target kept' : 'Updating target…'}</strong> : <div className="target-actions">
              <button type="button" disabled={Boolean(pendingSetId)} onClick={() => void decide(exercise.id, set.id, 'decline')}>Keep current target</button>
              <ActionButton type="button" disabled={Boolean(pendingSetId)} onClick={() => void decide(exercise.id, set.id, 'accept')}>Use this target</ActionButton>
            </div>}
          </fieldset>
        ))}
      </div>}
      {error && <p role="alert" className="form-message error-copy">{error}</p>}
      <div className="summary-actions">
        <ActionButton className="dark-action" onClick={onViewHistory}>View history <ArrowRight size={18} aria-hidden="true" /></ActionButton>
        <button type="button" className="text-button" onClick={onDone}>Back to home</button>
      </div>
    </section>
  )
}
