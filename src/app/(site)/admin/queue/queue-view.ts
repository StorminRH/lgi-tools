import type { EsiRefreshJobStatus, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import { ESI_REFRESH_JOB_RETENTION_DAYS } from '@/data/esi-refresh-jobs/constants';

export interface QueueCell {
  id: 'waiting' | 'deferred' | 'retrying' | 'dead';
  title: string;
  value: string;
  note: string;
}

const CELLS: readonly { id: QueueCell['id']; title: string; statuses: readonly EsiRefreshJobStatus[] }[] = [
  { id: 'waiting', title: 'Queued & running', statuses: ['queued', 'running'] },
  { id: 'deferred', title: 'Held for budget', statuses: ['deferred_for_budget'] },
  { id: 'retrying', title: 'Awaiting retry', statuses: ['failed_retryable'] },
  { id: 'dead', title: 'Dead-lettered', statuses: ['dead_lettered'] },
];

function ageLabel(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function countOf(stats: EsiRefreshQueueStat[], statuses: readonly EsiRefreshJobStatus[]) {
  const matching = stats.filter((stat) => statuses.includes(stat.status));
  const count = matching.reduce((total, stat) => total + stat.count, 0);
  const oldest = matching.reduce<Date | null>(
    (min, stat) => (min === null || stat.oldestCreatedAt < min ? stat.oldestCreatedAt : min),
    null,
  );
  return { count, oldest };
}

export function deriveQueueCells(stats: EsiRefreshQueueStat[], now: Date): QueueCell[] {
  return CELLS.map((cell) => {
    const { count, oldest } = countOf(stats, cell.statuses);
    return {
      id: cell.id,
      title: cell.title,
      value: count.toLocaleString(),
      note: oldest === null ? 'none' : `oldest job ${ageLabel(oldest, now)}`,
    };
  });
}

export function retainedSummary(stats: EsiRefreshQueueStat[]): string {
  const succeeded = countOf(stats, ['succeeded']).count;
  const permanent = countOf(stats, ['failed_permanent']).count;
  return `${succeeded.toLocaleString()} succeeded · ${permanent.toLocaleString()} failed permanently in the last ${ESI_REFRESH_JOB_RETENTION_DAYS} days`;
}
