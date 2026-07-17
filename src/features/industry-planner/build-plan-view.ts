// Pure view logic for the Cockpit build plan (CockpitBuildPlan), extracted so the
// per-tier row derivation (which cell is lit, its displayed quantity, its value,
// the column subtotal), the unit-price map, and the small dispatch decisions are
// unit-tested and the component stays a render shell.

import { REACTION_NODE_LABEL } from './industry-styles';
import type { ConsolidatedItem, ConsolidatedTier } from './build-consolidate';

/** The current drill focus: a buildable at a given tier depth. */
export interface BuildFocus {
  depth: number;
  typeId: number;
}

/**
 * Display-ready tier row state for industry planner; consumers can render it without
 * reconstructing storage or domain policy.
 */
export interface TierRowView {
  item: ConsolidatedItem;
  // The displayed quantity: a lit downstream cell shows the ACTUAL consumed
  // amount (marginal); every other cell shows the whole-run batch.
  qty: number;
  value: number | null;
  selected: boolean;
  related: boolean;
  faded: boolean;
}

/**
 * The rows of one tier column plus its ISK subtotal. A focused drill-down lights
 * the downstream chain: the selected node, its `related` descendants (shown at
 * their actual consumed quantity), and everything else `faded`. The subtotal sums
 * each row's DISPLAYED value, so the column header always equals its visible rows.
 */
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

/**
 * Unit market price per type: raws at best buy (the cost basis), buildable
 * intermediates at best sell (the build-vs-buy acquisition price). A type is
 * either a raw or a buildable, so the keys never collide.
 */
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

/**
 * Whether a node shows the ME/TE efficiency adjusters: a manufacturable buildable
 * only. Raws (no producing blueprint) and reactions (can't be researched) get a
 * plain, frameless icon. A type guard so the caller narrows the blueprint id.
 */
export function isEfficiencyEligible(
  blueprintTypeId: number | undefined,
  label: string | undefined,
): blueprintTypeId is number {
  return blueprintTypeId !== undefined && label !== REACTION_NODE_LABEL;
}

/**
 * A tier column's lit-chain slice for a relative depth below the focus, or null
 * when nothing is focused (or the map lacks that depth).
 */
export function levelAt<T>(
  map: Map<number, T> | null,
  focus: BuildFocus | null,
  tierDepth: number,
): T | null {
  return focus !== null && map !== null ? (map.get(tierDepth - focus.depth) ?? null) : null;
}
