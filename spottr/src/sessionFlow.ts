import type { SessionSet, WorkoutSession } from './sessions'

export type SetIdentity = { sessionId: string; occurrenceId: string; setId: string }
export type Stage = SetIdentity & {
  phase: 'ready' | 'performing' | 'confirming' | 'saving' | 'rest' | 'exerciseComplete' | 'finishing' | 'error'
  requestId?: string
}
export type FlowEvent = { type: 'RESUME' } | (SetIdentity & { type: 'LOG_REQUEST' | 'LOG_OK' | 'LOG_FAILED'; requestId: string })

function phaseFor(set: SessionSet): Stage['phase'] {
  if (set.timing?.endedAt) return 'confirming'
  return set.timing ? 'performing' : 'ready'
}

/** Presentation only. Service-returned persisted snapshots remain authoritative. */
export function reduceSessionFlow(state: Stage | null, event: FlowEvent, persisted: WorkoutSession): Stage | null {
  if (event.type !== 'RESUME') {
    if (!state || state.sessionId !== persisted.id || event.sessionId !== state.sessionId
      || event.occurrenceId !== state.occurrenceId || event.setId !== state.setId) return state
    const set = persisted.exercises.find(exercise => exercise.id === state.occurrenceId)?.sets.find(set => set.id === state.setId)
    if (!set || set.skippedAt) return state
    if (event.type === 'LOG_REQUEST') {
      if (!['confirming', 'error'].includes(state.phase) || set.completedAt
        || (state.requestId && state.requestId !== event.requestId)) return state
      return { ...state, phase: 'saving', requestId: event.requestId }
    }
    if (state.phase !== 'saving' || state.requestId !== event.requestId) return state
    if (event.type === 'LOG_FAILED') return { ...state, phase: 'error' }
    if (!set.completedAt) return state
    if (persisted.restTimer) return { phase: 'rest', sessionId: state.sessionId, occurrenceId: state.occurrenceId, setId: state.setId }
    const remaining = persisted.exercises.find(exercise => exercise.id === state.occurrenceId)?.sets
      .filter(set => !set.completedAt && !set.skippedAt)
    const next = remaining?.find(set => set.timing) ?? remaining?.[0]
    return { phase: next ? phaseFor(next) : 'exerciseComplete', sessionId: state.sessionId, occurrenceId: state.occurrenceId, setId: next?.id ?? state.setId }
  }
  const remaining = persisted.exercises.flatMap(exercise => exercise.sets
    .filter(set => !set.completedAt && !set.skippedAt)
    .map(set => ({ exercise, set })))
  const current = remaining.find(({ set }) => set.timing) ?? remaining[0]
  if (!current) return null
  return { phase: phaseFor(current.set), sessionId: persisted.id, occurrenceId: current.exercise.id, setId: current.set.id }
}
