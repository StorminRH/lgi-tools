import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MultiplesCell, MultiplesGrid } from '@/components/ui/multiples-grid';
import { SectionHeader } from '@/components/ui/section-header';
import { listDeadLetteredJobs } from '@/data/esi-refresh-jobs/queries';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { deriveDeadLetterView } from '../ops-view';
import { getEsiRefreshQueueStatsShared } from '../queue-stats-shared';
import { SectionUnavailable } from '../SectionUnavailable';
import { deriveQueueCells, retainedSummary } from './queue-view';
import { RetryJobForm } from './RetryJobForm';

const DEAD_LETTER_LIMIT = 50;

export async function QueueSummaryCard() {
  const fetched = await loadSection('esi-refresh-queue', getEsiRefreshQueueStatsShared);
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Queue" />;
  return (
    <Card>
      <SectionHeader size="md" label="Queue" hint="live" />
      <MultiplesGrid columns={4}>
        {deriveQueueCells(fetched, new Date()).map((cell) => (
          <MultiplesCell key={cell.id} title={cell.title} value={cell.value} note={cell.note}>
            {null}
          </MultiplesCell>
        ))}
      </MultiplesGrid>
      <div className="border-t border-border-soft px-3.5 py-2 font-data text-micro text-muted">
        {retainedSummary(fetched)}
      </div>
    </Card>
  );
}

export async function DeadLettersCard() {
  const fetched = await loadSection('dead-letters', () => listDeadLetteredJobs(DEAD_LETTER_LIMIT));
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Dead letters" />;
  const rows = deriveDeadLetterView(fetched);
  return (
    <Card id="dead-letters" className="scroll-mt-24">
      <SectionHeader
        size="md"
        label={`Dead letters · ${rows.length}${rows.length === DEAD_LETTER_LIMIT ? '+' : ''}`}
        hint="jobs that used every attempt · retry once the cause is fixed"
      />
      {rows.length === 0 ? (
        <EmptyState>No dead-lettered refresh jobs. Nothing to retry.</EmptyState>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 border-b border-border-soft px-3.5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="text-ui text-text">{row.title}</div>
                <div className="break-all font-data text-micro text-muted">
                  <span className="text-tone-red">{row.failureClass}</span> · {row.endpointClass} ·{' '}
                  {row.attempts} attempts · {row.timing}
                </div>
              </div>
              <RetryJobForm jobId={row.id} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
