import type { ReactNode } from 'react';
import { eyebrow } from './type-roles';

const columnClasses = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
} as const;

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
      <div className={eyebrow({ emphasis: 'strong' })}>{title}</div>

      <div className="flex items-baseline gap-2">
        <span className="font-data text-lead text-name tabular-nums">{value}</span>

        {delta}
      </div>

      {note && <div className="font-data text-micro text-muted">{note}</div>}

      <div className="mt-1">{children}</div>

    </div>

  );
}
