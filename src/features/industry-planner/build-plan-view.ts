import { REACTION_NODE_LABEL } from './industry-styles';
import type { ConsolidatedItem, ConsolidatedTier } from './build-consolidate';

export interface TierRowView {
  item: ConsolidatedItem;
  qty: number;
  value: number | null;
  /** In the chain of the buildable under the pointer. */
  lit: boolean;
  /** Outside that chain while one is lit. */
  dimmed: boolean;
}

export function tierColumnView(
  tier: ConsolidatedTier,
  ctx: { unitPriceOf: Map<number, number | null>; lit: ReadonlySet<number> | null },
): { rows: TierRowView[]; subtotal: number } {
  const rows = tier.items.map((item): TierRowView => {
    const unit = ctx.unitPriceOf.get(item.typeId) ?? null;
    const lit = ctx.lit?.has(item.typeId) ?? false;
    return {
      item,
      qty: item.quantity,
      value: unit !== null ? item.quantity * unit : null,
      lit,
      dimmed: ctx.lit !== null && !lit,
    };
  });
  const subtotal = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  return { rows, subtotal };
}

export function unitPriceMap(
  pricing: {
    rows: { typeId: number; unitBuy: number | null }[];
    intermediatePrices: { typeId: number; bestSell: number | null; bestBuy: number | null }[];
  } | null,
): Map<number, number | null> {
  const m = new Map<number, number | null>();
  if (pricing) {
    for (const r of pricing.rows) m.set(r.typeId, r.unitBuy);
    for (const ip of pricing.intermediatePrices) m.set(ip.typeId, ip.bestSell ?? ip.bestBuy);
  }
  return m;
}

export function isEfficiencyEligible(
  blueprintTypeId: number | undefined,
  label: string | undefined,
): blueprintTypeId is number {
  return blueprintTypeId !== undefined && label !== REACTION_NODE_LABEL;
}
