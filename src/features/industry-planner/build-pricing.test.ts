import { describe, expect, it } from 'vitest';
import { assemblePricing, type PriceLite } from './build-pricing';
import type { BlueprintStructure } from './types';

// A minimal two-material structure — enough to exercise the select+carry of
// source + volume onto each MaterialCostRow (the math itself is covered by
// industry-math/profitability.test.ts).
const STRUCTURE: BlueprintStructure = {
  blueprintTypeId: 1,
  activityId: 1,
  product: { typeId: 999, name: 'Widget', quantityPerRun: 1 },
  tree: [],
  buildTree: [],
  buildNodeDisplay: {},
  rootHeight: 1,
  flatMaterials: [
    { typeId: 34, quantity: 100 },
    { typeId: 35, quantity: 50 },
  ],
  materialCategory: {},
  materialCategories: [],
  materialNames: { 34: 'Tritanium', 35: 'Pyerite', 999: 'Widget' },
};

const PRICES: Record<number, PriceLite> = {
  34: {
    bestBuy: 5,
    bestSell: 6,
    pct5Buy: 4,
    pct5Sell: 7,
    buyVolume: 8_200,
    sellVolume: 1_200,
    source: 'esi',
    staleAfterMs: 1_700_000_000_000,
  },
  35: {
    bestBuy: 3,
    bestSell: 4,
    pct5Buy: 2,
    pct5Sell: 5,
    buyVolume: 90,
    sellVolume: null,
    source: 'fuzzwork-fallback',
    staleAfterMs: 1_699_000_000_000,
  },
};

describe('assemblePricing', () => {
  it('carries source + buy/sell volume onto each material row', () => {
    const pricing = assemblePricing(STRUCTURE, (typeId) => PRICES[typeId]);

    const trit = pricing.rows.find((r) => r.typeId === 34);
    expect(trit).toMatchObject({ source: 'esi', buyVolume: 8_200, sellVolume: 1_200 });

    const pye = pricing.rows.find((r) => r.typeId === 35);
    expect(pye).toMatchObject({ source: 'fuzzwork-fallback', buyVolume: 90, sellVolume: null });
  });

  it('leaves source + volume null for an unpriced material', () => {
    const pricing = assemblePricing(STRUCTURE, (typeId) =>
      typeId === 34 ? PRICES[34] : undefined,
    );
    const pye = pricing.rows.find((r) => r.typeId === 35);
    expect(pye).toMatchObject({ source: null, buyVolume: null, sellVolume: null });
  });
});
