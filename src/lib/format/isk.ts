/**
 * Decimal places per tier, tiered on the magnitude so negatives scale like
 * positives. Without `unscaled`, the K tier also takes every value below 1K.
 */
interface IskTiers {
  readonly b: number;
  readonly m: number;
  readonly k: number;
  readonly unscaled?: number;
}

const FULL: IskTiers = { b: 2, m: 2, k: 1, unscaled: 2 };
const SHORT: IskTiers = { b: 1, m: 1, k: 0 };
const COMPACT: IskTiers = { b: 1, m: 0, k: 0 };

/** Whether `abs / divisor` rounds to 1000 or more at `digits`, so the next tier up carries it. */
function roundsToNextTier(abs: number, divisor: number, digits: number): boolean {
  return Number((abs / divisor).toFixed(digits)) >= 1_000;
}

/** Picks the tier after rounding, so 999,960 prints `1.0M` rather than `1000K`, and 999.996 `1.0K`. */
function scaledIsk(value: number, { b, m, k, unscaled }: IskTiers): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000 || roundsToNextTier(abs, 1_000_000, m)) {
    return `${(value / 1_000_000_000).toFixed(b)}B`;
  }
  if (abs >= 1_000_000 || roundsToNextTier(abs, 1_000, k)) {
    return `${(value / 1_000_000).toFixed(m)}M`;
  }
  if (abs >= 1_000 || unscaled === undefined || roundsToNextTier(abs, 1, unscaled)) {
    return `${(value / 1_000).toFixed(k)}K`;
  }
  return value.toFixed(unscaled);
}

/** `—` for null or non-finite; `unit` appends ` ISK` to a number, never to `—`. */
function formatScaledIsk(
  value: number | null,
  tiers: IskTiers,
  { unit = false }: { unit?: boolean } = {},
): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const text = scaledIsk(value, tiers);
  return unit ? `${text} ISK` : text;
}

/** Ledger precision: `2.35B`, `2.35M`, `2.3K`, `42.00`. */
export function formatIsk(value: number | null): string {
  return formatScaledIsk(value, FULL);
}

/** Table and card precision: `2.3B`, `2.3M`, `950K`. */
export function formatIskShort(value: number | null, options?: { unit?: boolean }): string {
  return formatScaledIsk(value, SHORT, options);
}

/** Whole millions and thousands for one-line summaries: `2.3B`, `45M`, `100K`. */
export function formatIskCompact(value: number | null, options?: { unit?: boolean }): string {
  return formatScaledIsk(value, COMPACT, options);
}
