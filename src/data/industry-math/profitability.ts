// Pure profitability math for the Industry Planner.
//
// Dependency-free by design: this module knows nothing about the eve-data or
// market-prices slices. Callers (the industry-planner feature) adapt their
// rows into these plain inputs. Keeping the math a self-contained leaf means a
// future feature can reuse it without one data slice importing another
// (eve-data ⊥ market-prices; cross-slice
// composition lives a layer above, in the feature).
//
// Pricing convention: material cost basis is Jita
// best *buy* (you place buy orders for your inputs); output revenue basis is
// Jita best *sell* (you place sell orders for your product). Margin is
// before job/install fees — those land in 3.1.

export interface MaterialQty {
  typeId: number;
  quantity: number;
}

/**
 * The minimal price view the math needs. Both sides nullable — null means "no
 * orders on that side at the last refresh", which makes that line's cost or
 * revenue unknown rather than zero.
 */
export interface MaterialPrice {
  bestBuy: number | null;
  bestSell: number | null;
}

/**
 * Type ID → price, or undefined when the type has no market_prices row at all.
 * Undefined and a present row with a null bestBuy are both "unpriced" for cost.
 */
export type PriceOf = (typeId: number) => MaterialPrice | undefined;

export interface MaterialCost {
  typeId: number;
  quantity: number;
  unitBuy: number | null; // best buy used as the per-unit material cost
  extendedCost: number | null; // quantity × unitBuy, or null when unpriced
}

export interface BuildCost {
  total: number; // sum of the priced extendedCost lines (unpriced lines excluded)
  perMaterial: MaterialCost[];
  missingTypeIds: number[]; // materials with no usable buy price
}

/**
 * Input cost = Σ quantity × best buy. A material with no row, or a null
 * bestBuy, contributes 0 to the total and is flagged in missingTypeIds so the
 * UI can mark the estimate "incomplete" rather than silently undercount it.
 */
export function computeBuildCost(
  materials: MaterialQty[],
  priceOf: PriceOf,
): BuildCost {
  const perMaterial: MaterialCost[] = [];
  const missingTypeIds: number[] = [];
  let total = 0;

  for (const m of materials) {
    const unitBuy = priceOf(m.typeId)?.bestBuy ?? null;
    if (unitBuy === null) {
      missingTypeIds.push(m.typeId);
      perMaterial.push({
        typeId: m.typeId,
        quantity: m.quantity,
        unitBuy: null,
        extendedCost: null,
      });
      continue;
    }
    const extendedCost = unitBuy * m.quantity;
    total += extendedCost;
    perMaterial.push({
      typeId: m.typeId,
      quantity: m.quantity,
      unitBuy,
      extendedCost,
    });
  }

  return { total, perMaterial, missingTypeIds };
}

export interface MarginInput {
  buildCost: number; // BuildCost.total
  productSell: number | null; // product best sell (revenue basis)
  productQty: number; // units produced per run
}

export interface Margin {
  revenue: number | null;
  cost: number;
  margin: number | null; // revenue − cost
  marginPct: number | null; // margin / revenue × 100; null when revenue unknown or ≤ 0
}

/**
 * Output revenue = best sell × units produced per run. Returns a null revenue
 * (and null margin) when the product has no sell price, so the UI can show
 * "—" instead of treating an unpriced product as a total loss.
 */
export function computeMargin({
  buildCost,
  productSell,
  productQty,
}: MarginInput): Margin {
  if (productSell === null) {
    return { revenue: null, cost: buildCost, margin: null, marginPct: null };
  }
  const revenue = productSell * productQty;
  const margin = revenue - buildCost;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : null;
  return { revenue, cost: buildCost, margin, marginPct };
}
