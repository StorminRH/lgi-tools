import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

/**
 * Renders the domain-neutral callout with house behavior and tokens; callers own semantic meaning
 * and content while this primitive owns presentation.
 */
export function Callout({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border border-l-2 border-callout-border border-l-callout-rule bg-callout-bg px-2.5 py-[5px] text-label tracking-[0.03em] text-dps-mid',
        className,
      )}
    >
      <span className={`${eyebrow({ tone: 'callout', weight: 'semibold' })} shrink-0`}>
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
