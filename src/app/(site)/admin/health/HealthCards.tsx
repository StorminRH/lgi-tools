import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { scrollArea } from '@/components/ui/scroll-area';
import type { DomainEventRow } from '@/data/domain-events/types';
import {
  capabilityFailureDetail,
  esiClientErrors,
  esiFailureGroups,
  type EsiClientErrorGroup,
} from '@/data/telemetry/capability-stats';
import type { DateRange } from '@/data/telemetry/types';
import { loadSection } from '../load-section';
import { loadSliReads } from '../load-signals';
import { summarizeDomainEvent } from '../ops-view';
import { getEsiClientErrorsShared } from '../shared-reads';
import { deriveSliSignals, mapLoaded, type Loaded, type SliReads } from '../signals';
import { deriveServiceLevels } from './health-view';
import type { ServiceLevelDetails } from './ServiceLevelRows';
import { formatUtcMinute } from '@/lib/format/time';

/**
 * The headline service levels and the detail behind each. Each detail read
 * fails on its own and marks only its own row.
 */
export async function loadServiceLevels(range: DateRange) {
  const [sliReads, clientErrors] = await Promise.all([
    loadSliReads(range),
    loadSection('sli-details.esi-4xx', () => getEsiClientErrorsShared(range)),
  ]);
  return {
    rows: deriveServiceLevels(deriveSliSignals(sliReads)),
    details: serviceLevelDetails(range, { ...sliReads, clientErrors }),
  };
}

function serviceLevelDetails(
  range: DateRange,
  reads: SliReads & { clientErrors: Loaded<EsiClientErrorGroup[]> },
): ServiceLevelDetails {
  return {
    read: mapLoaded(reads.outcomes, (stats) => ({ range, ...capabilityFailureDetail(stats, 'read', range) })),
    mutation: mapLoaded(reads.outcomes, (stats) => ({ range, ...capabilityFailureDetail(stats, 'mutation', range) })),
    slowest: mapLoaded(reads.latency, (latency) => latency.slowest),
    esi: mapLoaded(reads.outcomes, (stats) => esiFailureGroups(stats, range)),
    esiClientErrors: mapLoaded(reads.clientErrors, esiClientErrors),
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
            {formatUtcMinute(event.occurredAt)}
          </span>
          <span className="min-w-0 text-ui text-text">{summarizeDomainEvent(event)}</span>
        </li>
      ))}
    </ol>
  );
}
