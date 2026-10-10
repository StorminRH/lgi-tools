import type { EsiHealth } from '@/composition/esi-health';
import type { LiveServerStatus, SdeBuild, ServerStatus } from '@/data/eve-status/types';
import type { StatusLevel } from '@/data/telemetry/health-metrics';
import { formatPct, formatQuantity } from '@/lib/format/number';
import { formatUtcDate, formatUtcTime } from '@/lib/format/time';

export function serverStatusPresentation(status: ServerStatus): {
  value: string;
  ariaLabel: string;
} {
  switch (status.state) {
    case 'online':
      return {
        value: formatQuantity(status.players),
        ariaLabel: `Tranquility online — ${formatQuantity(status.players)} players`,
      };
    case 'vip':
      return { value: 'VIP', ariaLabel: 'Tranquility in VIP-only mode' };
    case 'offline':
      return { value: 'offline', ariaLabel: 'Tranquility server offline' };
    case 'unknown':
      return { value: 'unknown', ariaLabel: 'Tranquility status unknown' };
  }
}

function isLive(status: ServerStatus): status is LiveServerStatus {
  return status.state === 'online' || status.state === 'vip';
}

export interface EveStatusRow {
  label: string;
  value: string;
  level: StatusLevel;
}

export interface EveStatusSection {
  heading: string;
  rows: EveStatusRow[];
}

const TQ_STATE: Record<ServerStatus['state'], Pick<EveStatusRow, 'value' | 'level'>> = {
  online: { value: 'Online', level: 'green' },
  vip: { value: 'VIP only', level: 'amber' },
  offline: { value: 'Offline', level: 'red' },
  unknown: { value: 'Unknown', level: 'neutral' },
};

function tranquilityRows(status: ServerStatus): EveStatusRow[] {
  const rows: EveStatusRow[] = [{ label: 'Status', ...TQ_STATE[status.state] }];
  if (isLive(status)) {
    rows.push({ label: 'Players', value: formatQuantity(status.players), level: 'green' });
    if (status.startedAt !== null) {
      rows.push({ label: 'Up since', value: `${formatUtcTime(new Date(status.startedAt))} UTC`, level: 'green' });
    }
  }
  return rows;
}

function esiRows(esi: EsiHealth): EveStatusRow[] {
  const { availability, budget } = esi;
  return [
    availability.state === 'measured'
      ? { label: 'Success, last hour', value: formatPct(availability.rate * 100), level: availability.level }
      : { label: 'Success, last hour', value: availability.state === 'idle' ? 'No calls' : 'Unknown', level: 'neutral' },
    budget.state === 'unknown'
      ? { label: 'Error budget', value: 'Unknown', level: 'neutral' }
      : {
          label: 'Error budget',
          value: budget.state === 'paused' ? 'Paused' : `${budget.remaining} of ${budget.ceiling}`,
          level: budget.state === 'paused' ? 'red' : 'green',
        },
  ];
}

/** The SDE build LGI runs on, flagged when CCP has published a newer one. */
function sdeRows(sde: SdeBuild | null): EveStatusRow[] {
  if (sde === null) return [{ label: 'Build', value: 'Unknown', level: 'neutral' }];
  const behind = sde.latestPublished !== null && Number(sde.build) < Number(sde.latestPublished);
  return [
    { label: 'Build', value: behind ? `${sde.build} · behind` : sde.build, level: behind ? 'amber' : 'green' },
    { label: 'Ingested', value: formatUtcDate(sde.ingestedAt), level: 'green' },
  ];
}

export function eveStatusSections({
  status,
  sde,
  esi,
}: {
  status: ServerStatus;
  sde: SdeBuild | null;
  esi: EsiHealth;
}): EveStatusSection[] {
  return [
    { heading: 'Tranquility', rows: tranquilityRows(status) },
    { heading: 'ESI', rows: esiRows(esi) },
    { heading: 'Static data', rows: sdeRows(sde) },
  ];
}
