// The asset ledger's owned/remaining row math (3.7.7.2), pulled out of NodeCard as
// a pure function so the subtraction + ISK derivation is unit-tested (the Humble
// Component pattern, like qty-ring's ringDash). Given the needed quantity, the
// owned quantity, and the row's needed ISK, it returns the formatted Owned +
// Remaining cells. Remaining clamps at 0 (owning more than a run needs leaves 0 to
// acquire); ISK is the cell quantity × the row's blended unit price (needed ISK ÷
// needed qty), and falls back to '—' when the row is unpriced — matching the
// "Total Needed" row's null-ISK contract.
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatQuantity } from '@/lib/format/number';

/**
 * Display-ready ledger cell produced by industry planner; values retain their domain units and
 * require no additional query by the renderer.
 */
export interface LedgerCell {
  qty: string;
  isk: string;
}

/** Compact needed-quantity for the ring centre (sub-unit marginal shares → "\<1"). */
export function ringQty(qty: number): string {
  if (qty > 0 && qty < 0.5) return '<1';
  return formatCompactQuantity(qty);
}

/**
 * The QTY ring's derived state: fill progress (owned ÷ needed, clamped), the
 * still-to-acquire count, whether the node is fully owned, the ring tone, and the
 * accessible label. Unowned (ownedQty absent) → the empty-track placeholder with
 * the whole need as the label, byte-identical to the pre-assets output.
 */
export interface QtyRingView {
  progress: number;
  remaining: number;
  complete: boolean;
  tone: 'isk' | 'neutral';
  ringLabel: string;
}

/** Derives the quantity-ring fraction and tone from required and available units. */
export function qtyRingView(name: string, qty: number, ownedQty?: number): QtyRingView {
  const progress = ownedQty !== undefined && qty > 0 ? Math.min(ownedQty / qty, 1) : 0;
  const remaining = Math.max(0, qty - (ownedQty ?? 0));
  // Fully owned needs synced data (ownedQty set), a real need (qty > 0, so a
  // degenerate zero-need node never shows a check), and nothing left to acquire.
  const complete = ownedQty !== undefined && qty > 0 && remaining === 0;
  const ringLabel =
    ownedQty === undefined
      ? `${name}: ${formatQuantity(qty)} needed`
      : complete
        ? `${name}: all ${formatQuantity(qty)} owned`
        : `${name}: ${formatQuantity(remaining)} still needed`;
  return { progress, remaining, complete, tone: progress > 0 ? 'isk' : 'neutral', ringLabel };
}

/**
 * The asset ledger's rendered cells: the always-real Needed row (qty + ISK, ISK
 * '—' when unpriced) plus the Owned + Remaining cells, null when there's no
 * synced quantity (the "—" placeholders a logged-out / owns-none caller shows).
 */
export interface AssetLedgerView {
  neededQty: string;
  neededIsk: string;
  owned: LedgerCell | null;
  remaining: LedgerCell | null;
}

/** Builds display rows comparing required material quantities with owned assets across eligible locations. */
export function assetLedgerView(
  qty: number,
  value: number | null,
  ownedQty?: number,
): AssetLedgerView {
  const row = ownedQty !== undefined ? ownedLedgerRow(qty, ownedQty, value) : null;
  return {
    neededQty: formatQuantity(qty),
    neededIsk: value !== null ? formatIsk(value) : '—',
    owned: row ? row.owned : null,
    remaining: row ? row.remaining : null,
  };
}

/** Builds one owned-material ledger row with required, available, missing, and source quantities in units. */
export function ownedLedgerRow(
  qty: number,
  ownedQty: number,
  value: number | null,
): { owned: LedgerCell; remaining: LedgerCell } {
  const remaining = Math.max(0, qty - ownedQty);
  const unitPrice = value !== null && qty > 0 ? value / qty : null;
  const iskOf = (units: number): string => (unitPrice !== null ? formatIsk(units * unitPrice) : '—');
  return {
    owned: { qty: formatQuantity(ownedQty), isk: iskOf(ownedQty) },
    remaining: { qty: formatQuantity(remaining), isk: iskOf(remaining) },
  };
}
