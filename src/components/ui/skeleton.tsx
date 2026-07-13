import type { ComponentProps } from 'react';
import { cn } from './cn';

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
