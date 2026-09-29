import { expect, test, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';

const mocks = vi.hoisted(() => ({ cacheTag: vi.fn() }));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: mocks.cacheTag,
}));

import { getMarketHistoryInputs } from './queries';
import { marketHistory } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_market_history_queries',
  tables: ['market_history'],
  steerDbProxy: true,
});

const day = (typeId: number, date: string, average: number, volume: bigint) => ({
  typeId,
  date,
  average,
  highest: average + 1,
  lowest: average - 1,
  volume,
  orderCount: 10,
});

test.skipIf(!harness.reachable)(
  'derives history inputs for types with stored days and tags every requested type',
  async () => {
    await harness.db.insert(marketHistory).values([
      day(34, '2026-09-26', 5, 300n),
      day(34, '2026-09-24', 5, 100n),
      day(34, '2026-09-25', 5, 200n),
      day(36, '2026-08-01', 50, 7n),
    ]);

    const inputs = await getMarketHistoryInputs([35, 34]);

    // Type 35 has no stored days, so it is skipped instead of reported empty;
    // type 36 was stored but not requested.
    expect(inputs).toEqual([
      {
        typeId: 34,
        averageDailyVolume: [
          { days: 7, adv: 600 / 7 },
          { days: 30, adv: 20 },
          { days: 90, adv: 600 / 90 },
        ],
        volumeCv: Math.sqrt((80 ** 2 + 180 ** 2 + 280 ** 2 + 27 * 20 ** 2) / 30) / 20,
        priceVolatility: 0,
        daysCovered: 3,
        latestDate: '2026-09-26',
      },
    ]);
    expect(mocks.cacheTag.mock.calls).toEqual([['market-history-35'], ['market-history-34']]);

    await expect(getMarketHistoryInputs([])).resolves.toEqual([]);
  },
);
