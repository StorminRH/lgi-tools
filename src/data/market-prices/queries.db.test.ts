import { describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { BATCH_REFRESH_INTERVAL_MS, BATCH_REFRESH_LEAD_MS } from './constants';
import { getPrices, listStaleTypeIds } from './queries';
import { persistPrices } from './ingest';
import type { RawMarketPrice } from './types';
import { marketPrices } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_market_prices_stale',
  tables: ['market_prices'],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('listStaleTypeIds executes against Postgres', () => {
  it('selects daily backstop rows independently of the five-minute viewing expiry', async () => {
    const now = Date.now();
    const row = (typeId: number, fetchedAtMs: number, placeholder = false) => ({
      typeId,
      updatedAt: new Date(fetchedAtMs),
      staleAfter: new Date(placeholder ? 0 : fetchedAtMs + 300_000),
      source: 'esi' as const,
    });
    await harness.db.insert(marketPrices).values([
      row(34, now - BATCH_REFRESH_INTERVAL_MS),
      row(35, now - BATCH_REFRESH_INTERVAL_MS + BATCH_REFRESH_LEAD_MS - 60_000),
      row(36, now - 60 * 60_000),
      row(37, now, true),
    ]);

    expect((await listStaleTypeIds(harness.db)).sort()).toEqual([34, 35, 37]);
  });

  it('preserves fetch timestamps and rejects a delayed write older than the current price', async () => {
    const raw: RawMarketPrice = {
      typeId: 34, bestBuy: 10, bestSell: 12, pct5Buy: 10, pct5Sell: 12,
      buyVolume: BigInt(1), sellVolume: BigInt(1), buyDepth: null, sellDepth: null,
      regionalDiscount: null, source: 'esi',
    };
    const fetchedAt = new Date(Date.now() - 60_000);
    const recent = await persistPrices(harness.db, [raw], {
      fetchedAtByType: new Map([[34, fetchedAt]]),
    });
    expect(recent.written).toBe(1);
    const delayed = await persistPrices(harness.db, [{ ...raw, bestSell: 1 }], {
      fetchedAtByType: new Map([[34, new Date(fetchedAt.getTime() - 60_000)]]),
    });
    expect(delayed.written).toBe(0);
    const saved = (await getPrices([34])).get(34)!;
    expect(saved.bestSell).toBe(12);
    expect(saved.updatedAt).toEqual(fetchedAt);
    expect(saved.staleAfter.getTime()).toBe(fetchedAt.getTime() + 300_000);
  });

});
