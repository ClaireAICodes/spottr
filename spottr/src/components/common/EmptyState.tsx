import { type FC } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Friendly empty state with optional CTA.
 * Used across all tabs/lists when no data exists.
 */
const EmptyState: FC<EmptyStateProps> = ({
  icon = '📋',
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="text-5xl mb-4">{icon}</div>
    <h3 className="text-xl font-semibold text-slate-200 mb-2">{title}</h3>
    {description && (
      <p className="text-slate-400 max-w-sm mb-6">{description}</p>
    )}
    {actionLabel && onAction && (
      <button
        className="glass-button"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export default EmptyState;
