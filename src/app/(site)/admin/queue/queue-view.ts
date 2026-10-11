import type { EsiRefreshJobStatus, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import { ESI_REFRESH_JOB_RETENTION_DAYS } from '@/data/esi-refresh-jobs/constants';
import { formatCount, formatQuantity } from '@/lib/format/number';
import { formatElapsed } from '@/lib/format/time';
import { countJobs } from '../signals';

export interface QueueCell {
  id: 'waiting' | 'deferred' | 'retrying' | 'dead';
  title: string;
  value: string;
  /** The oldest job's age; absent when the group is empty. */
  note?: string;
}

const CELLS: readonly { id: QueueCell['id']; title: string; statuses: readonly EsiRefreshJobStatus[] }[] = [
  { id: 'waiting', title: 'Queued & running', statuses: ['queued', 'running'] },
  { id: 'deferred', title: 'Held for budget', statuses: ['deferred_for_budget'] },
  { id: 'retrying', title: 'Awaiting retry', statuses: ['failed_retryable'] },
  { id: 'dead', title: 'Dead-lettered', statuses: ['dead_lettered'] },
];

export function deriveQueueCells(stats: EsiRefreshQueueStat[], now: Date): QueueCell[] {
  return CELLS.map((cell) => {
    const { count, oldest } = countJobs(stats, cell.statuses);
    return {
      id: cell.id,
      title: cell.title,
      value: formatQuantity(count),
      note:
        oldest === null
          ? undefined
          : `oldest job ${formatElapsed(now.getTime() - oldest.getTime(), { dayAfterHours: 48 })}`,
    };
  });
}

export function retainedSummary(stats: EsiRefreshQueueStat[]): string {
  const succeeded = countJobs(stats, ['succeeded']).count;
  const permanent = countJobs(stats, ['failed_permanent']).count;
  return `${formatQuantity(succeeded)} succeeded · ${formatQuantity(permanent)} failed permanently in the last ${ESI_REFRESH_JOB_RETENTION_DAYS} days`;
}

/** The dead-letter list stops at `shown` rows; the hint carries the real total. */
export function deadLetterHint(stats: EsiRefreshQueueStat[], shown: number): string {
  const total = Math.max(countJobs(stats, ['dead_lettered']).count, shown);
  const jobs = formatCount(total, 'job');
  return total > shown ? `${jobs} · newest ${formatQuantity(shown)} shown` : jobs;
}
