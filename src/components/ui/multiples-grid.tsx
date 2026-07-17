import type { ReactNode } from 'react';

// A small-multiples layout: N equal cells, three-up on desktop and stacked on
// mobile, sharing one hairline grid. Layout only — each cell's header (title,
// current value, delta) is composed by the caller so the delta badge stays in
// the app layer. The admin GSC trio is the first consumer; the GSC coverage
// dashboard (3.8.3.4) reuses it.

const columnClasses = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
} as const;

/**
 * Renders the domain-neutral multiples grid with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function MultiplesGrid({
  children,
  columns = 3,
}: {
  children: ReactNode;
  columns?: keyof typeof columnClasses;
}) {
  return (
    <div className={`grid grid-cols-1 ${columnClasses[columns]} gap-px bg-border-soft`}>
      {children}
    </div>
  );
}

/**
 * One cell: a title, a big current value with an optional delta badge beside it,
 * an optional note (e.g. "lower = better"), then the chart.
 */
export function MultiplesCell({
  title,
  value,
  delta,
  note,
  children,
}: {
  title: string;
  value: string;
  delta?: ReactNode;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-bg px-3 py-3 flex flex-col gap-1.5">
      <div className="text-label tracking-emphasis uppercase text-muted">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-lead text-name tabular-nums">{value}</span>
        {delta}
      </div>
      {note && <div className="font-mono text-micro text-muted">{note}</div>}
      <div className="mt-1">{children}</div>
    </div>
  );
}
