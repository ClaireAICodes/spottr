import { useEffect, useRef } from 'react'
import { ActionButton } from './primitives'

/** Controlled actuals buffer: closing does not log, restart timing, or discard edits. */
export function SetConfirmationSheet({ label, unit, value, pending, error, onChange, onLog, onClose }: {
  label: string
  unit: 'kg' | 'lb'
  value: { weight: string; reps: string }
  pending: boolean
  error: string
  onChange: (value: { weight: string; reps: string }) => void
  onLog: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return <div className="dialog-backdrop">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="set-confirmation-title" className="confirm-dialog set-confirmation" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!pending) onClose() }
      if (event.key !== 'Tab') return
      const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)'))
      const index = controls.indexOf(document.activeElement as HTMLElement)
      if (!controls.length) { event.preventDefault(); heading.current?.focus(); return }
      if (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0)) {
        event.preventDefault()
        controls[event.shiftKey ? controls.length - 1 : 0].focus()
      }
    }}>
      <h3 id="set-confirmation-title" ref={heading} tabIndex={-1}>Confirm {label}</h3>
      <p>Set complete. Confirm what you performed before saving.</p>
      <label>Actual weight ({unit})<input type="number" min="0" step="0.1" value={value.weight} disabled={pending} onChange={event => onChange({ ...value, weight: event.target.value })} /></label>
      <label>Actual reps<input type="number" min="1" step="1" value={value.reps} disabled={pending} onChange={event => onChange({ ...value, reps: event.target.value })} /></label>
      {error && <p role="alert" className="form-message error-copy">{error}</p>}
      <div className="form-actions">
        <button type="button" disabled={pending} onClick={onClose}>Back to set</button>
        <ActionButton disabled={pending} onClick={onLog}>{pending ? 'Saving…' : error ? 'Retry log set' : 'Log set'}</ActionButton>
      </div>
    </div>
  </div>
}
