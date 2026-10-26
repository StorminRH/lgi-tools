import { composeFeeInputs } from './structure-factors';
import { expect, test } from 'vitest';
import { computeBatchLedger } from './build-batch';
import { deriveMarginFigures } from './industry-styles';
import {
  assemblePricing,
  pricedTypeIds,
  type PriceLite,
} from './build-pricing';
import type { CostBasis } from './cost-basis-view';
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
  nodeFilterIds: {},
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

test('assemblePricing carries source + buy/sell volume onto each material row, null when unpriced', () => {
  const pricing = assemblePricing(STRUCTURE, (typeId) => PRICES[typeId]);
  expect(pricing.rows.find((r) => r.typeId === 34)).toMatchObject({ source: 'esi', buyVolume: 8_200, sellVolume: 1_200 });
  expect(pricing.rows.find((r) => r.typeId === 35)).toMatchObject({ source: 'fuzzwork-fallback', buyVolume: 90, sellVolume: null });

  const partly = assemblePricing(STRUCTURE, (typeId) => (typeId === 34 ? PRICES[34] : undefined));
  expect(partly.rows.find((r) => r.typeId === 35)).toMatchObject({ source: null, buyVolume: null, sellVolume: null });

  // A row is its cost columns plus exactly the row price fields: no bestBuy, depth or discount.
  expect(pricing.rows.find((r) => r.typeId === 34)).toStrictEqual({
    typeId: 34,
    name: 'Tritanium',
    quantity: 100,
    unitBuy: 5,
    extendedCost: 500,
    bestSell: 6,
    pct5Buy: 4,
    pct5Sell: 7,
    buyVolume: 8_200,
    sellVolume: 1_200,
    source: 'esi',
    staleAfterMs: 1_700_000_000_000,
  });
});

test('assemblePricing prices the batched bill by default and the consumed bill on the marginal basis', () => {
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

  const batched = assemblePricing(structure, priceOf);
  expect(assemblePricing(structure, priceOf, { basis: 'batched' })).toEqual(batched);
  expect(batched.summary.basis).toBe('batched');
  expect(batched.summary.inputCost).toBe(35);

  const marginal = assemblePricing(structure, priceOf, { basis: 'marginal' });
  expect(marginal.summary.basis).toBe('marginal');
  expect(marginal.summary.inputCost).toBeCloseTo(17.5, 9);
  expect(marginal.summary.revenue).toBe(batched.summary.revenue);
  // The rows are always the batched bill; the ledger table never switches.
  expect(marginal.rows).toEqual(batched.rows);
  expect(marginal.rows[0]).toMatchObject({ typeId: 34, quantity: 7 });

  const three = assemblePricing(structure, priceOf, { basis: 'marginal', runs: 3 });
  expect(three.summary.inputCost).toBeCloseTo(marginal.summary.inputCost * 3, 9);
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

test('pricedTypeIds lists the raws, the product, then the intermediates, each once', () => {
  const structure: BlueprintStructure = {
    ...STRUCTURE,
    tree: [
      {
        typeId: 500,
        quantity: 2,
        producedBy: { blueprintTypeId: 1500, quantityPerRun: 1, runsNeeded: 2 },
        inputs: [{ typeId: 34, quantity: 100, inputs: [] }],
      },
      { typeId: 35, quantity: 50, inputs: [] },
    ],
    buildTree: BUILD_TREE,
    buildNodeDisplay: DISPLAY,
  };
  expect(pricedTypeIds(structure)).toEqual([34, 35, 999, 500]);

  // A product or intermediate that also turns up among the raws keeps its first place.
  const repeated: BlueprintStructure = {
    ...structure,
    tree: [
      { typeId: 500, quantity: 2, inputs: [] },
      { typeId: 999, quantity: 1, inputs: [] },
    ],
  };
  expect(pricedTypeIds(repeated)).toEqual([500, 999]);
});

test('assemblePricing prices each intermediate once without folding it into the cost basis', () => {
  const structure: BlueprintStructure = {
    ...STRUCTURE,
    product: { typeId: 999, name: 'Widget', quantityPerRun: 1, renderable: false },
    buildTree: BUILD_TREE,
    buildNodeDisplay: DISPLAY,
  };
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

  // Its own buy quote plus exactly the row price fields.
  expect(pricing.intermediatePrices).toStrictEqual([
    {
      typeId: 500,
      bestBuy: 1_000,
      bestSell: 1_200,
      pct5Buy: 950,
      pct5Sell: 1_250,
      buyVolume: 30,
      sellVolume: 40,
      source: 'esi',
      staleAfterMs: 1_700_000_000_000,
    },
  ]);
  expect(pricing.summary.inputCost).toBe(650);

  // A build tree that reaches the same intermediate twice prices it once.
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
  const twice = assemblePricing({ ...structure, buildTree: shared }, (typeId) => PRICES[typeId]);
  expect(twice.intermediatePrices.map((p) => p.typeId)).toEqual([500]);
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

test('assemblePricing itemizes the manufacturing job fee and net margin from the fee inputs', () => {
  const priceOf = (t: number) => NET_PRICES[t];
  // Without fee inputs only the gross figures exist.
  expect(assemblePricing(NET_STRUCTURE, priceOf).net).toBeNull();

  const baseline = assemblePricing(NET_STRUCTURE, priceOf, {
    fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
  }).net!;
  expect(baseline.systemCostIndex).toBe(0.04);
  expect(baseline.jobFee.estimatedItemValue).toBe(650);
  expect(baseline.jobFee.jobGrossCost).toBeCloseTo(26, 6);
  expect(baseline.jobFee.facilityTax).toBeCloseTo(1.625, 6);
  expect(baseline.jobFee.sccSurcharge).toBeCloseTo(26, 6);
  expect(baseline.jobFee.total).toBeCloseTo(53.625, 6);
  expect(baseline.sellSide.total).toBeCloseTo(105, 6);
  expect(baseline.netCost).toBeCloseTo(703.625, 6);
  expect(baseline.netMargin).toBeCloseTo(191.375, 6);
  expect(baseline.netMarginPct).toBeCloseTo(19.1375, 6);
  expect(baseline.facilityTaxAssumed).toBe(true);

  // An entered facility tax moves only the tax line.
  const taxed = assemblePricing(NET_STRUCTURE, priceOf, {
    fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, facilityTaxPct: 1 },
  }).net!;
  expect(taxed.jobFee.facilityTax).toBeCloseTo(6.5, 6);
  expect(taxed.jobFee.jobGrossCost).toBeCloseTo(26, 6);
  expect(taxed.jobFee.sccSurcharge).toBeCloseTo(26, 6);
  expect(taxed.jobFee.total).toBeCloseTo(58.5, 6);
  expect(taxed.facilityTaxAssumed).toBe(false);

  // An entered 0% is a real free structure; an entered 0.25% matches the assumed rate.
  const zero = assemblePricing(NET_STRUCTURE, priceOf, {
    fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, facilityTaxPct: 0 },
  }).net!;
  expect(zero.jobFee.facilityTax).toBe(0);
  expect(zero.facilityTaxAssumed).toBe(false);
  const entered = assemblePricing(NET_STRUCTURE, priceOf, {
    fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, facilityTaxPct: 0.25 },
  }).net!;
  expect(entered.jobFee).toEqual(baseline.jobFee);
  expect(entered.netMargin).toBe(baseline.netMargin);
  expect(entered.facilityTaxAssumed).toBe(false);

  // Cost basis, revenue, EIV and net margin scale with runs.
  const twoRuns = assemblePricing(NET_STRUCTURE, priceOf, {
    runs: 2,
    fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 },
  });
  expect(twoRuns.summary.inputCost).toBe(1_300);
  expect(twoRuns.summary.revenue).toBe(2_000);
  expect(twoRuns.net!.jobFee.estimatedItemValue).toBe(1_300);
  expect(twoRuns.net!.netMargin).toBeCloseTo(382.75, 6);

  // With no index, facility and SCC stay but the install-fee total and net are unknown.
  const unindexed = assemblePricing(NET_STRUCTURE, priceOf, {
    fee: { adjustedPriceOf: adjustedOf, systemCostIndex: null },
  }).net!;
  expect(unindexed.jobFee.missingSystemCostIndex).toBe(true);
  expect(unindexed.jobFee.jobGrossCost).toBeNull();
  expect(unindexed.jobFee.total).toBeNull();
  expect(unindexed.jobFee.facilityTax).toBeCloseTo(1.625, 6);
  expect(unindexed.jobFee.sccSurcharge).toBeCloseTo(26, 6);
  expect(unindexed.netMargin).toBeNull();

  // A missing adjusted price leaves a partial EIV and names the type.
  const partial = assemblePricing(NET_STRUCTURE, priceOf, {
    fee: { adjustedPriceOf: (id) => (id === 35 ? null : adjustedOf(id)), systemCostIndex: 0.04 },
  }).net!;
  expect(partial.jobFee.estimatedItemValue).toBe(500);
  expect(partial.jobFee.missingAdjustedPriceTypeIds).toEqual([35]);
});

test('assemblePricing costs a reaction top job against the reaction index, reaction SCC and the reaction host tax', () => {
  const reaction: BlueprintStructure = { ...NET_STRUCTURE, activityId: 11 };
  const priceOf = (t: number) => NET_PRICES[t];
  // Manufacturing fee keys alone do not price a reaction.
  expect(
    assemblePricing(reaction, priceOf, { fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 } }).net,
  ).toBeNull();

  const net = assemblePricing(reaction, priceOf, {
    fee: {
      adjustedPriceOf: adjustedOf,
      systemCostIndex: 0.04,
      structureCostBonusPct: 5,
      reaction: { systemCostIndex: 0.02 },
    },
  }).net!;
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

  // With no reaction index, facility and SCC stay visible but the total is unknown.
  const unindexed = assemblePricing(reaction, priceOf, {
    fee: { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04, reaction: { systemCostIndex: null } },
  }).net!;
  expect(unindexed.jobFee.missingSystemCostIndex).toBe(true);
  expect(unindexed.jobFee.jobGrossCost).toBeNull();
  expect(unindexed.jobFee.total).toBeNull();
  expect(unindexed.jobFee.facilityTax).toBeCloseTo(1.625, 6);
  expect(unindexed.jobFee.sccSurcharge).toBeCloseTo(26, 6);
  expect(unindexed.netMargin).toBeNull();

  // The reaction host's entered tax is charged on the reaction fee.
  const taxed = assemblePricing(reaction, priceOf, {
    fee: {
      adjustedPriceOf: adjustedOf,
      systemCostIndex: null,
      reaction: { systemCostIndex: 0.02, facilityTaxPct: 1 },
    },
  }).net!;
  expect(taxed.jobFee.facilityTax).toBeCloseTo(6.5, 6);
  expect(taxed.jobFee.jobGrossCost).toBeCloseTo(13, 6);
  expect(taxed.jobFee.sccSurcharge).toBeCloseTo(26, 6);
  expect(taxed.jobFee.total).toBeCloseTo(45.5, 6);
  expect(taxed.netMargin).toBeCloseTo(199.5, 6);
  expect(taxed.facilityTaxRate).toBe(0.01);
  expect(taxed.facilityTaxAssumed).toBe(false);
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
  nodeFilterIds: {},
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

test('assemblePricing prices one Fernite Carbide reaction run end to end', () => {
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

test('assemblePricing reduces the cost basis at the owned ME but keeps the EIV at ME0', () => {
  const meOf10 = (bp: number) => (bp === 1 ? 10 : undefined);
  const owned = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], { meOf: meOf10 });
  expect(owned.rows.find((r) => r.typeId === 34)?.quantity).toBe(90);
  expect(owned.rows.find((r) => r.typeId === 35)?.quantity).toBe(45);
  expect(owned.summary.inputCost).toBe(585);

  const fee = { adjustedPriceOf: adjustedOf, systemCostIndex: 0.04 };
  const grossNet = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], { fee }).net!;
  const ownedNet = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t], { fee, meOf: meOf10 });
  expect(ownedNet.net!.jobFee.estimatedItemValue).toBe(650);
  expect(ownedNet.net!.jobFee.estimatedItemValue).toBe(grossNet.jobFee.estimatedItemValue);
  expect(ownedNet.summary.inputCost).toBe(585);
  expect(ownedNet.net!.netCost).toBeLessThan(grossNet.netCost!);
});

const BUY_LADDER = [
  { pct: 0.5, cumVolume: 100 },
  { pct: 2, cumVolume: 600 },
];
const SELL_LADDER = [
  { pct: 0.5, cumVolume: 50 },
  { pct: 5, cumVolume: 900 },
];

test('assemblePricing carries product depth ladders and pct5Sell onto the product without moving the gross payload', () => {
  const base = assemblePricing(NET_STRUCTURE, (t) => NET_PRICES[t]);
  expect(base.product.buyDepth).toBeNull();
  expect(base.product.sellDepth).toBeNull();
  // The Fuzzwork null-percentile shape carries through as null.
  expect(base.product.pct5Sell).toBeNull();

  const withDepth = assemblePricing(NET_STRUCTURE, (t) =>
    t === 999 ? { ...NET_PRICES[999]!, buyDepth: BUY_LADDER, sellDepth: SELL_LADDER, pct5Sell: 1_050 } : NET_PRICES[t],
  );
  expect(withDepth.product.buyDepth).toEqual(BUY_LADDER);
  expect(withDepth.product.sellDepth).toEqual(SELL_LADDER);
  expect(withDepth.product.bestSell).toBe(1_000);
  expect(withDepth.product.pct5Sell).toBe(1_050);
  expect(withDepth.summary).toEqual(base.summary);
  expect(withDepth.rows).toEqual(base.rows);
  expect(withDepth.intermediatePrices).toEqual(base.intermediatePrices);
  expect(withDepth.net).toEqual(base.net);
  expect({ ...withDepth.product, buyDepth: null, sellDepth: null, pct5Sell: null }).toEqual(base.product);
});

// A widget from 5 plates a run; the plates take 7 Tritanium a run and come 10 to a run.
const CHAIN: BlueprintStructure = {
  ...STRUCTURE,
  tree: [
    {
      typeId: 500,
      quantity: 5,
      producedBy: { blueprintTypeId: 1500, quantityPerRun: 10, runsNeeded: 0.5 },
      inputs: [{ typeId: 34, quantity: 7, inputs: [] }],
    },
  ],
  buildTree: [
    {
      typeId: 999,
      quantity: 1,
      inputs: [{ typeId: 500, quantity: 5, inputs: [{ typeId: 34, quantity: 7, inputs: [] }] }],
    },
  ],
  buildNodeDisplay: DISPLAY,
  nodeActivityByBlueprint: { 1500: 1 },
};
const chainAdjusted = (id: number) => ({ 34: 5, 500: 40 })[id] ?? null;
const COMPONENTS = {
  siteOf: () => ({ systemId: 7, facilityTaxPct: 1, costBonusPct: 4 }),
  costIndexOf: (systemId: number) => (systemId === 7 ? 0.1 : null),
};
const priceChain = (basis: CostBasis, withComponents = true) =>
  assemblePricing(CHAIN, (t) => NET_PRICES[t], {
    basis,
    fee: { adjustedPriceOf: chainAdjusted, systemCostIndex: 0.04, ...(withComponents ? { components: COMPONENTS } : {}) },
  });

test('assemblePricing charges the component jobs a profile places, at the runs the cost basis counts', () => {
  // Without a profile only the product's own job is charged.
  const productOnly = priceChain('batched', false).net!;
  expect(productOnly.componentJobs).toBeNull();
  // 35 of Tritanium, and the widget's job on 5 plates at 40: 8 + 0.5 + 8.
  expect(productOnly.jobFee.total).toBeCloseTo(16.5, 9);
  expect(productOnly.netCost).toBeCloseTo(51.5, 9);

  // The full line charges the plates' whole run where the profile builds them.
  const fullLine = priceChain('batched');
  const net = fullLine.net!;
  // One whole run of plates: 7 Tritanium at 5 is 35; at 10% less 4%, 1% tax, 4% SCC.
  expect(net.componentJobs!.jobs).toHaveLength(1);
  expect(net.componentJobs!.jobs[0]).toMatchObject({ typeId: 500, runs: 1, systemId: 7, systemCostIndex: 0.1 });
  expect(net.componentJobs!.total).toBeCloseTo(3.36 + 0.35 + 1.4, 9);
  expect(net.netCost).toBeCloseTo(35 + 16.5 + 5.11, 9);
  expect(net.netMargin).toBeCloseTo(1_000 - 105 - 56.61, 9);
  // The fees shown add up to the cost charged.
  expect(net.netCost! - fullLine.summary.inputCost - net.jobFee.total!).toBeCloseTo(net.componentJobs!.total!, 9);

  // One build charges only the half run of plates it draws.
  const oneBuild = priceChain('marginal').net!;
  expect(oneBuild.componentJobs!.jobs[0]!.runs).toBe(0.5);
  expect(oneBuild.componentJobs!.total).toBeCloseTo(2.555, 9);
  expect(oneBuild.netCost).toBeCloseTo(17.5 + 16.5 + 2.555, 9);

  // A precomputed ledger prices the same bill as walking the tree, on either basis.
  for (const basis of ['batched', 'marginal'] as const) {
    const reused = assemblePricing(CHAIN, (t) => NET_PRICES[t], {
      basis,
      ledger: computeBatchLedger(CHAIN.tree, 1),
      fee: { adjustedPriceOf: chainAdjusted, systemCostIndex: 0.04, components: COMPONENTS },
    });
    expect(reused).toEqual(priceChain(basis));
    // The rows stay the whole-run line; the plates' job runs follow the basis.
    expect(reused.rows).toEqual([expect.objectContaining({ typeId: 34, quantity: 7 })]);
    expect(reused.net!.componentJobs!.jobs[0]!.runs).toBe(basis === 'marginal' ? 0.5 : 1);
  }
});

test('assemblePricing charges known component jobs while an uncovered top activity leaves the net unknown', () => {
  for (const activityId of [1, 11]) {
    const fee = composeFeeInputs({
      adjustedPriceOf: chainAdjusted, location: null, reactionLocation: null, buildStructure: null, reactionStructure: null,
      structureCostBonusPct: 0, components: COMPONENTS,
    });
    const net = assemblePricing({ ...CHAIN, activityId }, (t) => NET_PRICES[t], { fee }).net!;
    expect(net.componentJobs!.total).toBeCloseTo(5.11, 9);
    expect(net.componentJobs!.jobs[0]!.systemId).toBe(7);
    expect(net.systemCostIndex).toBeNull();
    expect(net.jobFee.missingSystemCostIndex).toBe(true);
    expect(net.jobFee.total).toBeNull();
    expect(net.netCost).toBeNull();
    expect(net.netMargin).toBeNull();
  }
});

test('assemblePricing leaves the net open for an unindexed component system and values an unpriced input at nothing', () => {
  const unindexed = assemblePricing(CHAIN, (t) => NET_PRICES[t], {
    fee: {
      adjustedPriceOf: chainAdjusted,
      systemCostIndex: 0.04,
      components: { ...COMPONENTS, costIndexOf: () => null },
    },
  });
  expect(unindexed.net!.componentJobs!.total).toBeNull();
  expect(unindexed.net!.netCost).toBeNull();
  expect(unindexed.net!.netMargin).toBeNull();
  expect(deriveMarginFigures(unindexed.summary, unindexed.net).missingSystemCostIndex).toBe(true);

  const net = assemblePricing(CHAIN, (t) => NET_PRICES[t], {
    fee: { adjustedPriceOf: (id) => id === 34 ? null : chainAdjusted(id), systemCostIndex: 0.04, components: COMPONENTS },
  }).net!;
  expect(net.jobFee.missingAdjustedPriceTypeIds).toEqual([]);
  expect(net.jobFee.total).toBeCloseTo(16.5, 9);
  // The plates' only input is unpriced, so their job is valued at nothing.
  expect(net.componentJobs!.jobs[0]!.fee.missingAdjustedPriceTypeIds).toEqual([34]);
  expect(net.componentJobs!.total).toBe(0);
  expect(net.netCost).toBeCloseTo(35 + 16.5, 9);
  expect(net.netMargin).toBeCloseTo(1_000 - 105 - 51.5, 9);
  expect(deriveMarginFigures(null, net).missingAdjustedPriceCount).toBe(1);
});
