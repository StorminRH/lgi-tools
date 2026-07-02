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
  type PriceOf,
} from '@/data/industry-math/profitability';
import type { DepthBand, PriceSource } from '@/data/market-prices/types';
import { computeBatchMaterials, computeBatchMaterialsWithMe } from './build-batch';
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
  // Near-touch depth ladders per side (3.5.3b), carried so the product's
  // Market Score reads its liquidity from the same lookup the live refresh
  // already populates (RefreshedPrice carries these). Optional because only the
  // product consumes depth — material/intermediate lookups omit it. Null = no
  // orders on that side / Fuzzwork fallback.
  buyDepth?: DepthBand[] | null;
  sellDepth?: DepthBand[] | null;
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

// The manufacturing activity id. Net margin is computed for manufacturing AND
// reaction top jobs (3.7.13.3) — each against its own cost index and facility
// tax; reactions share the 4% SCC (the 2025-07 rework cut research only, so the
// old "different SCC" rationale is gone — reactions were blocked on the missing
// reaction-index seam, now live). The activity gate lives here so the math can
// never fee a reaction at the manufacturing index: a reaction blueprint without
// reaction fee inputs stays gross-only.
// Exported so the hero gates the build-location selector on the same value.
export const MANUFACTURING_ACTIVITY_ID = 1;

export interface AssembleOptions {
  // Whole runs of the top product to build. Scales the batch cost basis, the
  // revenue (output units = quantityPerRun × runs), and the EIV base. Default 1.
  runs?: number;
  // Present once a build location is picked — the adapter feeds the net-margin
  // leaf. `systemCostIndex` is the BUILD system's manufacturing index (null when
  // the system has no stored index). `structureCostBonusPct` is the selected
  // manufacturing structure's job-cost reduction (3.7.9.1.3, 0 with no
  // structure). `facilityTaxPct` is the build-slot structure's owner-entered
  // facility tax PERCENT (3.7.13.3) — null/omitted = never entered, so the fee
  // charges the 0.25% NPC baseline and byte-identical numbers. Omitted on the
  // gross-only path (server seed / no location), so
  // `assemblePricing(structure, priceOf)` is byte-identical gross.
  //
  // `reaction` is the sibling for a REACTION blueprint's top job (3.7.13.3, the
  // #187 seam live): the REACTION host system's 'reaction' index + the reaction
  // host structure's entered tax. Absent ⇒ a reaction blueprint stays gross-only
  // (the pre-3.7.13.3 behavior), even when the manufacturing keys are supplied —
  // the gate's safety property: reactions can never fee at the manufacturing
  // index.
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
  // Per-blueprint owned-ME lookup (3.7.5.2). Present only on the client once the
  // player's owned blueprints have loaded — it ME-reduces the cost-basis material
  // quantities at each buildable's owned ME. Omitted on the server seed and the
  // no-owned-data client path, so the gross cost basis is byte-identical (every
  // lookup → undefined → ME0). The net-margin EIV base stays ME0 regardless.
  meOf?: (blueprintTypeId: number) => number | undefined;
  // Per-node structure material factor (3.7.9.1.3) — the (1 − structureMe/100) a
  // selected build structure applies to a manufacturing node. Composes into the
  // cost-basis materials alongside owned ME (one round at the end, in meAdjust);
  // omitted / returning 1 ⇒ the basis is byte-identical to the no-structure path.
  structureMeFactorOf?: (blueprintTypeId: number) => number;
}

// Net margin for the FINAL build job only (3.5.2b "top job"). Null unless fee
// inputs were supplied AND this is a manufacturing or reaction blueprint (each
// activity against its own index + facility tax; intermediate component jobs
// are still not charged — the deferred full-tree walk). Null-honesty is the
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
    // Refineries carry no ISK cost bonus for reactions (game fact; the mfg-only
    // structureCostBonusPct never applies here).
    structureCostBonusPct = 0;
  } else {
    // A reaction blueprint without reaction fee inputs (gross-only, the safety
    // gate), or an activity the fee path doesn't cover.
    return null;
  }
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
  // list. Re-derived per request from the tree. With an owned-ME lookup the
  // material quantities are reduced at each buildable's owned ME; without one
  // (server seed / no owned data) this is the byte-identical ME0 cost basis.
  const materials =
    opts.meOf || opts.structureMeFactorOf
      ? computeBatchMaterialsWithMe(structure.tree, runs, {
          meOf: opts.meOf ?? (() => undefined),
          topBlueprintTypeId: structure.blueprintTypeId,
          structureMeFactorOf: opts.structureMeFactorOf,
        })
      : computeBatchMaterials(structure.tree, runs);
  const buildCost = computeBuildCost(materials, buyOf);
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
      buyDepth: productPrice?.buyDepth ?? null,
      sellDepth: productPrice?.sellDepth ?? null,
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
