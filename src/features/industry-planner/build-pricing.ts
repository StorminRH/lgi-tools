import {
  computeBuildCost,
  computeMargin,
  type PriceOf,
} from '@/data/industry-math/profitability';
import type { PriceSource } from '@/data/market-prices/types';
import type { ConfidenceInput } from './industry-styles';
import type {
  BlueprintPricing,
  BlueprintStructure,
  BuildNode,
  BuildNodeDisplay,
  IntermediatePrice,
  MaterialCostRow,
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

export function assemblePricing(
  structure: BlueprintStructure,
  priceOf: PriceLiteOf,
): BlueprintPricing {
  const buyOf: PriceOf = (typeId) => {
    const p = priceOf(typeId);
    return p ? { bestBuy: p.bestBuy, bestSell: p.bestSell } : undefined;
  };

  const buildCost = computeBuildCost(structure.flatMaterials, buyOf);
  const productPrice = priceOf(structure.product.typeId);
  const margin = computeMargin({
    buildCost: buildCost.total,
    productSell: productPrice?.bestSell ?? null,
    productQty: structure.product.quantityPerRun,
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
  };
}
