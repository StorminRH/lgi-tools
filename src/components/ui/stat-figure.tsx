import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

/**
 * A labelled figure: a small eyebrow term over a tabular value, with an
 * optional note line under it. It renders a `dt` and `dd` pair, so place it
 * inside a `<dl>`.
 */
export function StatFigure({
  label,
  tone = 'text-name',
  size = 'md',
  note,
  noteTone = 'text-muted',
  className,
  children,
}: {
  label: string;
  /** The value's colour class. */
  tone?: string;
  /** `lg` steps the value up to stat size from the `sm` breakpoint, for a figure that stands as its own tile. */
  size?: 'md' | 'lg';
  note?: string;
  /** The note's colour class. */
  noteTone?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <dt className={eyebrow({ size: 'micro' })}>{label}</dt>
      <dd className={cn('font-data text-h3 tabular-nums', size === 'lg' && 'sm:text-stat', tone)}>{children}</dd>
      {note === undefined ? null : <dd className={cn('font-data text-micro', noteTone)}>{note}</dd>}
    </div>
  );
}
