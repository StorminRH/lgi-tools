import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * Renders the domain-neutral kbd with house behavior and tokens; callers own semantic meaning and
 * content while this primitive owns presentation.
 */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-ctl border border-border-idle border-b-2 ' +
          'bg-bg-deep px-1.5 py-0.5 font-mono text-micro text-muted',
        className,
      )}
      {...props}
    />
  );
}
