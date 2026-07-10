import { describe, expect, it } from 'vitest';
import { initialPriceMap } from './initial-price-map';
import type { BlueprintPricing, IntermediatePrice, MaterialCostRow } from './types';

// Minimal snapshot builders — only the fields the seed map reads vary per test.
const row = (typeId: number, over: Partial<MaterialCostRow> = {}): MaterialCostRow => ({
  typeId,
  name: `Type ${typeId}`,
  quantity: 1,
  unitBuy: null,
  extendedCost: null,
  bestSell: null,
  pct5Buy: null,
  pct5Sell: null,
  buyVolume: null,
  sellVolume: null,
  source: null,
  staleAfterMs: null,
  ...over,
});

const intermediate = (typeId: number, over: Partial<IntermediatePrice> = {}): IntermediatePrice => ({
  typeId,
  bestBuy: null,
  bestSell: null,
  pct5Buy: null,
  pct5Sell: null,
  buyVolume: null,
  sellVolume: null,
  source: null,
  staleAfterMs: null,
  ...over,
});

const pricing = (over: {
  rows?: MaterialCostRow[];
  intermediatePrices?: IntermediatePrice[];
  product?: Partial<BlueprintPricing['product']>;
}): BlueprintPricing => ({
  rows: over.rows ?? [],
  intermediatePrices: over.intermediatePrices ?? [],
  product: {
    typeId: 999,
    name: 'Product',
    quantityPerRun: 1,
    bestSell: null,
    staleAfterMs: null,
    buyDepth: null,
    sellDepth: null,
    ...over.product,
  },
  summary: {
    basis: 'marginal',
    bases: { batched: 0, marginal: 0 },
    inputCost: 0,
    revenue: null,
    margin: null,
    marginPct: null,
    incomplete: true,
  },
  net: null,
});

describe('initialPriceMap — the client seed from the server snapshot', () => {
  it('seeds raw rows with unitBuy as bestBuy and null depth ladders', () => {
    const map = initialPriceMap(
      pricing({ rows: [row(34, { unitBuy: 4.5, bestSell: 5, buyVolume: 10, staleAfterMs: 123 })] }),
    );
    expect(map.get(34)).toMatchObject({
      bestBuy: 4.5,
      bestSell: 5,
      buyVolume: 10,
      buyDepth: null,
      sellDepth: null,
      staleAfterMs: 123,
    });
  });

  it('seeds intermediates with their own bestBuy (a real buy quote, not unitBuy)', () => {
    const map = initialPriceMap(
      pricing({ intermediatePrices: [intermediate(200, { bestBuy: 9, sellVolume: 3 })] }),
    );
    expect(map.get(200)).toMatchObject({ bestBuy: 9, sellVolume: 3, buyDepth: null });
  });

  it('the product entry carries its sell + depth ladders, keeping any bestBuy already seeded', () => {
    const depth = [{ pct: 1, cumVolume: 2 }];
    const map = initialPriceMap(
      pricing({
        rows: [row(999, { unitBuy: 7 })], // self-recipe shape: the product also appears as a row
        product: { typeId: 999, bestSell: 50, buyDepth: depth, sellDepth: depth, staleAfterMs: 5 },
      }),
    );
    expect(map.get(999)).toMatchObject({
      bestBuy: 7, // preserved from the row seed
      bestSell: 50,
      buyDepth: depth,
      sellDepth: depth,
      staleAfterMs: 5,
    });
  });

  it('a product with no prior row seeds bestBuy null', () => {
    const map = initialPriceMap(pricing({ product: { typeId: 999, bestSell: 50 } }));
    expect(map.get(999)).toMatchObject({ bestBuy: null, bestSell: 50 });
  });
});
