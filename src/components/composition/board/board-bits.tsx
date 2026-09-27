import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { eyebrow } from '@/components/ui/type-roles';
import type { SystemRef } from '@/composition/board/api-contract';
import { roundSecurityStatus, securityStatusTextClass } from '@/data/eve-data/security';
import type { HealthTone, QueueHealth } from './board-view-model';
import { readoutSurface } from './SectionBody';

const HEALTH_CLASS: Record<HealthTone, string> = {
  ok: 'text-muted',
  warn: 'text-dps-mid',
  bad: 'text-dps-high',
  quiet: 'text-faint',
};

export function HealthLine({ health, className }: { health: QueueHealth; className?: string }) {
  return <span className={cn('font-data', HEALTH_CLASS[health.tone], className)}>{health.label}</span>;
}

export function SystemName({ system }: { system: SystemRef }) {
  const { security } = system;
  const showSecurity = system.secClass !== 'wormhole' && security !== null;
  return (
    <span className="inline-flex items-baseline gap-1.5 font-data">
      <span className="text-name">{system.name}</span>
      {showSecurity && (
        <span className={securityStatusTextClass(security)}>
          {roundSecurityStatus(security).toFixed(1)}
        </span>
      )}
    </span>
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
