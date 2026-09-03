import { describe, expect, it } from 'vitest';
import {
  assemblePricing,
  buildConfidenceInputs,
  collectIntermediateTypeIds,
  type PriceLite,
} from './build-pricing';
import type { BlueprintStructure, BuildNode, BuildNodeDisplay } from './types';

const STRUCTURE: BlueprintStructure = {
  blueprintTypeId: 1,
  activityId: 1,
  product: { typeId: 999, name: 'Widget', quantityPerRun: 1, renderable: false },
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
  topJobSeconds: null,
  nodeJobSeconds: {},
  nodeActivityByBlueprint: {},
  nodeTimeSkills: {},
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

describe('assemblePricing — cost basis (Raw|Item toggle, 3.7.21.1)', () => {

  const structure: BlueprintStructure = {
    ...STRUCTURE,
    tree: [
      {
        typeId: 500,
        quantity: 5,
        producedBy: { blueprintTypeId: 1500, quantityPerRun: 10, runsNeeded: 0.5 },
        inputs: [{ typeId: 34, quantity: 7, inputs: [] }],
      },
    ],
  };
  const priceOf = (typeId: number) => PRICES[typeId];

  it('defaults to the batched basis, byte-identical with the option absent', () => {
    const absent = assemblePricing(structure, priceOf);
    const explicit = assemblePricing(structure, priceOf, { basis: 'batched' });
    expect(explicit).toEqual(absent);
    expect(absent.summary.basis).toBe('batched');
    expect(absent.summary.inputCost).toBe(35);
  });

  it('marginal basis prices the consumed bill in the summary', () => {
    const pricing = assemblePricing(structure, priceOf, { basis: 'marginal' });
    expect(pricing.summary.basis).toBe('marginal');
    expect(pricing.summary.inputCost).toBeCloseTo(17.5, 9);

    const batched = assemblePricing(structure, priceOf);
    expect(pricing.summary.revenue).toBe(batched.summary.revenue);
  });

  it('rows are ALWAYS the batched bill — the ledger table never switches', () => {
    const batched = assemblePricing(structure, priceOf);
    const marginal = assemblePricing(structure, priceOf, { basis: 'marginal' });
    expect(marginal.rows).toEqual(batched.rows);
    expect(marginal.rows[0]).toMatchObject({ typeId: 34, quantity: 7 });
  });

  it('scales linearly with runs on the marginal basis', () => {
    const one = assemblePricing(structure, priceOf, { basis: 'marginal' });
    const three = assemblePricing(structure, priceOf, { basis: 'marginal', runs: 3 });
    expect(three.summary.inputCost).toBeCloseTo(one.summary.inputCost * 3, 9);
  });
});

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
    product: { typeId: 999, name: 'Widget', quantityPerRun: 1, renderable: false },
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

    expect(pricing.summary.inputCost).toBe(650);
  });
});

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

const ADJUSTED: Record<number, number> = { 34: 5, 35: 3 };
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
    expect(net.jobFee.jobGrossCost).toBeCloseTo(26, 6);
    expect(net.jobFee.facilityTax).toBeCloseTo(1.625, 6);
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6);
    expect(net.jobFee.total).toBeCloseTo(53.625, 6);
    expect(net.sellSide.total).toBeCloseTo(105, 6);
    expect(net.netCost).toBeCloseTo(703.625, 6);
    expect(net.netMargin).toBeCloseTo(191.375, 6);
    expect(net.netMarginPct).toBeCloseTo(19.1375, 6);
  });

  it('returns null net for a reaction blueprint with only manufacturing fee keys (the gate safety)', () => {

    const reaction: BlueprintStructure = { ...NET_STRUCTURE, activityId: 11 };
    const pricing = assemblePricing(reaction, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
    });
    expect(pricing.net).toBeNull();
  });

  it('costs a reaction top job against the reaction index + reaction SCC (the #187 seam live)', () => {
    const reaction: BlueprintStructure = { ...NET_STRUCTURE, activityId: 11 };
    const pricing = assemblePricing(reaction, (t) => NET_PRICES[t], {
      fee: {
        adjustedPriceOf: adjustedOf,
        systemCostIndex: 0.04,
        structureCostBonusPct: 5,
        reaction: { systemCostIndex: 0.02 },
      },
    });
    const net = pricing.net!;
    expect(net.systemCostIndex).toBe(0.02);
    expect(net.jobFee.estimatedItemValue).toBe(650);
    expect(net.jobFee.jobGrossCost).toBeCloseTo(13, 6);
    expect(net.jobFee.facilityTax).toBeCloseTo(1.625, 6);
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6);
    expect(net.jobFee.total).toBeCloseTo(40.625, 6);
    expect(net.netCost).toBeCloseTo(690.625, 6);
    expect(net.netMargin).toBeCloseTo(204.375, 6);
    expect(net.netMarginPct).toBeCloseTo(20.4375, 6);
    expect(net.facilityTaxRate).toBe(0.0025);
    expect(net.facilityTaxAssumed).toBe(true);
  });

  it('keeps reaction facility + SCC visible but nulls the total when the reaction index is absent', () => {
    const reaction: BlueprintStructure = { ...NET_STRUCTURE, activityId: 11 };
    const pricing = assemblePricing(reaction, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, reaction: { systemCostIndex: null } },
    });
    const net = pricing.net!;
    expect(net.jobFee.missingSystemCostIndex).toBe(true);
    expect(net.jobFee.jobGrossCost).toBeNull();
    expect(net.jobFee.total).toBeNull();
    expect(net.jobFee.facilityTax).toBeCloseTo(1.625, 6);
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6);
    expect(net.netMargin).toBeNull();
  });

  it('charges the reaction host structure\'s entered tax on the reaction fee', () => {
    const reaction: BlueprintStructure = { ...NET_STRUCTURE, activityId: 11 };
    const pricing = assemblePricing(reaction, (t) => NET_PRICES[t], {
      fee: {
        adjustedPriceOf: adjustedOf,
        systemCostIndex: null,
        reaction: { systemCostIndex: 0.02, facilityTaxPct: 1 },
      },
    });
    const net = pricing.net!;
    expect(net.jobFee.facilityTax).toBeCloseTo(6.5, 6);
    expect(net.jobFee.jobGrossCost).toBeCloseTo(13, 6);
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6);
    expect(net.jobFee.total).toBeCloseTo(45.5, 6);
    expect(net.netMargin).toBeCloseTo(199.5, 6);
    expect(net.facilityTaxRate).toBe(0.01);
    expect(net.facilityTaxAssumed).toBe(false);
  });

  it('charges an entered manufacturing facility tax and moves ONLY the tax line', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, facilityTaxPct: 1 },
    });
    const net = pricing.net!;
    expect(net.jobFee.facilityTax).toBeCloseTo(6.5, 6);
    expect(net.jobFee.jobGrossCost).toBeCloseTo(26, 6);
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6);
    expect(net.jobFee.total).toBeCloseTo(58.5, 6);
    expect(net.facilityTaxAssumed).toBe(false);
  });

  it('treats an entered 0% as a real free structure, and an entered 0.25% as byte-identical numbers', () => {
    const zero = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, facilityTaxPct: 0 },
    }).net!;
    expect(zero.jobFee.facilityTax).toBe(0);
    expect(zero.facilityTaxAssumed).toBe(false);

    const entered = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, facilityTaxPct: 0.25 },
    }).net!;
    const baseline = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
    }).net!;
    expect(entered.jobFee).toEqual(baseline.jobFee);
    expect(entered.netMargin).toBe(baseline.netMargin);
    expect(entered.facilityTaxAssumed).toBe(false);
    expect(baseline.facilityTaxAssumed).toBe(true);
  });

  it('scales the cost basis, revenue, EIV, and net margin linearly with runs', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      runs: 2,
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
    });
    expect(pricing.summary.inputCost).toBe(1_300);
    expect(pricing.summary.revenue).toBe(2_000);
    const net = pricing.net!;
    expect(net.jobFee.estimatedItemValue).toBe(1_300);
    expect(net.netMargin).toBeCloseTo(382.75, 6);
  });

  it('keeps facility + SCC but nulls the install-fee total and net when the index is absent', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: adjustedOf, systemCostIndex: null },
    });
    const net = pricing.net!;
    expect(net.jobFee.missingSystemCostIndex).toBe(true);
    expect(net.jobFee.jobGrossCost).toBeNull();
    expect(net.jobFee.total).toBeNull();
    expect(net.jobFee.facilityTax).toBeCloseTo(1.625, 6);
    expect(net.jobFee.sccSurcharge).toBeCloseTo(26, 6);
    expect(net.netMargin).toBeNull();
  });

  it('flags a missing adjusted price with a partial EIV rather than zeroing it', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], {
      fee: { adjustedPriceOf: (id) => (id === 35 ? null : adjustedOf(id)), systemCostIndex: 0.04 },
    });
    const net = pricing.net!;
    expect(net.jobFee.estimatedItemValue).toBe(500);
    expect(net.jobFee.missingAdjustedPriceTypeIds).toEqual([35]);
  });
});

const FERNITE_STRUCTURE: BlueprintStructure = {
  blueprintTypeId: 46_206,
  activityId: 11,
  product: { typeId: 16_673, name: 'Fernite Carbide', quantityPerRun: 10_000, renderable: false },
  tree: [
    { typeId: 4_246, quantity: 5, inputs: [] },
    { typeId: 16_656, quantity: 100, inputs: [] },
    { typeId: 16_660, quantity: 100, inputs: [] },
  ],
  buildTree: [
    {
      typeId: 16_673,
      quantity: 10_000,
      inputs: [
        { typeId: 4_246, quantity: 5, inputs: [] },
        { typeId: 16_656, quantity: 100, inputs: [] },
        { typeId: 16_660, quantity: 100, inputs: [] },
      ],
    },
  ],
  buildNodeDisplay: {},
  rootHeight: 1,
  materialCategory: {},
  materialCategories: [],
  materialNames: {
    4_246: 'Hydrogen Fuel Block',
    16_656: 'Fernite Alloy',
    16_660: 'Crystallite Alloy',
    16_673: 'Fernite Carbide',
  },
  topJobSeconds: null,
  nodeJobSeconds: {},
  nodeActivityByBlueprint: {},
  nodeTimeSkills: {},
};

const lite = (p: Partial<PriceLite>): PriceLite => ({
  bestBuy: null,
  bestSell: null,
  pct5Buy: null,
  pct5Sell: null,
  buyVolume: null,
  sellVolume: null,
  source: 'esi',
  staleAfterMs: 1_700_000_000_000,
  ...p,
});

const FERNITE_PRICES: Record<number, PriceLite> = {
  4_246: lite({ bestBuy: 18_000 }),
  16_656: lite({ bestBuy: 38_000 }),
  16_660: lite({ bestBuy: 28_000 }),
  16_673: lite({ bestSell: 800 }),
};

const FERNITE_ADJUSTED: Record<number, number> = { 4_246: 20_000, 16_656: 40_000, 16_660: 30_000 };

describe('assemblePricing reaction worked example (Fernite Carbide)', () => {
  it('prices one run end to end through the reaction fee branch', () => {
    const pricing = assemblePricing(FERNITE_STRUCTURE, (t) => FERNITE_PRICES[t], {
      fee: {
        adjustedPriceOf: (id) => FERNITE_ADJUSTED[id] ?? null,
        systemCostIndex: null,
        reaction: { systemCostIndex: 0.02 },
      },
    });

    expect(pricing.summary.inputCost).toBe(6_690_000);

    expect(pricing.summary.revenue).toBe(8_000_000);
    const net = pricing.net!;

    expect(net.jobFee.estimatedItemValue).toBe(7_100_000);
    expect(net.jobFee.jobGrossCost).toBeCloseTo(142_000, 6);
    expect(net.jobFee.facilityTax).toBeCloseTo(17_750, 6);
    expect(net.jobFee.sccSurcharge).toBeCloseTo(284_000, 6);
    expect(net.jobFee.total).toBeCloseTo(443_750, 6);
    expect(net.sellSide.total).toBeCloseTo(840_000, 6);
    expect(net.netCost).toBeCloseTo(7_133_750, 6);
    expect(net.netMargin).toBeCloseTo(26_250, 6);
    expect(net.netMarginPct).toBeCloseTo(0.328125, 6);
  });

  it('charges the refinery\'s entered tax on the same run', () => {
    const pricing = assemblePricing(FERNITE_STRUCTURE, (t) => FERNITE_PRICES[t], {
      fee: {
        adjustedPriceOf: (id) => FERNITE_ADJUSTED[id] ?? null,
        systemCostIndex: null,
        reaction: { systemCostIndex: 0.02, facilityTaxPct: 1 },
      },
    });
    const net = pricing.net!;
    expect(net.jobFee.facilityTax).toBeCloseTo(71_000, 6);
    expect(net.jobFee.total).toBeCloseTo(497_000, 6);
    expect(net.netMargin).toBeCloseTo(-27_000, 6);
    expect(net.facilityTaxAssumed).toBe(false);
  });
});

describe('assemblePricing owned-ME overlay (3.7.5.2)', () => {

  const meOf10 = (bp: number) => (bp === 1 ? 10 : undefined);

  it('reduces the cost-basis quantities + inputCost at the owned ME', () => {
    const owned = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], { meOf: meOf10 });
    expect(owned.rows.find((r) => r.typeId === 34)?.quantity).toBe(90);
    expect(owned.rows.find((r) => r.typeId === 35)?.quantity).toBe(45);
    expect(owned.summary.inputCost).toBe(585);
  });

  it('owning none of the build (meOf → undefined) is byte-identical to the no-meOf gross path', () => {
    const gross = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t]);
    const unowned = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], { meOf: () => undefined });
    expect(unowned.rows).toEqual(gross.rows);
    expect(unowned.summary).toEqual(gross.summary);
  });

  it('leaves the net-margin EIV at ME0 even when the cost basis is ME-reduced', () => {
    const fee = { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 };
    const grossNet = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], { fee });
    const ownedNet = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], { fee, meOf: meOf10 });

    expect(ownedNet.net!.jobFee.estimatedItemValue).toBe(650);
    expect(ownedNet.net!.jobFee.estimatedItemValue).toBe(grossNet.net!.jobFee.estimatedItemValue);

    expect(ownedNet.summary.inputCost).toBe(585);
    expect(ownedNet.net!.netCost).toBeLessThan(grossNet.net!.netCost!);
  });
});

const BUY_LADDER = [
  { pct: 0.5, cumVolume: 100 },
  { pct: 2, cumVolume: 600 },
];
const SELL_LADDER = [
  { pct: 0.5, cumVolume: 50 },
  { pct: 5, cumVolume: 900 },
];

describe('assemblePricing product depth (3.5.3b)', () => {
  it('carries the product depth ladders onto the product, null when absent', () => {
    const noDepth = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t]);
    expect(noDepth.product.buyDepth).toBeNull();
    expect(noDepth.product.sellDepth).toBeNull();

    const withDepth = assemblePricing(NET_STRUCTURE, (t) =>
      t === 999 ? { ...NET_PRICES[999]!, buyDepth: BUY_LADDER, sellDepth: SELL_LADDER } : NET_PRICES[t],
    );
    expect(withDepth.product.buyDepth).toEqual(BUY_LADDER);
    expect(withDepth.product.sellDepth).toEqual(SELL_LADDER);
  });

  it('leaves the gross payload byte-identical whether or not depth is present', () => {

    const base = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t]);
    const withDepth = assemblePricing(NET_STRUCTURE, (t) =>
      t === 999 ? { ...NET_PRICES[999]!, buyDepth: BUY_LADDER, sellDepth: SELL_LADDER } : NET_PRICES[t],
    );
    expect(withDepth.summary).toEqual(base.summary);
    expect(withDepth.rows).toEqual(base.rows);
    expect(withDepth.intermediatePrices).toEqual(base.intermediatePrices);
    expect(withDepth.net).toEqual(base.net);

    expect({ ...withDepth.product, buyDepth: null, sellDepth: null }).toEqual(base.product);
  });
});

describe('assemblePricing product sell figures (3.7.25.1)', () => {
  it('threads the product pct5Sell from the lookup (the thin-order badge reference)', () => {
    const pricing = assemblePricing(NET_STRUCTURE, (t) =>
      t === 999 ? { ...NET_PRICES[999]!, pct5Sell: 1_050 } : NET_PRICES[t],
    );
    expect(pricing.product.bestSell).toBe(1_000);
    expect(pricing.product.pct5Sell).toBe(1_050);
  });

  it('null pct5Sell (the Fuzzwork null-percentile shape) carries through as null', () => {

    const pricing = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t]);
    expect(pricing.product.pct5Sell).toBeNull();
  });
});

describe('buildConfidenceInputs', () => {
  it('maps both priced raw rows and intermediates by typeId', () => {
    const structure: BlueprintStructure = {
      ...STRUCTURE,
      product: { typeId: 999, name: 'Widget', quantityPerRun: 1, renderable: false },
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
