import type { DegradationCallerCount } from './types';

/** Degraded price reads in a range: who fell back, and how often the ESI budget ran out. */
export interface PriceSourceDegradation {
  /** Callers that recorded themselves, most degraded reads first. */
  byCaller: DegradationCallerCount[];
  /** Degraded reads that hit an exhausted ESI budget, whoever the caller. */
  budgetExhaustions: number;
}

/** One grouped row of degraded price reads; the caller is null when none was recorded. */
export interface DegradationRow {
  caller: string | null;
  count: number;
  budgetExhausted: number;
}

function byCountThenCaller(a: DegradationCallerCount, b: DegradationCallerCount): number {
  if (a.count !== b.count) return b.count - a.count;
  return a.caller < b.caller ? -1 : 1;
}

export function priceSourceDegradation(rows: readonly DegradationRow[]): PriceSourceDegradation {
  const byCaller = rows
    .filter((row): row is DegradationRow & { caller: string } => row.caller !== null)
    .map((row) => ({ caller: row.caller, count: Number(row.count) }))
    .sort(byCountThenCaller);
  const budgetExhaustions = rows.reduce((total, row) => total + Number(row.budgetExhausted), 0);
  return { byCaller, budgetExhaustions };
}
