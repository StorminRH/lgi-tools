// Presentation logic for the input-cost basis toggle (Raw|Item, 3.7.21.1) —
// pure and tested; the tile in CockpitKpis is the humble shell. "Raw" is the
// batched empty-hangar buy list (today's basis), "Item" the marginal consumed
// bill.

export type CostBasis = 'batched' | 'marginal';

// The batched (Raw) input cost, re-derived from the priced rows: the rows are
// ALWAYS the batched bill regardless of the summary's basis, and an unpriced
// line contributes 0 — the same missing-price honesty as computeBuildCost. The
// raw-ledger header sums to the list it opens through this.
export function batchedCostOfRows(rows: { extendedCost: number | null }[]): number {
  return rows.reduce((sum, r) => sum + (r.extendedCost ?? 0), 0);
}
