import { SecurityStatus } from '@/components/security-status';
import { cn } from '@/components/ui/cn';
import { formatIsk } from '@/lib/format/isk';
import type { SystemRef } from '@/composition/board/api-contract';
import type { HealthTone, QueueHealth } from './board-view-model';

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
      {showSecurity && <SecurityStatus security={security} />}
    </span>
  );
}

/** Money in and out over the journal window, one quiet line; the window is about 30 days. */
export function FlowLine({ inflow, outflow }: { inflow: number; outflow: number }) {
  return (
    <span className="font-data text-ui tabular-nums">
      <span className="text-isk">+{formatIsk(inflow)}</span>
      <span className="text-faint"> in · </span>
      <span className="text-dps-high">−{formatIsk(Math.abs(outflow))}</span>
      <span className="text-faint"> out · </span>
      <span className="text-micro text-faint">30d</span>
    </span>
  );
}
