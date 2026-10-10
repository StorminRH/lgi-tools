import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state, reset } = await vi.hoisted(async () => {
  const { createFakeQueryChain } = await import('@/db/__tests__/support/fake-query-chain');
  return createFakeQueryChain();
});

vi.mock('@/db', () => ({ db: chain }));

import {
  getHistorySourceSplit,
  getPriceSourceSplit,
  getTopCostlyEndpoints,
  getWriteBehindOutcomes,
} from './queries';

const RANGE = {
  from: new Date('2026-07-01T00:00:00Z'),
  to: new Date('2026-07-08T00:00:00Z'),
};

beforeEach(() => {
  reset();
});

describe('cost query result shaping', () => {
  it('normalizes the price and history source totals', async () => {
    state.results = [
      [{ cacheHits: '2', esiCount: '7', fuzzworkFallbackCount: '1', requested: '12', returned: '10' }],
      [{ freshEsi: '3', warmStored: '8', staleStored: '2', missing: '1' }],
    ];

    await expect(getPriceSourceSplit(RANGE)).resolves.toEqual({
      cacheHits: 2,
      esiCount: 7,
      fuzzworkFallbackCount: 1,
      requested: 12,
      returned: 10,
    });
    await expect(getHistorySourceSplit(RANGE)).resolves.toEqual({
      freshEsi: 3,
      warmStored: 8,
      staleStored: 2,
      missing: 1,
    });
  });

  it('returns zero totals for empty source windows', async () => {
    state.results = [[], []];
    await expect(getPriceSourceSplit(RANGE)).resolves.toEqual({
      cacheHits: 0,
      esiCount: 0,
      fuzzworkFallbackCount: 0,
      requested: 0,
      returned: 0,
    });
    await expect(getHistorySourceSplit(RANGE)).resolves.toEqual({
      freshEsi: 0,
      warmStored: 0,
      staleStored: 0,
      missing: 0,
    });
  });

  it('normalizes write-behind and endpoint rows', async () => {
    state.results = [
      [{ action: 'market_price_write_behind', outcome: 'failed', count: '2' }],
      [{ endpoint: '/api/account/skills', count: '4', avgDurationMs: '12.6' }],
    ];
    await expect(getWriteBehindOutcomes(RANGE)).resolves.toEqual([
      { action: 'market_price_write_behind', outcome: 'failed', count: 2 },
    ]);
    await expect(getTopCostlyEndpoints(RANGE, 5)).resolves.toEqual([
      { endpoint: '/api/account/skills', count: 4, avgDurationMs: 13 },
    ]);
  });
});
