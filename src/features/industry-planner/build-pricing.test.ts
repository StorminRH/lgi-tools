import { describe, expect, it } from 'vitest';
import {
  assemblePricing,
  buildConfidenceInputs,
  collectIntermediateTypeIds,
  type PriceLite,
} from './build-pricing';
import type { BlueprintStructure, BuildNode, BuildNodeDisplay } from './types';

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

// A small build tree: product 999 (root) → intermediate 500 (buildable) → raw
// 34; plus a raw 35 directly under the root. Two roots are exercised by the
// dedup case below.
const DISPLAY: Record<number, BuildNodeDisplay> = {
  999: { name: 'Widget', height: 2, isRaw: false, label: 'Frigate', tone: 'teal' },
  500: { name: 'Subassembly', height: 1, isRaw: false, label: 'Construction', tone: 'blue' },
  34: { name: 'Tritanium', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
  35: { name: 'Pyerite', height: 0, isRaw: true, label: 'Mineral', tone: 'neutral' },
};
const BUILD_TREE: BuildNode[] = [
  {
    typeId: 999,
    quantity: 1,
    inputs: [
      { typeId: 500, quantity: 2, inputs: [{ typeId: 34, quantity: 100, inputs: [] }] },
      { typeId: 35, quantity: 50, inputs: [] },
    ],
  },
];

describe('collectIntermediateTypeIds', () => {
  it('returns buildable non-root nodes, excluding roots and raws', () => {
    expect(collectIntermediateTypeIds(BUILD_TREE, DISPLAY)).toEqual([500]);
  });

  it('dedupes a component shared across the tree', () => {
    const shared: BuildNode[] = [
      {
        typeId: 999,
        quantity: 1,
        inputs: [
          { typeId: 500, quantity: 2, inputs: [] },
          { typeId: 500, quantity: 3, inputs: [] },
        ],
      },
    ];
    expect(collectIntermediateTypeIds(shared, DISPLAY)).toEqual([500]);
  });
});

describe('assemblePricing intermediate side-channel', () => {
  const structure: BlueprintStructure = {
    ...STRUCTURE,
    product: { typeId: 999, name: 'Widget', quantityPerRun: 1 },
    buildTree: BUILD_TREE,
    buildNodeDisplay: DISPLAY,
  };

  it('prices intermediates without folding them into the cost basis', () => {
    const intermediatePrice: PriceLite = {
      bestBuy: 1_000,
      bestSell: 1_200,
      pct5Buy: 950,
      pct5Sell: 1_250,
      buyVolume: 30,
      sellVolume: 40,
      source: 'esi',
      staleAfterMs: 1_700_000_000_000,
    };
    const pricing = assemblePricing(structure, (typeId) =>
      typeId === 500 ? intermediatePrice : PRICES[typeId],
    );

    expect(pricing.intermediatePrices).toEqual([
      expect.objectContaining({ typeId: 500, bestBuy: 1_000, buyVolume: 30, source: 'esi' }),
    ]);
    // Cost basis is the raws only (34 × 100 @ 5 + 35 × 50 @ 3 = 650).
    expect(pricing.summary.inputCost).toBe(650);
  });
});

describe('buildConfidenceInputs', () => {
  it('maps both priced raw rows and intermediates by typeId', () => {
    const structure: BlueprintStructure = {
      ...STRUCTURE,
      product: { typeId: 999, name: 'Widget', quantityPerRun: 1 },
      buildTree: BUILD_TREE,
      buildNodeDisplay: DISPLAY,
    };
    const intermediatePrice: PriceLite = {
      bestBuy: 1_000,
      bestSell: null,
      pct5Buy: null,
      pct5Sell: null,
      buyVolume: 30,
      sellVolume: null,
      source: 'fuzzwork-fallback',
      staleAfterMs: 1_699_000_000_000,
    };
    const pricing = assemblePricing(structure, (typeId) =>
      typeId === 500 ? intermediatePrice : PRICES[typeId],
    );
    const inputs = buildConfidenceInputs(pricing);

    expect(inputs.get(34)).toMatchObject({ source: 'esi', buyVolume: 8_200, unitBuy: 5 });
    expect(inputs.get(500)).toMatchObject({
      source: 'fuzzwork-fallback',
      buyVolume: 30,
      unitBuy: 1_000,
    });
  });
});
