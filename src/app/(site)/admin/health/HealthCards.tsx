import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { scrollArea } from '@/components/ui/scroll-area';
import { SectionHeader } from '@/components/ui/section-header';
import { listRecentDomainEvents } from '@/data/domain-events/queries';
import { listDeadLetteredJobs } from '@/data/esi-refresh-jobs/queries';
import type { DeadLetterRow, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import {
  capabilityFailureDetail,
  esiFailureGroups,
  type CapabilityLatency,
  type CapabilityOutcomeStat,
} from '@/data/telemetry/capability-stats';
import type { DateRange } from '@/data/telemetry/types';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { summarizeDomainEvent } from '../ops-view';
import {
  getCapabilityLatencyShared,
  getCapabilityOutcomeStatsShared,
  getEsiRefreshQueueStatsShared,
} from '../shared-reads';
import { SectionUnavailable } from '../SectionUnavailable';
import { deriveSliSignals, mapLoaded, summarizeQueue, type Loaded } from '../signals';
import { deriveServiceLevels } from './health-view';
import { DEAD_LETTER_PREVIEW, ServiceLevelRows, type ServiceLevelDetails } from './ServiceLevelRows';

export async function ServiceLevelsCard({ range }: { range: DateRange }) {
  const fetched = await loadSection('service-levels', () =>
    Promise.all([
      loadSection('capability-outcomes', () => getCapabilityOutcomeStatsShared(range)),
      loadSection('capability-latency', () => getCapabilityLatencyShared(range)),
      getEsiRefreshQueueStatsShared(),
      loadSection('sli-details.dead-letters', () => listDeadLetteredJobs(DEAD_LETTER_PREVIEW)),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Service levels" />;
  const [outcomes, latency, queue, deadLetters] = fetched;
  const rows = deriveServiceLevels(deriveSliSignals(outcomes, latency), summarizeQueue(queue, range.to));
  return (
    <Card>
      <SectionHeader size="md" label="Service levels" />
      <ServiceLevelRows rows={rows} details={serviceLevelDetails(range, { outcomes, latency, queue, deadLetters })} />
    </Card>
  );
}

function serviceLevelDetails(
  range: DateRange,
  reads: {
    outcomes: Loaded<CapabilityOutcomeStat[]>;
    latency: Loaded<CapabilityLatency>;
    queue: EsiRefreshQueueStat[];
    deadLetters: Loaded<DeadLetterRow[]>;
  },
): ServiceLevelDetails {
  return {
    now: range.to,
    read: mapLoaded(reads.outcomes, (stats) => ({ range, ...capabilityFailureDetail(stats, 'read', range) })),
    mutation: mapLoaded(reads.outcomes, (stats) => ({ range, ...capabilityFailureDetail(stats, 'mutation', range) })),
    slowest: mapLoaded(reads.latency, (latency) => latency.slowest),
    esi: mapLoaded(reads.outcomes, (stats) => esiFailureGroups(stats, range)),
    queue: reads.queue,
    deadLetters: reads.deadLetters,
  };
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
