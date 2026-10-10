import { isNotNull } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { seedPlaceholderPrices } from './ingest';
import { marketPrices } from './schema';

vi.mock('./source', () => ({ fetchPricesFromSource: vi.fn() }));

const harness = await createDbTestHarness({
  schema: 'test_market_prices_seed',
  tables: ['market_prices'],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('seedPlaceholderPrices executes against Postgres', () => {
  it('inserts NULL-priced, epoch-stale rows and leaves priced rows untouched', async () => {
    await harness.db.insert(marketPrices).values({
      typeId: 34,
      bestBuy: 3.9,
      bestSell: 4.1,
      pct5Buy: 3.95,
      pct5Sell: 4.05,
      updatedAt: new Date('2026-09-27T00:00:00Z'),
      staleAfter: new Date('2026-09-28T00:00:00Z'),
      source: 'esi',
    });

    expect(await seedPlaceholderPrices(harness.db, [34, 29984, 10217])).toBe(2);
    expect(await seedPlaceholderPrices(harness.db, [29984])).toBe(0);
    expect(await seedPlaceholderPrices(harness.db, [])).toBe(0);

    const rows = await harness.db.select().from(marketPrices).orderBy(marketPrices.typeId);
    expect(rows.map((row) => [row.typeId, row.pct5Buy, row.staleAfter.getTime(), row.source])).toEqual([
      [34, 3.95, Date.parse('2026-09-28T00:00:00Z'), 'esi'],
      [10217, null, 0, 'esi'],
      [29984, null, 0, 'esi'],
    ]);
  });

  it('seeds more ids than one statement can bind, counting only rows it inserted in every batch', async () => {
    const priced = (typeId: number) => ({
      typeId,
      bestSell: 4.1,
      updatedAt: new Date('2026-09-27T00:00:00Z'),
      staleAfter: new Date('2026-09-28T00:00:00Z'),
      source: 'fuzzwork',
    });
    await harness.db.insert(marketPrices).values([priced(1), priced(8_500), priced(16_500)]);
    // Four binds per row: one INSERT of 16,500 rows would need 66,000 parameters, past the 65,535 cap.
    const typeIds = Object.freeze(Array.from({ length: 16_500 }, (_, index) => index + 1));

    expect(await seedPlaceholderPrices(harness.db, typeIds)).toBe(16_497);

    expect(await harness.db.$count(marketPrices)).toBe(16_500);
    expect(
      await harness.db
        .select({ typeId: marketPrices.typeId, bestSell: marketPrices.bestSell, source: marketPrices.source })
        .from(marketPrices)
        .where(isNotNull(marketPrices.bestSell))
        .orderBy(marketPrices.typeId),
    ).toEqual([
      { typeId: 1, bestSell: 4.1, source: 'fuzzwork' },
      { typeId: 8_500, bestSell: 4.1, source: 'fuzzwork' },
      { typeId: 16_500, bestSell: 4.1, source: 'fuzzwork' },
    ]);
  });
});
