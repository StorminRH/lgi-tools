import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { scrollArea } from '@/components/ui/scroll-area';
import type { DomainEventRow } from '@/data/domain-events/types';
import { listDeadLetteredJobs } from '@/data/esi-refresh-jobs/queries';
import type { DeadLetterRow, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import {
  capabilityFailureDetail,
  esiFailureGroups,
  type CapabilityLatency,
  type CapabilityOutcomeStat,
} from '@/data/telemetry/capability-stats';
import type { DateRange } from '@/data/telemetry/types';
import { loadSection } from '../load-section';
import { summarizeDomainEvent } from '../ops-view';
import {
  getCapabilityLatencyShared,
  getCapabilityOutcomeStatsShared,
  getEsiRefreshQueueStatsShared,
} from '../shared-reads';
import { deriveSliSignals, mapLoaded, summarizeQueue, type Loaded } from '../signals';
import { deriveServiceLevels } from './health-view';
import { DEAD_LETTER_PREVIEW, type ServiceLevelDetails } from './ServiceLevelRows';

/**
 * The headline service levels and the detail behind each. Each detail read
 * fails on its own and marks only its own row; the queue read is the one
 * the rows cannot do without.
 */
export async function loadServiceLevels(range: DateRange) {
  const [outcomes, latency, queue, deadLetters] = await Promise.all([
    loadSection('capability-outcomes', () => getCapabilityOutcomeStatsShared(range)),
    loadSection('capability-latency', () => getCapabilityLatencyShared(range)),
    getEsiRefreshQueueStatsShared(),
    loadSection('sli-details.dead-letters', () => listDeadLetteredJobs(DEAD_LETTER_PREVIEW)),
  ]);
  return {
    rows: deriveServiceLevels(deriveSliSignals(outcomes, latency), summarizeQueue(queue, range.to)),
    details: serviceLevelDetails(range, { outcomes, latency, queue, deadLetters }),
  };
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

export function EventLog({ events }: { events: DomainEventRow[] }) {
  if (events.length === 0) return <EmptyState>No operational events recorded yet.</EmptyState>;
  return (
    <ol className={cn(scrollArea, 'max-h-[420px] overflow-y-auto')}>
      {events.map((event) => (
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
  );
}
