import { beforeEach, describe, expect, it, vi } from 'vitest';

// The queries read the `@/db` proxy via `select().from().where()` → rows. The
// fake resolves `.where()` to whatever each test stages in `cannedRows`.
let cannedRows: unknown[] = [];

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(cannedRows),
      }),
    }),
  },
}));

import {
  getAdjustedPrice,
  getAdjustedPrices,
  getSystemCostIndices,
  getSystemCostIndicesBatch,
} from './queries';

beforeEach(() => {
  cannedRows = [];
});

describe('getSystemCostIndicesBatch', () => {
  it('pivots flat rows into Map<systemId, Map<activity, index>>', async () => {
    cannedRows = [
      { solarSystemId: 30000142, activity: 'manufacturing', costIndex: 0.05 },
      { solarSystemId: 30000142, activity: 'reaction', costIndex: 0.06 },
      { solarSystemId: 30000144, activity: 'manufacturing', costIndex: 0.1 },
    ];
    const out = await getSystemCostIndicesBatch([30000142, 30000144]);
    expect(out.get(30000142)?.get('manufacturing')).toBe(0.05);
    expect(out.get(30000142)?.get('reaction')).toBe(0.06);
    expect(out.get(30000144)?.get('manufacturing')).toBe(0.1);
  });

  it('short-circuits empty input to an empty map', async () => {
    cannedRows = [{ solarSystemId: 1, activity: 'manufacturing', costIndex: 9 }];
    expect((await getSystemCostIndicesBatch([])).size).toBe(0);
  });
});

describe('getSystemCostIndices', () => {
  it('returns one system’s activity map, or an empty map when absent', async () => {
    cannedRows = [{ solarSystemId: 30000142, activity: 'manufacturing', costIndex: 0.05 }];
    expect((await getSystemCostIndices(30000142)).get('manufacturing')).toBe(0.05);

    cannedRows = [];
    expect((await getSystemCostIndices(99)).size).toBe(0);
  });
});

describe('getAdjustedPrices', () => {
  it('builds Map<typeId, price>, skipping NULL-priced rows', async () => {
    cannedRows = [
      { typeId: 34, adjustedPrice: 2.9 },
      { typeId: 41, adjustedPrice: 0 }, // a real 0.0 is kept
      { typeId: 99, adjustedPrice: null }, // absent → skipped
    ];
    const out = await getAdjustedPrices([34, 41, 99]);
    expect(out.get(34)).toBe(2.9);
    expect(out.get(41)).toBe(0);
    expect(out.has(99)).toBe(false);
  });
});

describe('getAdjustedPrice', () => {
  it('returns the price or null', async () => {
    cannedRows = [{ typeId: 34, adjustedPrice: 2.9 }];
    expect(await getAdjustedPrice(34)).toBe(2.9);

    cannedRows = [];
    expect(await getAdjustedPrice(99)).toBeNull();
  });
});
