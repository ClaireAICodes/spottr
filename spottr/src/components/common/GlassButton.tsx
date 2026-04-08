import { type FC, type ButtonHTMLAttributes } from 'react';

export type GlassButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type GlassButtonSize = 'sm' | 'md' | 'lg';

interface GlassButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  children: React.ReactNode;
  variant?: GlassButtonVariant;
  size?: GlassButtonSize;
  /** Full-width button. Default: false. */
  fullWidth?: boolean;
  /** Icon (Renders before text) */
  icon?: React.ReactNode;
}

const sizeClasses: Record<GlassButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-8 py-3.5 text-lg',
};

const variantClasses: Record<GlassButtonVariant, string> = {
  primary:
    'bg-gradient-main-btn text-white shadow-glow-primary',
  secondary:
    'bg-white/10 border border-white/20 text-slate-200 hover:bg-white/20',
  danger:
    'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30',
  ghost:
    'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5',
};

/**
 * Glassmorphism button with gradient primary, ghost secondary, and danger variants.
 * Pill-shaped, with focus ring for accessibility.
 */
const GlassButton: FC<GlassButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  className = '',
  disabled,
  ...rest
}) => (
  <button
    className={[
      'btn-base',
      sizeClasses[size],
      variantClasses[variant],
      fullWidth && 'w-full',
      disabled && 'opacity-50 cursor-not-allowed',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    disabled={disabled}
    {...rest}
  >
    {icon && <span className="mr-2 inline-flex items-center">{icon}</span>}
    {children}
  </button>
);

export default GlassButton;
