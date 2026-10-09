import { describe, expect, it } from 'vitest';
import {
  deriveCostLensView,
  deriveDeadLetterView,
  summarizeDomainEvent,
} from './ops-view';

const NOW = new Date('2026-07-14T12:00:00Z');

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
      timing: '2026-07-14 12:00 UTC',
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
    expect(view.metrics.find((row) => row.label === 'Stale item histories')?.value).toBe('1');
    expect(view.metrics.find((row) => row.label === 'Background save failures')?.value).toBe('2');
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
