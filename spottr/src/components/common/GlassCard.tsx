import { type FC, type ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Override padding. Default: true (1.5rem). */
  padded?: boolean;
  /** Hover lift effect. Default: true. */
  hover?: boolean;
  /** Top accent bar color (CSS color). */
  accentBar?: string;
  /** Click handler — makes card tappable. */
  onClick?: () => void;
}

/**
 * Frosted-glass card with backdrop blur, subtle border, and soft shadow.
 * The core building block of Spottr's glassmorphism UI.
 */
const GlassCard: FC<GlassCardProps> = ({
  children,
  className = '',
  padded = true,
  hover = true,
  accentBar,
  onClick,
}) => (
  <div
    className={[
      'glass-card',
      padded && 'p-6',
      hover && 'hover-lift',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    style={accentBar ? { borderTop: `4px solid ${accentBar}` } : undefined}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') onClick();
          }
        : undefined
    }
  >
    {children}
  </div>
);

export default GlassCard;
