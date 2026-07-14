import type { DeadLetterRow, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import type {
  CostlyEndpoint,
  HistorySourceSplit,
  PriceSourceSplit,
  WriteBehindOutcome,
} from '@/data/telemetry/cost-queries';
import type { DegradationCallerCount, FallbackRateData } from '@/data/telemetry/types';
import type { DomainEventRow } from '@/data/domain-events/types';
import { ESI_BUDGET_FLOOR } from '@/lib/esi';
import type { EsiBudgetSnapshot } from '@/lib/esi/scoreboard';

export interface OpsMetricRow {
  label: string;
  value: string;
  note: string;
}

function elapsedLabel(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function deriveBudgetView(snapshot: EsiBudgetSnapshot | null) {
  if (snapshot === null) {
    return {
      level: 'red' as const,
      headline: 'Scoreboard unavailable — ESI dispatch is failing closed.',
      metrics: [] as OpsMetricRow[],
    };
  }
  const belowFloor = snapshot.effectiveRemaining < ESI_BUDGET_FLOOR;
  return {
    level: belowFloor ? ('red' as const) : ('green' as const),
    headline: belowFloor
      ? `Below the ${ESI_BUDGET_FLOOR}-request dispatch floor.`
      : `At or above the ${ESI_BUDGET_FLOOR}-request dispatch floor.`,
    metrics: [
      {
        label: 'Effective remaining',
        value: snapshot.effectiveRemaining.toLocaleString(),
        note: 'the exact global value used by the gate',
      },
      {
        label: 'Observed non-2xx',
        value: snapshot.selfCount.toLocaleString(),
        note: 'conservative two-minute self-count',
      },
      {
        label: 'Lowest CCP echo',
        value: snapshot.echo?.toLocaleString() ?? '—',
        note: snapshot.echo === null ? 'no live header observed' : 'X-ESI-Error-Limit-Remain',
      },
      {
        label: 'Scoreboard source',
        value: snapshot.source === 'shared' ? 'shared' : 'process-local',
        note: snapshot.source === 'shared' ? 'Upstash Redis' : 'development fallback',
      },
    ],
  };
}

export function deriveQueueView(stats: EsiRefreshQueueStat[], now: Date) {
  const rows = stats.map((row) => ({
    status: row.status,
    label: row.status.replaceAll('_', ' '),
    count: row.count,
    oldestAge: elapsedLabel(row.oldestCreatedAt, now),
  }));
  const active = new Set(['queued', 'running', 'deferred_for_budget', 'failed_retryable']);
  return {
    rows,
    activeDepth: rows.reduce((total, row) => total + (active.has(row.status) ? row.count : 0), 0),
    empty: rows.length === 0,
  };
}

export function deriveDeadLetterView(rows: DeadLetterRow[]) {
  return rows.map((row) => ({
    id: row.id,
    title: `${row.dataset.replaceAll('_', ' ')} · ${row.ownerType} ${row.ownerId}`,
    endpointClass: row.resource,
    failureClass: row.lastErrorCode ?? row.budgetReason ?? 'unclassified',
    timing: row.finishedAt?.toISOString() ?? row.createdAt.toISOString(),
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
        label: 'Price requests',
        value: input.prices.requested.toLocaleString(),
        note: `${input.prices.returned.toLocaleString()} returned · ${input.prices.cacheHits.toLocaleString()} cache hits`,
      },
      {
        label: 'Live price sources',
        value: (input.prices.esiCount + input.prices.fuzzworkFallbackCount).toLocaleString(),
        note: `${input.prices.esiCount.toLocaleString()} ESI · ${input.prices.fuzzworkFallbackCount.toLocaleString()} Fuzzwork`,
      },
      {
        label: 'History served',
        value: historyServed.toLocaleString(),
        note: `${input.history.freshEsi.toLocaleString()} fresh · ${input.history.warmStored.toLocaleString()} warm`,
      },
      {
        label: 'Stale history returns',
        value: input.history.staleStored.toLocaleString(),
        note: `${input.history.missing.toLocaleString()} missing`,
      },
      {
        label: 'Budget exhaustions',
        value: input.budgetExhaustions.toLocaleString(),
        note: input.degradationByCaller.length === 0
          ? 'no price-source degradation rows'
          : input.degradationByCaller.map((row) => `${row.caller} ${row.count}`).join(' · '),
      },
      {
        label: 'Write-behind failures',
        value: writeBehindFailures.toLocaleString(),
        note: `${input.writeBehind.reduce((total, row) => total + row.count, 0).toLocaleString()} recorded outcomes`,
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
