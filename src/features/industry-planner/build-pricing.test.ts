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
// industry-math/profitability.test.ts). The cost basis is now the batch walk
// over `tree`; two raw leaves flatten to the same totals (no intermediate, so
// whole-run == the quantities themselves — batch rounding is covered in
// build-batch.test.ts).
const STRUCTURE: BlueprintStructure = {
  blueprintTypeId: 1,
  activityId: 1,
  product: { typeId: 999, name: 'Widget', quantityPerRun: 1 },
  tree: [
    { typeId: 34, quantity: 100, inputs: [] },
    { typeId: 35, quantity: 50, inputs: [] },
  ],
  buildTree: [],
  buildNodeDisplay: {},
  rootHeight: 1,
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

// A manufacturing structure whose top job's direct ME0 inputs (buildTree[0]) are
// the two raws, so the EIV base = {34×100, 35×50}. Adjusted prices below are a
// distinct series from the market PRICES above (EIV ≠ build cost in general; they
// coincide here only because the test numbers are reused).
const NET_STRUCTURE: BlueprintStructure = {
  ...STRUCTURE,
  activityId: 1,
  buildTree: [
    {
      typeId: 999,
      quantity: 1,
      inputs: [
        { typeId: 34, quantity: 100, inputs: [] },
        { typeId: 35, quantity: 50, inputs: [] },
      ],
    },
  ],
  buildNodeDisplay: DISPLAY,
};

// PRICES + a sell price for the product, so revenue (and thus net margin) is
// defined.
const NET_PRICES: Record<number, PriceLite> = {
  ...PRICES,
  999: {
    bestBuy: null,
    bestSell: 1_000,
    pct5Buy: null,
    pct5Sell: null,
    buyVolume: null,
    sellVolume: null,
    source: 'esi',
    staleAfterMs: 1_700_000_000_000,
  },
};

const ADJUSTED: Record<number, number> = { 34: 5, 35: 3 }; // EIV = 100·5 + 50·3 = 650
const adjustedOf = (id: number): number | null => ADJUSTED[id] ?? null;

describe('assemblePricing net margin', () => {
  it('is null on the gross-only path (no fee inputs)', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t]);
    expect(pricing.net).toBeNull();
  });

  it('computes itemized fees + net margin for a manufacturing blueprint with a location', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
    });
    expect(pricing.net).not.toBeNull();
    const net = pricing.net!;
    expect(net.systemCostIndex).toBe(0.04);
    expect(net.jobFee.estimatedItemValue).toBe(650);
    expect(net.jobFee.jobGrossCost).toBeCloseTo(26, 6); // 650 × 0.04
    expect(net.jobFee.facilityTax).toBeCloseTo(1.625, 6); // 650 × 0.0025
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6); // 650 × 0.04
    expect(net.jobFee.total).toBeCloseTo(53.625, 6);
    expect(net.sellSide.total).toBeCloseTo(105, 6); // 1000 × (0.075 + 0.03)
    expect(net.netCost).toBeCloseTo(703.625, 6); // 650 build + 53.625 fee
    expect(net.netMargin).toBeCloseTo(191.375, 6); // 1000 − 105 − 703.625
    expect(net.netMarginPct).toBeCloseTo(19.1375, 6);
  });

  it('returns null net for a reaction blueprint even when fee inputs are passed', () => {
    const reaction: BlueprintStructure = { ...NET_STRUCTURE, activityId: 11 };
    const pricing = assemblePricing(reaction, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
    });
    expect(pricing.net).toBeNull();
  });

  it('scales the cost basis, revenue, EIV, and net margin linearly with runs', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      runs: 2,
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
    });
    expect(pricing.summary.inputCost).toBe(1_300); // 650 × 2
    expect(pricing.summary.revenue).toBe(2_000); // 1000 × 1/run × 2 runs
    const net = pricing.net!;
    expect(net.jobFee.estimatedItemValue).toBe(1_300); // EIV × 2
    expect(net.netMargin).toBeCloseTo(382.75, 6); // 191.375 × 2
  });

  it('keeps facility + SCC but nulls the install-fee total and net when the index is absent', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: null },
    });
    const net = pricing.net!;
    expect(net.jobFee.missingSystemCostIndex).toBe(true);
    expect(net.jobFee.jobGrossCost).toBeNull();
    expect(net.jobFee.total).toBeNull();
    expect(net.jobFee.facilityTax).toBeCloseTo(1.625, 6); // EIV-only, still known
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6);
    expect(net.netMargin).toBeNull(); // can't complete without the index
  });

  it('flags a missing adjusted price with a partial EIV rather than zeroing it', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: (id) => (id === 35 ? null : adjustedOf(id)), systemCostIndex: 0.04 },
    });
    const net = pricing.net!;
    expect(net.jobFee.estimatedItemValue).toBe(500); // only 34 (100 × 5); 35 dropped
    expect(net.jobFee.missingAdjustedPriceTypeIds).toEqual([35]);
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
