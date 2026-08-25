import { describe, expect, it } from 'vitest';
import { refreshPricesRequestSchema, wirePriceSchema } from './api-contract';

describe('market-prices contract', () => {
  it('accepts a bounded typeId batch', () => {
    expect(refreshPricesRequestSchema.safeParse({ typeIds: [34, 35, 36] }).success).toBe(true);
  });

  it('rejects an empty batch and non-positive ids', () => {
    expect(refreshPricesRequestSchema.safeParse({ typeIds: [] }).success).toBe(false);
    expect(refreshPricesRequestSchema.safeParse({ typeIds: [0] }).success).toBe(false);
  });

  it('accepts a priced row with regionalDiscount ABSENT — a payload cached pre-3.7.26.1 (the #203 lesson)', () => {
    const preReleaseRow = {
      typeId: 34,
      bestBuy: 5.2,
      bestSell: 5.5,
      pct5Buy: 5.0,
      pct5Sell: 5.8,
      buyVolume: '1000',
      sellVolume: '2000',
      buyDepth: null,
      sellDepth: null,
      updatedAt: '2026-07-01T00:00:00.000Z',
      staleAfter: '2026-07-02T00:00:00.000Z',
      source: 'esi',
      // no regionalDiscount key at all
    };
    const parsed = wirePriceSchema.safeParse(preReleaseRow);
    expect(parsed.success).toBe(true);

    // And a populated one round-trips.
    expect(
      wirePriceSchema.safeParse({
        ...preReleaseRow,
        regionalDiscount: { systemId: 30000143, price: 28000, units: 19, pct: 89.02 },
      }).success,
    ).toBe(true);
  });
});
