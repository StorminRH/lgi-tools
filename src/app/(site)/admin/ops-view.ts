import type { DeadLetterRow } from '@/data/esi-refresh-jobs/types';
import type {
  CostlyEndpoint,
  HistorySourceSplit,
  PriceSourceSplit,
  WriteBehindOutcome,
} from '@/data/telemetry/queries';
import type { DomainEventRow } from '@/data/domain-events/types';
import { formatCount, formatQuantity } from '@/lib/format/number';
import { formatUtcMinute } from '@/lib/format/time';

export interface OpsMetricRow {
  label: string;
  value: string;
  note: string;
}

export function deriveDeadLetterView(rows: DeadLetterRow[]) {
  return rows.map((row) => ({
    id: row.id,
    title: `${row.dataset.replaceAll('_', ' ')} · ${row.ownerType} ${row.ownerId}`,
    endpointClass: row.resource,
    failureClass: row.lastErrorCode ?? row.budgetReason ?? 'unclassified',
    timing: formatUtcMinute(row.finishedAt ?? row.createdAt),
    attempts: row.attemptCount,
  }));
}

/** The on-demand price and history figures: what was asked for, served, and saved behind it. */
export function deriveOnDemandMetrics(input: {
  prices: PriceSourceSplit;
  history: HistorySourceSplit;
  writeBehind: WriteBehindOutcome[];
  budgetExhaustions: number;
}): OpsMetricRow[] {
  const historyServed =
    input.history.freshEsi + input.history.warmStored + input.history.staleStored;
  const writeBehindFailures = input.writeBehind
    .filter((row) => row.outcome !== 'succeeded')
    .reduce((total, row) => total + row.count, 0);
  const saveAttempts = input.writeBehind.reduce((total, row) => total + row.count, 0);
  return [
    {
      label: 'Item prices requested',
      value: formatQuantity(input.prices.requested),
      note: `${formatQuantity(input.prices.returned)} returned · ${formatCount(input.prices.cacheHits, 'cache hit')}`,
    },
    {
      label: 'Freshly fetched item prices',
      value: formatQuantity(input.prices.esiCount + input.prices.fuzzworkFallbackCount),
      note: `${formatQuantity(input.prices.esiCount)} ESI · ${formatQuantity(input.prices.fuzzworkFallbackCount)} Fuzzwork`,
    },
    {
      label: 'Item histories returned',
      value: formatQuantity(historyServed),
      note: `${formatQuantity(input.history.freshEsi)} fetched · ${formatQuantity(input.history.warmStored)} stored`,
    },
    {
      label: 'Stale item histories',
      value: formatQuantity(input.history.staleStored),
      note: `${formatQuantity(input.history.missing)} missing`,
    },
    {
      label: 'Budget-blocked refreshes',
      value: formatQuantity(input.budgetExhaustions),
      note: 'scheduled + on-demand',
    },
    {
      label: 'Background save failures',
      value: formatQuantity(writeBehindFailures),
      note: formatCount(saveAttempts, 'save attempt'),
    },
  ];
}

/** The busiest owned-data endpoints as bar rows, each labelled with its average time. */
export function deriveEndpointBars(endpoints: CostlyEndpoint[]) {
  return endpoints.map((row) => ({
    key: row.endpoint,
    label: `${row.endpoint} · ${formatQuantity(row.avgDurationMs)} ms avg`,
    count: row.count,
  }));
}

export function summarizeDomainEvent(event: DomainEventRow): string {
  switch (event.eventType) {
    case 'price_refresh_finished':
      return `Price refresh ${event.metadata.outcome}: ${event.metadata.written}/${event.metadata.fetched} rows written`;
    case 'esi_snapshot_pulled':
      return `Corporation asset snapshot ${event.metadata.snapshotId}: ${event.metadata.itemCount} items`;
    case 'eve_token_state_changed':
      return `Character ${event.metadata.characterId} token ${event.metadata.from} → ${event.metadata.to} (${event.metadata.reason})`;
    case 'esi_refresh_job_status_changed':
      return `Job ${event.metadata.jobId} ${event.metadata.dataset}: ${event.metadata.status}${event.metadata.failureCode ? ` (${event.metadata.failureCode})` : ''}`;
    case 'esi_budget_guard_exhausted':
      return `Public ESI budget exhausted ${event.metadata.count} times in ${event.metadata.windowMinutes}m`;
  }
}
