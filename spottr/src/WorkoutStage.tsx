import type { ReactNode } from 'react'

/** Presentation only; ActiveSession owns selection and all mutation controls. */
export function WorkoutStage({ title, setNumber, totalSets, target, onPrimary, onOverview, reference, children }: {
  title: string
  setNumber: number
  totalSets: number
  target: string
  phase: 'ready'
  onPrimary?: () => void
  onOverview: () => void
  reference?: ReactNode
  children?: ReactNode
}) {
  return <section aria-label="Current set">
    {!children && <h2>{title}</h2>}
    <p>Set {setNumber} of {totalSets}</p>
    {reference}
    <p><strong>{target}</strong></p>
    {children ?? <button type="button" onClick={onPrimary} style={{ minHeight: 52, width: '100%' }}>Start set</button>}
    {!children && <button type="button" onClick={onOverview}>Workout overview</button>}
  </section>
}
