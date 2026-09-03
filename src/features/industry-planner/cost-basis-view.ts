export type CostBasis = 'batched' | 'marginal';

export function batchedCostOfRows(rows: { extendedCost: number | null }[]): number {
  return rows.reduce((sum, r) => sum + (r.extendedCost ?? 0), 0);
}
