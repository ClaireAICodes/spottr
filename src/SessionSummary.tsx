import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { ActionButton, Panel } from './primitives'
import type { CompletedWorkoutSession } from './sessions'

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
}: {
  session: CompletedWorkoutSession
  onViewHistory: () => void
  onDone: () => void
}) {
  const { summary } = session
  return (
    <section id="main-view" role="tabpanel" aria-labelledby="tab-home" className="completion-summary">
      <div className="summary-hero">
        <CheckCircle2 size={38} aria-hidden="true" />
        <p className="eyebrow">Session complete</p>
        <h2>Workout saved</h2>
        <p>{session.name} at {session.gymName}</p>
      </div>
      <dl className="summary-metrics" aria-label="Workout summary">
        <div><dt>Volume</dt><dd>{summary.volume.toLocaleString()} kg</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(summary.durationSeconds)}</dd></div>
        <div><dt>Exercises</dt><dd>{countLabel(summary.completedExercises, 'completed')} · {countLabel(summary.skippedExercises, 'skipped')}</dd></div>
        <div><dt>Sets</dt><dd>{countLabel(summary.completedSets, 'set')} completed</dd><dd>{countLabel(summary.skippedSets, 'set')} skipped</dd></div>
      </dl>
      <div className="summary-reserved" aria-label="Upcoming workout insights">
        <Panel><strong>Personal records · Coming next</strong><p>This saved session is ready for PR comparison.</p></Panel>
        <Panel><strong>Future targets · Coming next</strong><p>Your template stays unchanged until you choose an update.</p></Panel>
      </div>
      <div className="summary-actions">
        <ActionButton className="dark-action" onClick={onViewHistory}>View history <ArrowRight size={18} aria-hidden="true" /></ActionButton>
        <button type="button" className="text-button" onClick={onDone}>Back to home</button>
      </div>
    </section>
  )
}
