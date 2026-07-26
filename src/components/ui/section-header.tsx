import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

/**
 * `size` widens the header for dense dashboard cards: 'sm' is the sitewide
 * default; 'md' reads at 11px for pages (admin) whose primary content is the
 * card headers themselves.
 */
export function SectionHeader({
  label,
  hint,
  size = 'sm',
  variant = 'bar',
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  size?: 'sm' | 'md';
  variant?: 'bar' | 'sub';
  className?: string;
}) {
  const sizing = size === 'md' ? 'px-3.5 py-2' : 'px-3.5 py-[5px]';
  const hintSizing = 'text-micro';
  return (
    <div
      className={cn(
        eyebrow({
          size: size === 'md' ? 'label' : 'micro',
          weight: 'semibold',
          emphasis: 'strong',
          className: 'flex items-center justify-between',
        }),
        variant === 'bar'
          ? 'bg-section border-b border-border-soft border-t border-t-border'
          : 'text-label',
        variant === 'bar' && sizing,
        className,
      )}
    >
      <span>{label}</span>
      {hint && <span className={`${hintSizing} font-normal text-muted`}>{hint}</span>}
    </div>
  );
}
