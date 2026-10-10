import { describe, expect, it } from 'vitest';
import type { TreeNode } from '@/data/eve-data/types';
import { computeBatchLedger } from './build-batch';
import { computeComponentJobFees } from './component-job-fees';
import { componentSheet } from './component-sheet-view';
import type { BlueprintStructure, ComponentJobFee } from './types';

// A component (10) of two inputs: a reaction (20) of one raw (30), and a raw (40).
const tree: TreeNode[] = [
  {
    typeId: 10,
    quantity: 3,
    producedBy: { blueprintTypeId: 110, quantityPerRun: 2, runsNeeded: 1.5 },
    inputs: [
      {
        typeId: 20,
        quantity: 50,
        producedBy: { blueprintTypeId: 120, quantityPerRun: 40, runsNeeded: 1.25 },
        inputs: [{ typeId: 30, quantity: 5, inputs: [] }],
      },
      { typeId: 40, quantity: 7, inputs: [] },
    ],
  },
];
const structure = {
  tree,
  buildNodeDisplay: {
    10: { name: 'Capital Armor Plates', label: 'Capital Component', isRaw: false, height: 2, tone: 'green' },
    20: { name: 'Fernite Carbide', label: 'Reaction', isRaw: false, height: 1, tone: 'blue' },
  },
  materialNames: { 10: 'Capital Armor Plates', 20: 'Fernite Carbide', 30: 'Fernite', 40: 'Tritanium' },
  nodeActivityByBlueprint: { 110: 1, 120: 11 },
} as unknown as BlueprintStructure;

const prices = new Map<number, number | null>([
  [10, 9_000],
  [20, 40],
  [30, 2],
  [40, 5],
]);

describe('componentSheet', () => {
  const ledger = computeBatchLedger(tree, 1);

  it('shows the job: whole runs, what they make, and every input at market', () => {
    const sheet = componentSheet(structure, 10, ledger, { unitPriceOf: prices });
    // 3 needed at 2 a run → 2 runs making 4; each run draws 50 + 7.
    expect(sheet).toMatchObject({
      name: 'Capital Armor Plates',
      label: 'Capital Component',
      blueprintTypeId: 110,
      activityId: 1,
      runs: 2,
      batch: 2,
      required: 3,
      makes: 4,
    });
    expect(sheet!.inputs).toEqual([
      { typeId: 20, name: 'Fernite Carbide', label: 'Reaction', quantity: 100, unitPrice: 40, value: 4_000, buildable: true },
      { typeId: 40, name: 'Tritanium', label: '', quantity: 14, unitPrice: 5, value: 70, buildable: false },
    ]);
    expect(sheet!.buildCost).toBe(4_070);
    expect(sheet!.installFee).toBeNull();
    expect(sheet!.buildPerUnit).toBe(4_070 / 4);
    expect(sheet!.buyPerUnit).toBe(9_000);
  });

  it('opens a deeper job with its own runs and activity', () => {
    // 100 Fernite Carbide at 40 a run → 3 runs making 120, burning 15 Fernite.
    const sheet = componentSheet(structure, 20, ledger, { unitPriceOf: prices });
    expect(sheet).toMatchObject({ activityId: 11, runs: 3, makes: 120, required: 100, buildCost: 30, buildPerUnit: 0.25 });
  });

  it('leaves the build cost open while an input is unpriced', () => {
    const sheet = componentSheet(structure, 10, ledger, { unitPriceOf: new Map([[20, 40]]) });
    expect(sheet!.buildCost).toBeNull();
    expect(sheet!.buildPerUnit).toBeNull();
    expect(sheet!.buyPerUnit).toBeNull();
  });

  it('is null for something the plan does not build', () => {
    expect(componentSheet(structure, 40, ledger, { unitPriceOf: prices })).toBeNull();
  });

  const charged = (runs: number, total: number | null): ComponentJobFee => ({
    typeId: 10,
    blueprintTypeId: 110,
    reaction: false,
    runs,
    systemId: 30004759,
    systemCostIndex: total === null ? null : 0.05,
    facilityTaxRate: 0.0025,
    fee: {
      estimatedItemValue: 0,
      jobGrossCost: total,
      facilityTax: 0,
      sccSurcharge: 0,
      total,
      missingSystemCostIndex: total === null,
      missingAdjustedPriceTypeIds: [],
    },
  });

  it('folds the job’s install fee into what a built unit costs', () => {
    const sheet = componentSheet(structure, 10, ledger, { unitPriceOf: prices, jobFee: charged(2, 130) });
    expect(sheet!.installFee).toEqual({ value: 130, systemId: 30004759, unpriced: [] });
    expect(sheet!.buildCost).toBe(4_070);
    expect(sheet!.buildPerUnit).toBe((4_070 + 130) / 4);
  });

  it('a fee charged on the share of a run one build draws scales to the job’s whole runs', () => {
    // 1.5 runs charged 97.5; the job's 2 whole runs cost 130.
    const sheet = componentSheet(structure, 10, ledger, { unitPriceOf: prices, jobFee: charged(1.5, 97.5) });
    expect(sheet!.installFee!.value).toBeCloseTo(130, 9);
  });

  it('a fee its system cannot price leaves a built unit open', () => {
    const sheet = componentSheet(structure, 10, ledger, { unitPriceOf: prices, jobFee: charged(2, null) });
    expect(sheet!.installFee).toEqual({ value: null, systemId: 30004759, unpriced: [] });
    expect(sheet!.buildPerUnit).toBeNull();
  });

  it('an input with no adjusted price counts as nothing in the fee, keeping the comparison', () => {
    const fees = computeComponentJobFees([{
      typeId: 10, blueprintTypeId: 110, runs: 2,
      baseMaterials: [{ typeId: 20, quantity: 100 }, { typeId: 40, quantity: 14 }],
    }], {
      activityOf: () => 1,
      siteOf: () => ({ systemId: 30004759, facilityTaxPct: null, costBonusPct: 0 }),
      costIndexOf: () => 0.05,
      adjustedPriceOf: (id) => id === 40 ? 5 : null,
    });
    const sheet = componentSheet(structure, 10, ledger, { unitPriceOf: prices, jobFee: fees.jobs[0] });
    expect(sheet!.installFee!.unpriced).toEqual(['Fernite Carbide']);
    expect(sheet!.buildCost).toBe(4_070);
    // 70 at 5%, plus the default 0.25% tax and 4% SCC.
    expect(sheet!.installFee!.value).toBeCloseTo(3.5 + 0.175 + 2.8, 9);
    expect(sheet!.buildPerUnit).toBeCloseTo((4_070 + 6.475) / 4, 9);
    expect(sheet!.buyPerUnit).toBe(9_000);
  });
});
