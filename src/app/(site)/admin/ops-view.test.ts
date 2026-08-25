import { describe, expect, it } from 'vitest';
import {
  deriveBudgetView,
  deriveCostLensView,
  deriveDeadLetterView,
  deriveJobBacklog,
  deriveQueueView,
  deriveSliView,
  summarizeDomainEvent,
} from './ops-view';
import { SLI_DEFINITIONS, SLI_IDS } from '@/data/telemetry/sli';

const NOW = new Date('2026-07-14T12:00:00Z');

describe('deriveBudgetView', () => {
  it('surfaces a missing scoreboard as the fail-closed state', () => {
    expect(deriveBudgetView(null)).toMatchObject({
      level: 'red',
      headline: expect.stringContaining('failing closed'),
      metrics: [],
    });
  });

  it('uses the gate floor and labels a local snapshot honestly', () => {
    const view = deriveBudgetView({
      effectiveRemaining: 19,
      selfCount: 12,
      echo: 19,
      source: 'process-local',
    });
    expect(view.level).toBe('red');
    expect(view.metrics.at(-1)).toMatchObject({ value: 'process-local' });
  });
});

describe('deriveQueueView', () => {
  it('returns an empty view without inventing status rows', () => {
    expect(deriveQueueView([], NOW)).toEqual({ rows: [], activeDepth: 0, empty: true });
  });

  it('counts only live statuses and derives oldest age', () => {
    const view = deriveQueueView([
      { status: 'queued', count: 3, oldestCreatedAt: new Date('2026-07-14T10:00:00Z') },
      { status: 'dead_lettered', count: 2, oldestCreatedAt: new Date('2026-07-12T12:00:00Z') },
    ], NOW);
    expect(view.activeDepth).toBe(3);
    expect(view.rows.map((row) => row.oldestAge)).toEqual(['2h', '2d']);
  });
});

describe('deriveDeadLetterView', () => {
  it('exposes only classified context needed by the admin control', () => {
    expect(deriveDeadLetterView([{
      id: 7,
      dataset: 'owned_assets',
      ownerType: 'corporation',
      ownerId: 98_000_001,
      resource: '/corporations/{n}/assets',
      budgetReason: null,
      lastErrorCode: 'provider_5xx',
      attemptCount: 5,
      createdAt: NOW,
      finishedAt: NOW,
    }])).toEqual([{
      id: 7,
      title: 'owned assets · corporation 98000001',
      endpointClass: '/corporations/{n}/assets',
      failureClass: 'provider_5xx',
      timing: NOW.toISOString(),
      attempts: 5,
    }]);
  });
});

describe('deriveCostLensView', () => {
  it('combines source, stale-return, write-behind, and endpoint reads', () => {
    const view = deriveCostLensView({
      prices: { requested: 10, returned: 9, cacheHits: 2, esiCount: 6, fuzzworkFallbackCount: 1 },
      history: { freshEsi: 2, warmStored: 5, staleStored: 1, missing: 1 },
      writeBehind: [
        { action: 'market_price_write_behind', outcome: 'succeeded', count: 3 },
        { action: 'market_history_write_behind', outcome: 'failed', count: 2 },
      ],
      endpoints: [{ endpoint: '/api/account/skills', count: 4, avgDurationMs: 13 }],
      fallback: { esi: 90, fallback: 10, perDay: [] },
      budgetExhaustions: 2,
      degradationByCaller: [{ caller: 'cron', count: 1 }],
    });
    expect(view.metrics.find((row) => row.label === 'Stale history returns')?.value).toBe('1');
    expect(view.metrics.find((row) => row.label === 'Write-behind failures')?.value).toBe('2');
    expect(view.endpoints[0]).toMatchObject({ count: 4 });
  });
});

describe('summarizeDomainEvent', () => {
  it('summarizes every closed event family without exposing stored metadata wholesale', () => {
    expect(summarizeDomainEvent({
      id: 1,
      occurredAt: NOW,
      eventType: 'esi_budget_guard_exhausted',
      metadata: {
        count: 3,
        windowMinutes: 15,
        windowStartedAt: '2026-07-14T11:45:00Z',
        windowEndedAt: '2026-07-14T12:00:00Z',
      },
    })).toBe('Public ESI budget exhausted 3 times in 15m');
  });
});

describe('deriveSliView', () => {
  const values = {
    read_success_rate: 0.987_6,
    mutation_success_rate: 1,
    critical_latency_p95: 412.6,
    esi_success_rate: 0.5,
    job_backlog: { pending: 7, deadLettered: 2 },
  } as const;

  it('defines each indicator once and formats live, empty, and zero windows', () => {
    expect(SLI_DEFINITIONS.map((sli) => sli.id).toSorted()).toEqual([...SLI_IDS].toSorted());
    const rows = deriveSliView({ ...values });
    expect(rows.map((row) => row.id)).toEqual(SLI_DEFINITIONS.map((sli) => sli.id));
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.value]));
    expect(byId.read_success_rate).toBe('98.8%');
    expect(byId.mutation_success_rate).toBe('100.0%');
    expect(byId.critical_latency_p95).toBe('413 ms');
    expect(byId.esi_success_rate).toBe('50.0%');
    expect(byId.job_backlog).toBe('7 due · 2 dead');
    expect(rows.find((row) => row.id === 'esi_success_rate')?.owner).toBe('ccp-upstream');

    expect(
      deriveSliView({
        read_success_rate: null,
        mutation_success_rate: null,
        critical_latency_p95: null,
        esi_success_rate: null,
        job_backlog: null,
      }).map((row) => row.value),
    ).toEqual(['—', '—', '—', '—', '—']);
    expect(
      deriveSliView({ ...values, read_success_rate: 0 }).find((row) => row.id === 'read_success_rate')
        ?.value,
    ).toBe('0.0%');
  });
});

describe('deriveJobBacklog', () => {
  const stat = (status: string, count: number) => ({
    status: status as never,
    count,
    oldestCreatedAt: NOW,
  });

  it('counts every live status as backlog and dead letters separately', () => {
    expect(
      deriveJobBacklog([
        stat('queued', 4),
        stat('running', 1),
        stat('deferred_for_budget', 2),
        stat('failed_retryable', 3),
        stat('dead_lettered', 5),
        stat('succeeded', 900),
        stat('failed_permanent', 7),
      ]),
    ).toEqual({ pending: 10, deadLettered: 5 });
  });

  it('reports zeroes for an empty queue', () => {
    expect(deriveJobBacklog([])).toEqual({ pending: 0, deadLettered: 0 });
  });

  it('excludes terminal statuses from the backlog', () => {
    // A succeeded or permanently failed job is finished work, not a backlog.
    expect(deriveJobBacklog([stat('succeeded', 50), stat('failed_permanent', 3)])).toEqual({
      pending: 0,
      deadLettered: 0,
    });
  });
});
