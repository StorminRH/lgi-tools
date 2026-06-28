// The asset ledger's owned/remaining row math (3.7.7.2), pulled out of NodeCard as
// a pure function so the subtraction + ISK derivation is unit-tested (the Humble
// Component pattern, like qty-ring's ringDash). Given the needed quantity, the
// owned quantity, and the row's needed ISK, it returns the formatted Owned +
// Remaining cells. Remaining clamps at 0 (owning more than a run needs leaves 0 to
// acquire); ISK is the cell quantity × the row's blended unit price (needed ISK ÷
// needed qty), and falls back to '—' when the row is unpriced — matching the
// "Total Needed" row's null-ISK contract.
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';

export interface LedgerCell {
  qty: string;
  isk: string;
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
