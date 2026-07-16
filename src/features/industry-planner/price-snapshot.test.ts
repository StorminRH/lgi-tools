import type { RefreshedPrice } from '@/data/market-prices/use-refresh-on-view';
import { describe, expect, it } from 'vitest';
import { createPriceSnapshot } from './price-snapshot';
import type { BlueprintPricing, MaterialCostRow } from './types';

function row(typeId: number, unitBuy: number): MaterialCostRow {
  return {
    typeId,
    name: `Type ${typeId}`,
    quantity: 1,
    unitBuy,
    extendedCost: unitBuy,
    bestSell: unitBuy + 1,
    pct5Buy: unitBuy,
    pct5Sell: unitBuy + 1,
    buyVolume: 10,
    sellVolume: 20,
    source: 'esi',
    staleAfterMs: 1,
  };
}

function pricing(rows: MaterialCostRow[] = []): BlueprintPricing {
  return {
    rows,
    intermediatePrices: [],
    product: {
      typeId: 999,
      name: 'Product',
      quantityPerRun: 1,
      bestSell: 100,
      pct5Sell: 101,
      staleAfterMs: 1,
      buyDepth: null,
      sellDepth: null,
      regionalDiscount: null,
    },
    summary: {
      basis: 'marginal',
      bases: { batched: 0, marginal: 0 },
      inputCost: 0,
      revenue: 100,
      margin: 100,
      marginPct: 100,
      incomplete: false,
    },
    net: null,
  };
}

function live(typeId: number, bestBuy: number): RefreshedPrice {
  return {
    typeId,
    bestBuy,
    bestSell: bestBuy + 1,
    pct5Buy: bestBuy,
    pct5Sell: bestBuy + 1,
    buyVolume: 30,
    sellVolume: 40,
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
    source: 'esi',
    staleAfterMs: 2,
  };
}

describe('createPriceSnapshot', () => {
  it('captures and adopts the first streamed seed only', () => {
    const snapshot = createPriceSnapshot();
    const first = pricing([row(34, 4)]);
    const later = pricing([row(35, 5)]);

    const firstSettlement = snapshot.seed(first);
    const laterSettlement = snapshot.seed(later);

    expect(firstSettlement.seeded).toBe(true);
    expect(firstSettlement.settle(null)).toBe(first);
    expect(laterSettlement.settle(null)).toBe(first);
    expect(snapshot.lookup(34)?.bestBuy).toBe(4);
    expect(snapshot.lookup(35)).toBeUndefined();
  });

  it('does not let a late seed clobber an already advanced reactive snapshot', () => {
    const snapshot = createPriceSnapshot();
    const initial = pricing([row(34, 4)]);
    const advanced = pricing([row(34, 8)]);

    expect(snapshot.seed(initial).settle(advanced)).toBe(advanced);
  });

  it('settles a null seed as unavailable instead of leaving loading unresolved', () => {
    const settlement = createPriceSnapshot().seed(null);

    expect(settlement.seeded).toBe(true);
    expect(settlement.settle(null)).toBeNull();
  });

  it('prefers live rows while preserving the seed for unrefreshed types', () => {
    const snapshot = createPriceSnapshot();
    snapshot.seed(pricing([row(34, 4), row(35, 5)]));
    snapshot.applyBatch(new Map([[34, live(34, 40)]]));

    expect(snapshot.lookup(34)?.bestBuy).toBe(40);
    expect(snapshot.lookup(35)?.bestBuy).toBe(5);
  });

  it('replaces the live map because each refresh callback is cumulative', () => {
    const snapshot = createPriceSnapshot();
    snapshot.seed(pricing([row(34, 4)]));
    snapshot.applyBatch(new Map([[34, live(34, 40)]]));
    snapshot.applyBatch(new Map([[35, live(35, 50)]]));

    expect(snapshot.lookup(34)?.bestBuy).toBe(4);
    expect(snapshot.lookup(35)?.bestBuy).toBe(50);
  });

  it('keeps a stable lookup that reads batches applied after the refresh loop starts', () => {
    const snapshot = createPriceSnapshot();
    const lookup = snapshot.lookup;
    snapshot.seed(pricing([row(34, 4)]));
    snapshot.applyBatch(new Map([[34, live(34, 40)]]));

    expect(lookup(34)?.bestBuy).toBe(40);
  });
});
