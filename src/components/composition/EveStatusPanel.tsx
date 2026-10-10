import type { EveStatusSection } from '@/components/composition/server-status-presentation';
import { PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import type { StatusLevel } from '@/data/telemetry/health-metrics';

// Healthy values stay plain so only problems draw the eye.
const LEVEL_CLASS: Record<StatusLevel, string | undefined> = {
  green: undefined,
  amber: 'text-tone-orange',
  red: 'text-tone-red',
  neutral: 'text-muted',
};

/** Tranquility, ESI and the static data LGI runs on, one block each. */
export function EveStatusPanel({ sections }: { sections: EveStatusSection[] }) {
  return sections.map((section) => (
    <section key={section.heading} className="flex flex-col gap-1.5">
      <PopoverHeading>{section.heading}</PopoverHeading>
      {section.rows.map((row) => (
        <PopoverRow key={row.label} label={row.label}>
          <span className={LEVEL_CLASS[row.level]}>{row.value}</span>
        </PopoverRow>
      ))}
    </section>
  ));
}

export function EveStatusPanelFallback() {
  return (
    <SkeletonGroup label="Loading EVE status" className="flex flex-col gap-2">
      <Skeleton className="h-3 w-24" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-3 w-full" />
      ))}
    </SkeletonGroup>
  );
}
