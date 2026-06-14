import { computeNetMargin, type AdjustedPriceOf } from '@/data/industry-math/fees';
import {
  computeBuildCost,
  computeMargin,
  type PriceOf,
} from '@/data/industry-math/profitability';
import type { PriceSource } from '@/data/market-prices/types';
import { computeBatchMaterials } from './build-batch';
import type { ConfidenceInput } from './industry-styles';
import type {
  BlueprintPricing,
  BlueprintStructure,
  BuildNode,
  BuildNodeDisplay,
  IntermediatePrice,
  MaterialCostRow,
  NetMarginView,
} from './types';

// Assemble the priced cost-panel view from a blueprint's structure and a price
// lookup. Pure and dependency-free (the pure math lives in industry-math), so
// both sides of the planner share ONE assembly path: the server query builds it
// from the DB price snapshot, and the client rebuilds it from live on-demand
// prices after a refresh. Same inputs → same margin, no drift between them.

export interface PriceLite {
  bestBuy: number | null;
  bestSell: number | null;
  pct5Buy: number | null;
  pct5Sell: number | null;
  // Order-book depth on each side + provenance, carried so the feature can
  // judge price confidence (liquidity + source), not just cost. Volumes are
  // narrowed from the DB bigint to number for the RSC boundary (real depths
  // are far under 2^53).
  buyVolume: number | null;
  sellVolume: number | null;
  source: PriceSource | null;
  // Epoch millis of the row's stale_after — the staleness signal the client
  // uses to decide what to refresh. Null when there is no price row at all.
  staleAfterMs: number | null;
}

export type PriceLiteOf = (typeId: number) => PriceLite | undefined;

// The buildable intermediates in a build tree — every non-raw node except the
// root products (the products are shown as block headers / the hero, not as
// priceable rows). Deduped by typeId, since a component shared across parents
// appears many times but needs pricing once. Drives the cascade's per-row
// build-vs-buy confidence badge.
export function collectIntermediateTypeIds(
  buildTree: BuildNode[],
  display: Record<number, BuildNodeDisplay>,
): number[] {
  const out = new Set<number>();
  const rootIds = new Set(buildTree.map((r) => r.typeId));
  const walk = (node: BuildNode) => {
    if (!rootIds.has(node.typeId) && display[node.typeId] && !display[node.typeId].isRaw) {
      out.add(node.typeId);
    }
    for (const input of node.inputs) walk(input);
  };
  for (const root of buildTree) walk(root);
  return [...out];
}

// The per-typeId confidence inputs for every cascade row a badge can attach to:
// the priced raw materials (`rows`) plus the buildable intermediates. Pure, so
// the provider derives the same map server- and client-side.
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

// The manufacturing activity id — net margin is computed for manufacturing
// blueprints only in v1 (reactions use a different SCC than the 4% default, so
// their pages stay gross-only). The gate lives here so the math can never show a
// manufacturing-rate net on a reaction, even if a caller passes fee inputs.
const MANUFACTURING_ACTIVITY_ID = 1;

export interface AssembleOptions {
  // Whole runs of the top product to build. Scales the batch cost basis, the
  // revenue (output units = quantityPerRun × runs), and the EIV base. Default 1.
  runs?: number;
  // Present once a build location is picked — the adapter feeds the net-margin
  // leaf. `systemCostIndex` is the activity-matched index (null when the system
  // has no stored index). Omitted on the gross-only path (server seed / no
  // location), so `assemblePricing(structure, priceOf)` is byte-identical gross.
  fee?: { adjustedPriceOf: AdjustedPriceOf; systemCostIndex: number | null };
}

// Net margin for the FINAL build job only (3.5.2b "top job"). Null unless a
// build location was supplied AND this is a manufacturing blueprint. The fee
// covers the top job's installation fee; intermediate component jobs are not yet
// charged — surfaced as "(excl. sub-job fees)" in the UI. Null-honesty is the
// leaf's: a null index nulls the install-fee total but keeps facility/SCC; a
// missing adjusted price is flagged, never zeroed.
function computeNet(
  structure: BlueprintStructure,
  fee: AssembleOptions['fee'],
  runs: number,
  buildCost: number,
  productSell: number | null,
  outputUnits: number,
): NetMarginView | null {
  if (!fee || structure.activityId !== MANUFACTURING_ACTIVITY_ID) return null;
  // The top product's DIRECT ME0 inputs, scaled to `runs`. EIV scales linearly
  // with runs, so a per-run base × runs is the correct top-job EIV basis.
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
    systemCostIndex: fee.systemCostIndex,
  });
  return {
    netMargin: result.netMargin,
    netMarginPct: result.netMarginPct,
    netCost: result.netCost,
    systemCostIndex: fee.systemCostIndex,
    jobFee: result.jobFee,
    sellSide: result.sellSide,
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

  // Cost basis is the whole-run batch total scaled to `runs` — what you must buy
  // from an empty hangar to build `runs` runs — not the resolver's marginal flat
  // list. Re-derived per request from the tree.
  const buildCost = computeBuildCost(computeBatchMaterials(structure.tree, runs), buyOf);
  const productPrice = priceOf(structure.product.typeId);
  // Output units = per-run yield × runs. Revenue is per output unit, never per
  // run — runs only drives the batch material walk above.
  const outputUnits = structure.product.quantityPerRun * runs;
  const margin = computeMargin({
    buildCost: buildCost.total,
    productSell: productPrice?.bestSell ?? null,
    productQty: outputUnits,
  });

  const rows: MaterialCostRow[] = buildCost.perMaterial.map((c) => {
    const p = priceOf(c.typeId);
    return {
      typeId: c.typeId,
      name: structure.materialNames[c.typeId] ?? `Type ${c.typeId}`,
      quantity: c.quantity,
      unitBuy: c.unitBuy,
      extendedCost: c.extendedCost,
      bestSell: p?.bestSell ?? null,
      pct5Buy: p?.pct5Buy ?? null,
      pct5Sell: p?.pct5Sell ?? null,
      buyVolume: p?.buyVolume ?? null,
      sellVolume: p?.sellVolume ?? null,
      source: p?.source ?? null,
      staleAfterMs: p?.staleAfterMs ?? null,
    };
  });

  const intermediatePrices: IntermediatePrice[] = collectIntermediateTypeIds(
    structure.buildTree,
    structure.buildNodeDisplay,
  ).map((typeId) => {
    const p = priceOf(typeId);
    return {
      typeId,
      bestBuy: p?.bestBuy ?? null,
      bestSell: p?.bestSell ?? null,
      pct5Buy: p?.pct5Buy ?? null,
      pct5Sell: p?.pct5Sell ?? null,
      buyVolume: p?.buyVolume ?? null,
      sellVolume: p?.sellVolume ?? null,
      source: p?.source ?? null,
      staleAfterMs: p?.staleAfterMs ?? null,
    };
  });

  return {
    rows,
    intermediatePrices,
    product: {
      typeId: structure.product.typeId,
      name: structure.product.name,
      quantityPerRun: structure.product.quantityPerRun,
      bestSell: productPrice?.bestSell ?? null,
      staleAfterMs: productPrice?.staleAfterMs ?? null,
    },
    summary: {
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
