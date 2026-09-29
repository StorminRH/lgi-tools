import { type BatchSize, DEFAULT_ASSUMPTIONS, type ResearchAssumptions } from './research-insight';

const STORAGE_KEY = 'lgi:industry:research-assumptions';
const BATCHES: readonly BatchSize[] = ['run', 'slotDay', 'slotWeek'];

export const MARKET_SHARE_OPTIONS = [0.05, 0.1, 0.2, 0.35] as const;
export const MAX_FEE_PCT = 15;

function pct(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_FEE_PCT ? value : fallback;
}

/** Stored assumptions, with anything missing or out of range left at its default. */
export function parseAssumptions(raw: string | null): ResearchAssumptions {
  if (raw === null) return DEFAULT_ASSUMPTIONS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_ASSUMPTIONS;
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_ASSUMPTIONS;
  const r = value as Record<string, unknown>;
  const share = r.marketShare;
  return {
    batch: BATCHES.find((batch) => batch === r.batch) ?? DEFAULT_ASSUMPTIONS.batch,
    marketShare:
      typeof share === 'number' && share > 0 && share <= 1 ? share : DEFAULT_ASSUMPTIONS.marketShare,
    salesTaxPct: pct(r.salesTaxPct, DEFAULT_ASSUMPTIONS.salesTaxPct),
    brokerFeePct: pct(r.brokerFeePct, DEFAULT_ASSUMPTIONS.brokerFeePct),
  };
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readAssumptions(): ResearchAssumptions {
  return parseAssumptions(storage()?.getItem(STORAGE_KEY) ?? null);
}

export function writeAssumptions(assumptions: ResearchAssumptions): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(assumptions));
  } catch {
    // Storage full or blocked: the assumptions still apply for this visit.
  }
}
