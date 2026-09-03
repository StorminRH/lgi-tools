export interface MaterialQty {
  typeId: number;
  quantity: number;
}

export interface MaterialPrice {
  bestBuy: number | null;
  bestSell: number | null;
}

export type PriceOf = (typeId: number) => MaterialPrice | undefined;

export interface MaterialCost {
  typeId: number;
  quantity: number;
  unitBuy: number | null;
  extendedCost: number | null;
}

export interface BuildCost {
  total: number;
  perMaterial: MaterialCost[];
  missingTypeIds: number[];
}

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
  buildCost: number;
  productSell: number | null;
  productQty: number;
}

export interface Margin {
  revenue: number | null;
  cost: number;
  margin: number | null;
  marginPct: number | null;
}

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
