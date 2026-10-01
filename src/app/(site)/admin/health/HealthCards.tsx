import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { scrollArea } from '@/components/ui/scroll-area';
import { SectionHeader } from '@/components/ui/section-header';
import { listRecentDomainEvents } from '@/data/domain-events/queries';
import { listDeadLetteredJobs } from '@/data/esi-refresh-jobs/queries';
import {
  getCriticalLatencyP95,
  getEsiSuccessRate,
  getMutationSuccessRate,
  getReadSuccessRate,
  MUTATION_EXCLUDED_OUTCOMES,
} from '@/data/telemetry/queries';
import {
  countCapabilityOutcome,
  listCapabilityFailures,
  listDailyCapabilityFailures,
  listEsiFailures,
  listSlowestOperations,
} from '@/data/telemetry/sli-breakdown';
import type { DateRange } from '@/data/telemetry/types';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { summarizeDomainEvent } from '../ops-view';
import { getEsiRefreshQueueStatsShared } from '../queue-stats-shared';
import { SectionUnavailable } from '../SectionUnavailable';
import { summarizeQueue } from '../signals';
import { deriveServiceLevels } from './health-view';
import { DEAD_LETTER_PREVIEW, ServiceLevelRows, type FailureDetail, type ServiceLevelDetails } from './ServiceLevelRows';

export async function ServiceLevelsCard({ range }: { range: DateRange }) {
  const fetched = await loadSection('service-levels', () =>
    Promise.all([
      loadSection('getReadSuccessRate', () => getReadSuccessRate(range)),
      loadSection('getMutationSuccessRate', () => getMutationSuccessRate(range)),
      loadSection('getCriticalLatencyP95', () => getCriticalLatencyP95(range)),
      loadSection('getEsiSuccessRate', () => getEsiSuccessRate(range)),
      getEsiRefreshQueueStatsShared(),
      loadServiceLevelDetails(range),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Service levels" />;
  const [readSuccess, mutationSuccess, latencyP95, esiSuccess, queueStats, details] = fetched;
  const rows = deriveServiceLevels(
    { readSuccess, mutationSuccess, latencyP95, esiSuccess },
    summarizeQueue(queueStats, range.to),
  );
  return (
    <Card>
      <SectionHeader size="md" label="Service levels" />
      <ServiceLevelRows rows={rows} details={{ ...details, queue: queueStats }} />
    </Card>
  );
}

async function loadFailureDetail(
  range: DateRange,
  kind: 'read' | 'mutation',
  excluded: readonly string[],
): Promise<FailureDetail> {
  const [groups, daily, validationRejected] = await Promise.all([
    listCapabilityFailures(range, kind, excluded),
    listDailyCapabilityFailures(range, kind, excluded),
    excluded.includes('validation') ? countCapabilityOutcome(range, kind, 'validation') : undefined,
  ]);
  return { range, groups, daily, validationRejected };
}

async function loadServiceLevelDetails(range: DateRange): Promise<Omit<ServiceLevelDetails, 'queue'>> {
  const [read, mutation, slowest, esi, deadLetters] = await Promise.all([
    loadSection('sli-details.read', () => loadFailureDetail(range, 'read', [])),
    loadSection('sli-details.mutation', () => loadFailureDetail(range, 'mutation', MUTATION_EXCLUDED_OUTCOMES)),
    loadSection('sli-details.slowest', () => listSlowestOperations(range)),
    loadSection('sli-details.esi', () => listEsiFailures(range)),
    loadSection('sli-details.dead-letters', () => listDeadLetteredJobs(DEAD_LETTER_PREVIEW)),
  ]);
  return { read, mutation, slowest, esi, deadLetters };
}

export async function EventLogCard() {
  const fetched = await loadSection('recent-domain-events', () => listRecentDomainEvents(30));
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Event log" />;
  return (
    <Card>
      <SectionHeader size="md" label="Event log" />
      {fetched.length === 0 ? (
        <EmptyState>No operational events recorded yet.</EmptyState>
      ) : (
        <ol className={cn(scrollArea, 'max-h-[420px] overflow-y-auto')}>
          {fetched.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-0.5 border-b border-border-soft px-3.5 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="shrink-0 font-data text-micro tabular-nums text-muted sm:w-[140px]">
                {event.occurredAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
              </span>
              <span className="min-w-0 text-ui text-text">{summarizeDomainEvent(event)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
