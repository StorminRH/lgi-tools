import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { BATCH_REFRESH_LEAD_MS } from './constants';
import { listStaleTypeIds } from './queries';
import { marketPrices } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_market_prices_stale',
  tables: ['market_prices'],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('listStaleTypeIds executes against Postgres', () => {
  it('includes prices expiring within the batch lead so the daily run never skips a day', async () => {
    const now = Date.now();
    const row = (typeId: number, staleAfterMs: number) => ({
      typeId,
      updatedAt: new Date(now),
      staleAfter: new Date(staleAfterMs),
      source: 'esi',
    });
    await harness.db.insert(marketPrices).values([
      row(34, now - 60_000),
      row(35, now + 5 * 60_000),
      row(36, now + BATCH_REFRESH_LEAD_MS + 60 * 60_000),
    ]);

    expect((await listStaleTypeIds(harness.db)).sort()).toEqual([34, 35]);
  });
});
