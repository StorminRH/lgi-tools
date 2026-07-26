import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * Reserves the geometry of content that has not arrived yet. Use it for portraits, cards, rows,
 * figures, and other content-shaped fallbacks so the static shell paints the page's real rhythm;
 * use LoadingLabel only for compact inline status that has no meaningful geometry to reserve.
 */
export function Skeleton({
  label = 'Loading',
  className,
  ...props
}: { label?: string } & ComponentProps<'span'>) {
  return (
    <span role="status"
      aria-label={label}
      className={cn('skeleton-shimmer block rounded-ctl', className)}
      {...props}
    />
  );
}
