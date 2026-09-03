import { REACTION_NODE_LABEL } from './industry-styles';
import type { ConsolidatedItem, ConsolidatedTier } from './build-consolidate';

export interface BuildFocus {
  depth: number;
  typeId: number;
}

export interface TierRowView {
  item: ConsolidatedItem;

  qty: number;
  value: number | null;
  selected: boolean;
  related: boolean;
  faded: boolean;
}

export function tierColumnView(
  tier: ConsolidatedTier,
  ctx: {
    focus: BuildFocus | null;
    inChain: Set<number> | null;
    actualLevel: Map<number, number> | null;
    unitPriceOf: Map<number, number | null>;
  },
): { rows: TierRowView[]; subtotal: number } {
  const valueOf = (typeId: number, qty: number): number | null => {
    const unit = ctx.unitPriceOf.get(typeId) ?? null;
    return unit !== null ? qty * unit : null;
  };
  const rows = tier.items.map((item): TierRowView => {
    const selected =
      ctx.focus !== null && ctx.focus.typeId === item.typeId && ctx.focus.depth === tier.depth;
    const related = !selected && (ctx.inChain?.has(item.typeId) ?? false);
    const faded = ctx.focus !== null && !selected && !related;
    const qty = (related ? ctx.actualLevel?.get(item.typeId) : undefined) ?? item.quantity;
    return { item, qty, value: valueOf(item.typeId, qty), selected, related, faded };
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

export function levelAt<T>(
  map: Map<number, T> | null,
  focus: BuildFocus | null,
  tierDepth: number,
): T | null {
  return focus !== null && map !== null ? (map.get(tierDepth - focus.depth) ?? null) : null;
}
