import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity, formatQuantity } from '@/lib/format/number';

export interface LedgerCell {
  qty: string;
  isk: string;
}

export function ringQty(qty: number): string {
  if (qty > 0 && qty < 0.5) return '<1';
  return formatCompactQuantity(qty);
}

export interface QtyRingView {
  progress: number;
  remaining: number;
  complete: boolean;
  tone: 'isk' | 'neutral';
  ringLabel: string;
}

export function qtyRingView(name: string, qty: number, ownedQty?: number): QtyRingView {
  const progress = ownedQty !== undefined && qty > 0 ? Math.min(ownedQty / qty, 1) : 0;
  const remaining = Math.max(0, qty - (ownedQty ?? 0));
  const complete = ownedQty !== undefined && qty > 0 && remaining === 0;
  const ringLabel =
    ownedQty === undefined
      ? `${name}: ${formatQuantity(qty)} needed`
      : complete
        ? `${name}: all ${formatQuantity(qty)} owned`
        : `${name}: ${formatQuantity(remaining)} still needed`;
  return { progress, remaining, complete, tone: progress > 0 ? 'isk' : 'neutral', ringLabel };
}

export interface AssetLedgerView {
  neededQty: string;
  neededIsk: string;
  owned: LedgerCell | null;
  remaining: LedgerCell | null;
}

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
