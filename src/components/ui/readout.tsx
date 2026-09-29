import type { ReactNode } from 'react';
import { cardSurface } from './card';
import { cn } from './cn';
import { SectionHeader } from './section-header';
import { eyebrow } from './type-roles';

/** The glass a readout sits on; identity and headings float on the backdrop. */
export const readoutSurface = cn(cardSurface, 'min-w-0 overflow-hidden');

export function SectionPanel({
  title,
  meta,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(readoutSurface, className)}>
      <SectionHeader label={title} hint={meta} size="md" />
      {children}
    </section>
  );
}

/** A small stat readout on glass. */
export function KpiTile({
  label,
  note,
  tone = 'text-name',
  noteTone = 'text-isk',
  children,
}: {
  label: string;
  note?: string;
  tone?: string;
  noteTone?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(readoutSurface, 'flex flex-col gap-1 px-3 py-2.5 sm:px-3.5')}>
      <dt className={eyebrow({ size: 'micro' })}>{label}</dt>
      <dd className={cn('font-data text-h3 tabular-nums sm:text-stat', tone)}>{children}</dd>
      {note !== undefined && <dd className={cn('font-data text-micro', noteTone)}>{note}</dd>}
    </div>
  );
}

/** A small labelled figure inside a readout: a jobs count, a slot tally. */
export function StatFigure({ label, value, tone = 'text-name' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={eyebrow({ size: 'micro' })}>{label}</dt>
      <dd className={cn('font-data text-h3 tabular-nums', tone)}>{value}</dd>
    </div>
  );
}
