import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from 'react'

// Reveal the whole numeric field and ring on native arrival and value editing.
export function revealNumericInput(event: React.SyntheticEvent) {
  const input = event.target
  if (input instanceof HTMLInputElement && input.type === 'number' && document.activeElement === input) {
    input.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
  }
}

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`panel ${className}`.trim()} {...props} />
}

export const ActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function ActionButton({ className = '', ...props }, ref) {
    return <button ref={ref} className={`action-button ${className}`.trim()} {...props} />
  },
)

export function StatusPill({ children }: PropsWithChildren) {
  return <span className="status-pill">{children}</span>
}
