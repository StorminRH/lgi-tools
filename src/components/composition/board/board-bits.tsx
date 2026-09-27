import { cn } from '@/components/ui/cn';
import type { SystemRef } from '@/composition/board/api-contract';
import { roundSecurityStatus, securityStatusTextClass } from '@/data/eve-data/security';
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

/** A system name with its security status in the EVE security colour. */
export function SystemName({ system }: { system: SystemRef }) {
  const showSecurity = system.secClass !== 'wormhole' && system.security !== null;
  return (
    <span className="inline-flex items-baseline gap-1.5 font-data">
      <span className="text-name">{system.name}</span>
      {showSecurity && system.security !== null && (
        <span className={securityStatusTextClass(system.security)}>
          {roundSecurityStatus(system.security).toFixed(1)}
        </span>
      )}
    </span>
  );
}
