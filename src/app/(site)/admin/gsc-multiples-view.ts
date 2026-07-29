import { computeDelta, type Delta } from '@/composition/admin-period';

// The three GSC headline metrics as small-multiples cell headers: current value,
// period-over-period delta, and — for avg position — the invert flag (a falling
// rank is an improvement) plus a "lower = better" note. Pure and testable; the
// per-day trend chart is paired in by the card.

/**
 * Display-ready gsc metric cell produced by App Router; values retain their domain units and
 * require no additional query by the renderer.
 */
export interface GscMetricCell {
  title: string;
  value: string;
  delta: Delta | null;
  invert: boolean;
  note?: string;
}

/**
 * Derives gsc multiples under the App Router policy without transferring ownership of
 * caller-provided inputs.
 */
export function deriveGscMultiples(input: {
  totals: { clicks: number; impressions: number; position: number };
  prevTotals: { clicks: number; impressions: number; position: number } | null;
}): GscMetricCell[] {
  const { totals, prevTotals } = input;
  return [
    {
      title: 'Clicks',
      value: totals.clicks.toLocaleString(),
      delta: computeDelta(totals.clicks, prevTotals?.clicks ?? null),
      invert: false,
    },
    {
      title: 'Impressions',
      value: totals.impressions.toLocaleString(),
      delta: computeDelta(totals.impressions, prevTotals?.impressions ?? null),
      invert: false,
    },
    {
      title: 'Avg position',
      value: totals.position.toFixed(1),
      // Position is a rank, so a lower value is better; the delta colour inverts.
      // computeDelta needs a non-null prior — a 0 prior (no data) reads as "new".
      delta: computeDelta(totals.position, prevTotals?.position ?? null),
      invert: true,
      note: 'lower = better',
    },
  ];
}
