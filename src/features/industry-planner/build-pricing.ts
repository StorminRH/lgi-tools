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
  computeBatchMaterials,
  computeBatchMaterialsWithMe,
  computeMarginalMaterials,
} from './build-batch';
import type { ConfidenceInput } from './industry-styles';
import { REACTION_ACTIVITY } from './structure-bonus';
import type {
  BlueprintPricing,
  BlueprintStructure,
  BuildNode,
  BuildNodeDisplay,
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

export const MANUFACTURING_ACTIVITY_ID = 1;

export interface AssembleOptions {
  runs?: number;
  fee?: {
    adjustedPriceOf: AdjustedPriceOf;
    systemCostIndex: number | null;
    structureCostBonusPct?: number;
    facilityTaxPct?: number | null;
    reaction?: {
      systemCostIndex: number | null;
      facilityTaxPct?: number | null;
    };
  };
  meOf?: (blueprintTypeId: number) => number | undefined;
  structureMeFactorOf?: (blueprintTypeId: number) => number;
  basis?: 'batched' | 'marginal';
}

function computeNet(
  structure: BlueprintStructure,
  fee: AssembleOptions['fee'],
  runs: number,
  buildCost: number,
  productSell: number | null,
  outputUnits: number,
): NetMarginView | null {
  if (!fee) return null;
  let systemCostIndex: number | null;
  let enteredTaxPct: number | null;
  let rates: FeeRates;
  let structureCostBonusPct: number;
  if (structure.activityId === MANUFACTURING_ACTIVITY_ID) {
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
  const result = computeNetMargin({
    buildCost,
    productSell,
    productQty: outputUnits,
    baseMaterials,
    adjustedPriceOf: fee.adjustedPriceOf,
    systemCostIndex,
    rates,
    structureCostBonusPct,
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
  };
}

function resolveCostBills(
  structure: BlueprintStructure,
  runs: number,
  opts: AssembleOptions,
  buyOf: PriceOf,
): {
  basis: 'batched' | 'marginal';
  rowsCost: BuildCost;
  buildCost: BuildCost;
  bases: { batched: number; marginal: number };
} {
  const meOpts =
    opts.meOf || opts.structureMeFactorOf
      ? {
          meOf: opts.meOf ?? (() => undefined),
          topBlueprintTypeId: structure.blueprintTypeId,
          structureMeFactorOf: opts.structureMeFactorOf,
        }
      : undefined;
  const batchedMaterials = meOpts
    ? computeBatchMaterialsWithMe(structure.tree, runs, meOpts)
    : computeBatchMaterials(structure.tree, runs);
  const rowsCost = computeBuildCost(batchedMaterials, buyOf);
  const marginalCost = computeBuildCost(
    computeMarginalMaterials(structure.tree, runs, meOpts),
    buyOf,
  );
  const basis = opts.basis ?? 'batched';
  const buildCost = basis === 'marginal' ? marginalCost : rowsCost;
  return {
    basis,
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

  const { basis, rowsCost, buildCost, bases } = resolveCostBills(structure, runs, opts, buyOf);
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
    net: computeNet(
      structure,
      opts.fee,
      runs,
      buildCost.total,
      productPrice?.bestSell ?? null,
      outputUnits,
    ),
  };
}
