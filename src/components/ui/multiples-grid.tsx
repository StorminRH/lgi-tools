import type { ReactNode } from 'react';
import { eyebrow } from './type-roles';

const columnClasses = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const;

/** Stat tiles on a hairline grid, marked up as a description list. */
export function MultiplesGrid({
  children,
  columns = 3,
}: {
  children: ReactNode;
  columns?: keyof typeof columnClasses;
}) {
  return (
    <dl className={`grid grid-cols-1 ${columnClasses[columns]} gap-px bg-border-soft`}>
      {children}
    </dl>
  );
}

/**
 * One tile: the title is the term, the value, note and optional chart its
 * description. The inset matches card headers and rows.
 */
export function MultiplesCell({
  title,
  value,
  delta,
  note,
  children,
}: {
  title: string;
  value: ReactNode;
  delta?: ReactNode;
  note?: string;
  /** A chart or other figure under the value. */
  children?: ReactNode;
}) {
  return (
    <div className="bg-bg px-3.5 py-3 flex flex-col gap-1.5">
      <dt className={eyebrow({ emphasis: 'strong' })}>{title}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="font-data text-lead text-name tabular-nums">{value}</span>
        {delta}
      </dd>
      {note && <dd className="font-data text-micro text-muted">{note}</dd>}
      {children === undefined || children === null ? null : <dd className="mt-1">{children}</dd>}
    </div>
  );
}
