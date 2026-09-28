import type { DeadLetterRow } from '@/data/esi-refresh-jobs/types';
import type {
  CostlyEndpoint,
  HistorySourceSplit,
  PriceSourceSplit,
  WriteBehindOutcome,
} from '@/data/telemetry/queries';
import type { DegradationCallerCount, FallbackRateData } from '@/data/telemetry/types';
import type { DomainEventRow } from '@/data/domain-events/types';
import { ESI_BUDGET_FLOOR } from '@/platform/esi';
import type { EsiBudgetSnapshot } from '@/platform/esi/scoreboard';

export interface OpsMetricRow {
  label: string;
  value: string;
  note: string;
}

export function deriveBudgetView(snapshot: EsiBudgetSnapshot | null) {
  if (snapshot === null) {
    return {
      level: 'red' as const,
      headline: 'Scoreboard unavailable · dispatch paused',
      metrics: [] as OpsMetricRow[],
    };
  }
  const belowFloor = snapshot.effectiveRemaining < ESI_BUDGET_FLOOR;
  return {
    level: belowFloor ? ('red' as const) : ('green' as const),
    headline: belowFloor
      ? `floor ${ESI_BUDGET_FLOOR} · dispatch paused`
      : `floor ${ESI_BUDGET_FLOOR}`,
    metrics: [
      {
        label: 'Effective remaining',
        value: snapshot.effectiveRemaining.toLocaleString(),
        note: '',
      },
      {
        label: 'Observed HTTP errors',
        value: snapshot.selfCount.toLocaleString(),
        note: '4xx/5xx · last 2 min',
      },
      {
        label: 'Lowest recent CCP allowance',
        value: snapshot.echo?.toLocaleString() ?? '—',
        note: snapshot.echo === null ? 'not observed' : 'CCP response header',
      },
      {
        label: 'Scoreboard source',
        value: snapshot.source === 'shared' ? 'shared' : 'process-local',
        note: snapshot.source === 'shared' ? 'Upstash Redis' : 'development fallback',
      },
    ],
  };
}

export function deriveDeadLetterView(rows: DeadLetterRow[]) {
  return rows.map((row) => ({
    id: row.id,
    title: `${row.dataset.replaceAll('_', ' ')} · ${row.ownerType} ${row.ownerId}`,
    endpointClass: row.resource,
    failureClass: row.lastErrorCode ?? row.budgetReason ?? 'unclassified',
    timing: `${(row.finishedAt ?? row.createdAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    attempts: row.attemptCount,
  }));
}

export function deriveCostLensView(input: {
  prices: PriceSourceSplit;
  history: HistorySourceSplit;
  writeBehind: WriteBehindOutcome[];
  endpoints: CostlyEndpoint[];
  fallback: FallbackRateData;
  budgetExhaustions: number;
  degradationByCaller: DegradationCallerCount[];
}) {
  const historyServed =
    input.history.freshEsi + input.history.warmStored + input.history.staleStored;
  const writeBehindFailures = input.writeBehind
    .filter((row) => row.outcome !== 'succeeded')
    .reduce((total, row) => total + row.count, 0);
  return {
    metrics: [
      {
        label: 'Item prices requested',
        value: input.prices.requested.toLocaleString(),
        note: `${input.prices.returned.toLocaleString()} returned · ${input.prices.cacheHits.toLocaleString()} cache hits`,
      },
      {
        label: 'Freshly fetched item prices',
        value: (input.prices.esiCount + input.prices.fuzzworkFallbackCount).toLocaleString(),
        note: `${input.prices.esiCount.toLocaleString()} ESI · ${input.prices.fuzzworkFallbackCount.toLocaleString()} Fuzzwork`,
      },
      {
        label: 'Item histories returned',
        value: historyServed.toLocaleString(),
        note: `${input.history.freshEsi.toLocaleString()} fetched · ${input.history.warmStored.toLocaleString()} stored`,
      },
      {
        label: 'Stale item histories',
        value: input.history.staleStored.toLocaleString(),
        note: `${input.history.missing.toLocaleString()} missing`,
      },
      {
        label: 'Budget-blocked refreshes',
        value: input.budgetExhaustions.toLocaleString(),
        note: 'scheduled + on-demand',
      },
      {
        label: 'Background save failures',
        value: writeBehindFailures.toLocaleString(),
        note: `${input.writeBehind.reduce((total, row) => total + row.count, 0).toLocaleString()} save attempts`,
      },
    ] satisfies OpsMetricRow[],
    endpoints: input.endpoints.map((row) => ({
      key: row.endpoint,
      label: `${row.endpoint} · ${row.avgDurationMs.toLocaleString()} ms avg`,
      count: row.count,
    })),
    fallback: {
      esi: input.fallback.esi,
      fuzzwork: input.fallback.fallback,
    },
  };
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
