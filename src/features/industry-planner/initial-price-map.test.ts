import { describe, expect, it } from 'vitest';
import { initialPriceMap } from './initial-price-map';
import type { BlueprintPricing, IntermediatePrice, MaterialCostRow } from './types';

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
    pct5Sell: null,
    staleAfterMs: null,
    buyDepth: null,
    sellDepth: null,
    regionalDiscount: null,
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
        rows: [row(999, { unitBuy: 7 })],
        product: {
          typeId: 999,
          bestSell: 50,
          pct5Sell: 55,
          buyDepth: depth,
          sellDepth: depth,
          staleAfterMs: 5,
        },
      }),
    );
    expect(map.get(999)).toMatchObject({
      bestBuy: 7,
      bestSell: 50,
      pct5Sell: 55,
      buyDepth: depth,
      sellDepth: depth,
      staleAfterMs: 5,
    });
  });

  it('a product with no prior row seeds bestBuy null', () => {
    const map = initialPriceMap(pricing({ product: { typeId: 999, bestSell: 50 } }));
    expect(map.get(999)).toMatchObject({ bestBuy: null, bestSell: 50 });
  });

  it('seeds exactly the price figures, and an intermediate wins over a material row of the same type', () => {
    const discount = { systemId: 30000142, price: 40, units: 3, pct: 80 };
    const map = initialPriceMap(
      pricing({
        rows: [
          row(34, { unitBuy: 4.5, bestSell: 5, pct5Buy: 4, sellVolume: 7, source: 'esi', staleAfterMs: 1 }),
          row(200, { unitBuy: 3, bestSell: 6, buyVolume: 11, source: 'fuzzwork', staleAfterMs: 2 }),
        ],
        intermediatePrices: [
          intermediate(200, { bestBuy: 9, bestSell: 10, pct5Sell: 12, source: 'esi', staleAfterMs: 3 }),
        ],
        product: { typeId: 999, bestSell: 50, pct5Sell: 55, staleAfterMs: 5, regionalDiscount: discount },
      }),
    );

    // No row column (typeId, name, quantity, unitBuy, extendedCost) reaches the map,
    // and rows and intermediates carry no regional discount.
    expect(map.get(34)).toStrictEqual({
      bestBuy: 4.5,
      bestSell: 5,
      pct5Buy: 4,
      pct5Sell: null,
      buyVolume: null,
      sellVolume: 7,
      buyDepth: null,
      sellDepth: null,
      source: 'esi',
      staleAfterMs: 1,
    });
    expect(map.get(200)).toStrictEqual({
      bestBuy: 9,
      bestSell: 10,
      pct5Buy: null,
      pct5Sell: 12,
      buyVolume: null,
      sellVolume: null,
      buyDepth: null,
      sellDepth: null,
      source: 'esi',
      staleAfterMs: 3,
    });
    expect(map.get(999)).toStrictEqual({
      bestBuy: null,
      bestSell: 50,
      pct5Buy: null,
      pct5Sell: 55,
      buyVolume: null,
      sellVolume: null,
      buyDepth: null,
      sellDepth: null,
      regionalDiscount: discount,
      source: null,
      staleAfterMs: 5,
    });
  });
});
