import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from 'react'

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
