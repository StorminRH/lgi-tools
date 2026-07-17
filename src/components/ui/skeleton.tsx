import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * Renders the domain-neutral skeleton with house behavior and tokens; callers own semantic meaning
 * and content while this primitive owns presentation.
 */
export function Skeleton({
  label = 'Loading',
  className,
  ...props
}: { label?: string } & ComponentProps<'span'>) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('skeleton-shimmer block rounded-ctl', className)}
      {...props}
    />
  );
}
