import { EmptyState } from '@/components/ui/empty-state';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { listDeadLetteredJobs } from '@/data/esi-refresh-jobs/queries';
import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import { formatCount } from '@/lib/format/number';
import { CardFootnote } from '../CardFootnote';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { deriveDeadLetterView } from '../ops-view';
import { getEsiRefreshQueueStatsShared } from '../shared-reads';
import { deadLetterHint, deriveQueueCells, retainedSummary } from './queue-view';
import { RetryJobForm } from './RetryJobForm';

const DEAD_LETTER_LIMIT = 50;

export function QueueSummary({ stats, now }: { stats: EsiRefreshQueueStat[]; now: Date }) {
  return (
    <>
      <MultiplesGrid columns={4}>
        {deriveQueueCells(stats, now).map((cell) => (
          <MultiplesCell key={cell.id} title={cell.title} value={cell.value} note={cell.note} />
        ))}
      </MultiplesGrid>
      <CardFootnote>{retainedSummary(stats)}</CardFootnote>
    </>
  );
}

/**
 * The newest dead letters, and the real total from the shared queue counts.
 * The list stands on its own if the counts fail; only the total goes.
 */
export async function loadDeadLetters() {
  const [jobs, stats] = await Promise.all([
    listDeadLetteredJobs(DEAD_LETTER_LIMIT),
    loadSection('dead-letter-total', getEsiRefreshQueueStatsShared),
  ]);
  return {
    rows: deriveDeadLetterView(jobs),
    hint: stats === SECTION_LOAD_FAILED ? undefined : deadLetterHint(stats, jobs.length),
  };
}

export function DeadLetterList({ rows }: { rows: ReturnType<typeof deriveDeadLetterView> }) {
  if (rows.length === 0) return <EmptyState kind="clear">No dead-lettered jobs.</EmptyState>;
  return (
    <ul>
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-2 border-b border-border-soft px-3.5 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <div className="font-ui text-ui text-text wrap-break-word">{row.title}</div>
            <div className="font-data text-micro text-muted wrap-break-word">
              <span className="text-tone-red">{row.failureClass}</span> · {row.endpointClass} ·{' '}
              {formatCount(row.attempts, 'attempt')} · {row.timing}
            </div>
          </div>
          <RetryJobForm jobId={row.id} jobLabel={row.title} />
        </li>
      ))}
    </ul>
  );
}
