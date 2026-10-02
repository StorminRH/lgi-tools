import {
  computeNetMargin,
  DEFAULT_FEE_RATES,
  effectiveFacilityTaxRate,
  REACTION_SCC_SURCHARGE,
  type AdjustedPriceOf,
  type FeeRates,
} from '@/data/industry-math/fees';
import {
  computeBuildCost,
  computeMargin,
  type BuildCost,
  type PriceOf,
} from '@/data/industry-math/profitability';
import type { DepthBand, PriceSource, RegionalDiscount } from '@/data/market-prices/types';
import {
  computeBatchLedger,
  computeBatchMaterials,
  computeMarginalMaterials,
  computeMarginalRuns,
  feeJobs,
  type BatchLedger,
  type MeOptions,
} from './build-batch';
import { computeComponentJobFees, type ComponentFeeSources } from './component-job-fees';
import type { ConfidenceInput } from './industry-styles';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from './structure-bonus';
import type {
  BlueprintPricing,
  BlueprintStructure,
  BuildNode,
  BuildNodeDisplay,
  ComponentJobFees,
  IntermediatePrice,
  MaterialCostRow,
  NetMarginView,
} from './types';

export interface PriceLite {
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  buyDepth?: DepthBand[] | null;
  sellDepth?: DepthBand[] | null;
  regionalDiscount?: RegionalDiscount | null;
  source: PriceSource | null;
  staleAfterMs: number | null;
}

export type PriceLiteOf = (typeId: number) => PriceLite | undefined;

function productView(
  structure: BlueprintStructure,
  p: PriceLite | undefined,
): BlueprintPricing['product'] {
  return {
    typeId: structure.product.typeId,
    name: structure.product.name,
    quantityPerRun: structure.product.quantityPerRun,
    bestSell: p?.bestSell ?? null,
    pct5Sell: p?.pct5Sell ?? null,
    staleAfterMs: p?.staleAfterMs ?? null,
    buyDepth: p?.buyDepth ?? null,
    sellDepth: p?.sellDepth ?? null,
    regionalDiscount: p?.regionalDiscount ?? null,
  };
}

function rowPriceFields(p: PriceLite | undefined) {
  return {
    bestSell: p?.bestSell ?? null,
    pct5Buy: p?.pct5Buy ?? null,
    pct5Sell: p?.pct5Sell ?? null,
    buyVolume: p?.buyVolume ?? null,
    sellVolume: p?.sellVolume ?? null,
    source: p?.source ?? null,
    staleAfterMs: p?.staleAfterMs ?? null,
  };
}

export function collectIntermediateTypeIds(
  buildTree: BuildNode[],
  display: Record<number, BuildNodeDisplay>,
): number[] {
  const out = new Set<number>();
  const rootIds = new Set(buildTree.map((r) => r.typeId));
  const walk = (node: BuildNode) => {
    const d = display[node.typeId];
    if (!rootIds.has(node.typeId) && d && !d.isRaw) {
      out.add(node.typeId);
    }
    for (const input of node.inputs) walk(input);
  };
  for (const root of buildTree) walk(root);
  return [...out];
}

export function buildConfidenceInputs(pricing: BlueprintPricing): Map<number, ConfidenceInput> {
  const map = new Map<number, ConfidenceInput>();
  for (const r of pricing.rows) {
    map.set(r.typeId, {
      source: r.source,
      buyVolume: r.buyVolume,
      unitBuy: r.unitBuy,
      staleAfterMs: r.staleAfterMs,
    });
  }
  for (const ip of pricing.intermediatePrices) {
    map.set(ip.typeId, {
      source: ip.source,
      buyVolume: ip.buyVolume,
      unitBuy: ip.bestBuy,
      staleAfterMs: ip.staleAfterMs,
    });
  }
  return map;
}

export interface AssembleOptions {
  runs?: number;
  ledger?: BatchLedger;
  fee?: {
    adjustedPriceOf: AdjustedPriceOf;
    systemCostIndex: number | null;
    structureCostBonusPct?: number;
    facilityTaxPct?: number | null;
    reaction?: {
      systemCostIndex: number | null;
      facilityTaxPct?: number | null;
    };
    /** Where each job below the product's runs; without it only the product's own job is charged. */
    components?: Pick<ComponentFeeSources, 'siteOf' | 'costIndexOf'>;
  };
  meOf?: (blueprintTypeId: number) => number | undefined;
  structureMeFactorOf?: (blueprintTypeId: number) => number;
  basis?: 'batched' | 'marginal';
}

/**
 * The install fees of the jobs below the product's, at the runs the cost
 * basis counts: whole runs for the full line, the consumed share for one
 * build.
 */
function componentJobFees(
  structure: BlueprintStructure,
  fee: NonNullable<AssembleOptions['fee']>,
  bill: CostBill,
): ComponentJobFees | null {
  if (!fee.components) return null;
  const runsOf =
    bill.basis === 'marginal'
      ? computeMarginalRuns(structure.tree, bill.runs, bill.meOpts)
      : new Map(
          [...(bill.ledger ?? computeBatchLedger(structure.tree, bill.runs, bill.meOpts)).builds].map(
            ([typeId, build]) => [typeId, build.runs],
          ),
        );
  return computeComponentJobFees(feeJobs(structure.tree, runsOf), {
    ...fee.components,
    activityOf: (blueprintTypeId) => structure.nodeActivityByBlueprint[blueprintTypeId],
    adjustedPriceOf: fee.adjustedPriceOf,
  });
}

function computeNet(
  structure: BlueprintStructure,
  fee: AssembleOptions['fee'],
  bill: CostBill,
  productSell: number | null,
  outputUnits: number,
): NetMarginView | null {
  if (!fee) return null;
  const { runs } = bill;
  let systemCostIndex: number | null;
  let enteredTaxPct: number | null;
  let rates: FeeRates;
  let structureCostBonusPct: number;
  if (structure.activityId === MANUFACTURING_ACTIVITY) {
    systemCostIndex = fee.systemCostIndex;
    enteredTaxPct = fee.facilityTaxPct ?? null;
    rates = { ...DEFAULT_FEE_RATES, facilityTax: effectiveFacilityTaxRate(enteredTaxPct) };
    structureCostBonusPct = fee.structureCostBonusPct ?? 0;
  } else if (structure.activityId === REACTION_ACTIVITY && fee.reaction) {
    systemCostIndex = fee.reaction.systemCostIndex;
    enteredTaxPct = fee.reaction.facilityTaxPct ?? null;
    rates = {
      ...DEFAULT_FEE_RATES,
      facilityTax: effectiveFacilityTaxRate(enteredTaxPct),
      sccSurcharge: REACTION_SCC_SURCHARGE,
    };
    structureCostBonusPct = 0;
  } else {
    return null;
  }
  const baseMaterials = (structure.buildTree[0]?.inputs ?? []).map((i) => ({
    typeId: i.typeId,
    quantity: i.quantity * runs,
  }));
  const componentJobs = componentJobFees(structure, fee, bill);
  const result = computeNetMargin({
    buildCost: bill.buildCost.total,
    productSell,
    productQty: outputUnits,
    baseMaterials,
    adjustedPriceOf: fee.adjustedPriceOf,
    systemCostIndex,
    rates,
    structureCostBonusPct,
    componentJobFees: componentJobs?.total,
  });
  return {
    netMargin: result.netMargin,
    netMarginPct: result.netMarginPct,
    netCost: result.netCost,
    systemCostIndex,
    facilityTaxRate: rates.facilityTax,
    facilityTaxAssumed: enteredTaxPct === null,
    jobFee: result.jobFee,
    sellSide: result.sellSide,
    componentJobs,
  };
}

interface CostBill {
  basis: 'batched' | 'marginal';
  runs: number;
  meOpts: MeOptions;
  ledger: BatchLedger | undefined;
  rowsCost: BuildCost;
  buildCost: BuildCost;
  bases: { batched: number; marginal: number };
}

function resolveCostBills(
  structure: BlueprintStructure,
  runs: number,
  opts: AssembleOptions,
  buyOf: PriceOf,
): CostBill {
  const meOpts: MeOptions = {
    meOf: opts.meOf ?? (() => undefined),
    topBlueprintTypeId: structure.blueprintTypeId,
    structureMeFactorOf: opts.structureMeFactorOf,
  };
  const batchedMaterials = opts.ledger
    ? [...opts.ledger.raws.entries()].map(([typeId, quantity]) => ({ typeId, quantity }))
    : computeBatchMaterials(structure.tree, runs, meOpts);
  const rowsCost = computeBuildCost(batchedMaterials, buyOf);
  const marginalCost = computeBuildCost(
    computeMarginalMaterials(structure.tree, runs, meOpts),
    buyOf,
  );
  const basis = opts.basis ?? 'batched';
  const buildCost = basis === 'marginal' ? marginalCost : rowsCost;
  return {
    basis,
    runs,
    meOpts,
    ledger: opts.ledger,
    rowsCost,
    buildCost,
    bases: { batched: rowsCost.total, marginal: marginalCost.total },
  };
}

export function assemblePricing(
  structure: BlueprintStructure,
  priceOf: PriceLiteOf,
  opts: AssembleOptions = {},
): BlueprintPricing {
  const runs = opts.runs ?? 1;
  const buyOf: PriceOf = (typeId) => {
    const p = priceOf(typeId);
    return p ? { bestBuy: p.bestBuy, bestSell: p.bestSell } : undefined;
  };

  const bill = resolveCostBills(structure, runs, opts, buyOf);
  const { basis, rowsCost, buildCost, bases } = bill;
  const productPrice = priceOf(structure.product.typeId);
  const outputUnits = structure.product.quantityPerRun * runs;
  const margin = computeMargin({
    buildCost: buildCost.total,
    productSell: productPrice?.bestSell ?? null,
    productQty: outputUnits,
  });

  const rows: MaterialCostRow[] = rowsCost.perMaterial.map((c) => ({
    typeId: c.typeId,
    name: structure.materialNames[c.typeId] ?? `Type ${c.typeId}`,
    quantity: c.quantity,
    unitBuy: c.unitBuy,
    extendedCost: c.extendedCost,
    ...rowPriceFields(priceOf(c.typeId)),
  }));

  const intermediatePrices: IntermediatePrice[] = collectIntermediateTypeIds(
    structure.buildTree,
    structure.buildNodeDisplay,
  ).map((typeId) => ({
    typeId,
    bestBuy: priceOf(typeId)?.bestBuy ?? null,
    ...rowPriceFields(priceOf(typeId)),
  }));

  return {
    rows,
    intermediatePrices,
    product: productView(structure, productPrice),
    summary: {
      basis,
      bases,
      inputCost: buildCost.total,
      revenue: margin.revenue,
      margin: margin.margin,
      marginPct: margin.marginPct,
      incomplete:
        buildCost.missingTypeIds.length > 0 ||
        (productPrice?.bestSell ?? null) === null,
    },
    net: computeNet(structure, opts.fee, bill, productPrice?.bestSell ?? null, outputUnits),
  };
}
