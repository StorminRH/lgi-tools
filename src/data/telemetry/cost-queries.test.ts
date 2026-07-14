import { beforeEach, describe, expect, it, vi } from 'vitest';

let cannedQueries: unknown[][] = [];

function queryFor(rows: unknown[]) {
  const result = Promise.resolve(rows);
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: result.then.bind(result),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.groupBy.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

vi.mock('@/db', () => ({
  db: {
    select: () => queryFor(cannedQueries.shift() ?? []),
  },
}));

import {
  getHistorySourceSplit,
  getPriceSourceSplit,
  getTopCostlyEndpoints,
  getWriteBehindOutcomes,
} from './cost-queries';

const RANGE = {
  from: new Date('2026-07-01T00:00:00Z'),
  to: new Date('2026-07-08T00:00:00Z'),
};

beforeEach(() => {
  cannedQueries = [];
});

describe('cost query result shaping', () => {
  it('normalizes the price and history source totals', async () => {
    cannedQueries = [
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
    cannedQueries = [[], []];
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
    cannedQueries = [
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
