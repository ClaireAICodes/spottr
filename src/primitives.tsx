import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from 'react'

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`panel ${className}`.trim()} {...props} />
}

export function ActionButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`action-button ${className}`.trim()} {...props} />
}

export function StatusPill({ children }: PropsWithChildren) {
  return <span className="status-pill">{children}</span>
}
