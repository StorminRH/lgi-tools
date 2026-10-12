import { describe, expect, it } from 'vitest';
import {
  deriveEndpointBars,
  deriveOnDemandMetrics,
  summarizeDomainEvent,
} from './ops-view';

const NOW = new Date('2026-07-14T12:00:00Z');

describe('deriveOnDemandMetrics', () => {
  it('combines source, stale-return and write-behind reads', () => {
    const rows = deriveOnDemandMetrics({
      prices: { requested: 1_000, returned: 9, cacheHits: 1, esiCount: 6, fuzzworkFallbackCount: 1 },
      history: { freshEsi: 2, warmStored: 5, staleStored: 1, missing: 1 },
      writeBehind: [
        { action: 'market_price_write_behind', outcome: 'succeeded', count: 3 },
        { action: 'market_history_write_behind', outcome: 'failed', count: 2 },
      ],
      budgetExhaustions: 2,
    });
    expect(rows.map((row) => [row.label, row.value, row.note])).toEqual([
      ['Item prices requested', '1,000', '9 returned · 1 cache hit'],
      ['Freshly fetched item prices', '7', '6 ESI · 1 Fuzzwork'],
      ['Item histories returned', '8', '2 fetched · 5 stored'],
      ['Stale item histories', '1', '1 missing'],
      ['Budget-blocked refreshes', '2', 'scheduled + on-demand'],
      ['Background save failures', '2', '5 save attempts'],
    ]);
  });
});

describe('deriveEndpointBars', () => {
  it('labels each endpoint with its average time', () => {
    expect(deriveEndpointBars([{ endpoint: '/api/account/skills', count: 4, avgDurationMs: 1_312.6 }])).toEqual([
      { key: '/api/account/skills', label: '/api/account/skills · 1,313 ms avg', count: 4 },
    ]);
  });
});

describe('summarizeDomainEvent', () => {
  it('summarizes every closed event family without exposing stored metadata wholesale', () => {
    expect(summarizeDomainEvent({
      id: 1,
      occurredAt: NOW,
      eventType: 'eve_token_state_changed',
      metadata: {
        characterId: 90_000_001,
        from: 'usable',
        to: 'suspect',
        reason: 'invalid_grant',
      },
    })).toBe('Character 90000001 token usable → suspect (invalid_grant)');
  });
});
