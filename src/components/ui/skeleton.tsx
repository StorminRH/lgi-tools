import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * A shimmering placeholder bar. With a `label` it stands alone as a loading
 * status; without one it is decoration, so composite fallbacks put their bars
 * inside one `SkeletonGroup` instead of labelling or hiding each bar.
 */
export function Skeleton({
  label,
  className,
  ...props
}: { label?: string } & ComponentProps<'span'>) {
  return (
    <span
      {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('skeleton-shimmer block', className)}
      {...props}
    />
  );
}

/** The one loading status for a fallback built from several skeleton bars. */
export function SkeletonGroup({ label, ...props }: { label: string } & ComponentProps<'div'>) {
  return <div role="status" aria-label={label} aria-busy="true" {...props} />;
}
