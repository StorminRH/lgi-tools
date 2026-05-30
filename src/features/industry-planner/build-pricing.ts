import {
  computeBuildCost,
  computeMargin,
  type PriceOf,
} from '@/data/industry-math/profitability';
import type {
  BlueprintPricing,
  BlueprintStructure,
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
  updatedAtMs: number | null;
}

export type PriceLiteOf = (typeId: number) => PriceLite | undefined;

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
      updatedAtMs: p?.updatedAtMs ?? null,
    };
  });

  return {
    rows,
    product: {
      typeId: structure.product.typeId,
      name: structure.product.name,
      quantityPerRun: structure.product.quantityPerRun,
      bestSell: productPrice?.bestSell ?? null,
      updatedAtMs: productPrice?.updatedAtMs ?? null,
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
