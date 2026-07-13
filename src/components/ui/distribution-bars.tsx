import { ProgressBar } from './progress-bar';

// A ranked horizontal distribution: rows sorted high→low, each printing its
// count AND its share of the total, over a full-width proportional track. The
// analytical replacement for a bare label+count bar (and for the vertical
// hover-only histogram) — the numbers are readable at rest. Layout math is the
// pure {@link distributionBars}; the row markup is a real list.

export interface DistributionInput {
  key: string;
  label: string;
  count: number;
}

export interface DistributionBar extends DistributionInput {
  /** Share of the total across all rows (the printed %). */
  sharePct: number;
  /** Track fill relative to the largest row (proportional reading). */
  fillPct: number;
}

// `sort: 'desc'` ranks by count (top pages/queries); `'none'` preserves the
// caller's order for an inherently ordered series (the login-frequency buckets
// read 1 → 2–3 → 4–9 → 10+, not by magnitude).
export function distributionBars(
  rows: DistributionInput[],
  sort: 'desc' | 'none' = 'desc',
): DistributionBar[] {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  const ordered = sort === 'desc' ? [...rows].sort((a, b) => b.count - a.count) : rows;
  return ordered.map((r) => ({
    ...r,
    sharePct: total === 0 ? 0 : (r.count / total) * 100,
    // A visible sliver for any non-zero row so tiny values still register.
    fillPct: max === 0 ? 0 : Math.max(2, (r.count / max) * 100),
  }));
}

function shareLabel(pct: number): string {
  return `${pct > 0 && pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

export function DistributionBars({
  rows,
  formatCount = (n) => n.toLocaleString(),
  sort = 'desc',
  ariaLabel,
}: {
  rows: DistributionInput[];
  formatCount?: (n: number) => string;
  sort?: 'desc' | 'none';
  ariaLabel?: string;
}) {
  const bars = distributionBars(rows, sort);
  return (
    <ul aria-label={ariaLabel}>
      {bars.map((bar) => (
        <li key={bar.key} className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-ui text-text break-all">{bar.label}</span>
            <span className="font-mono text-ui text-muted tabular-nums shrink-0 ml-3">
              {formatCount(bar.count)} · {shareLabel(bar.sharePct)}
            </span>
          </div>
          <ProgressBar pct={bar.fillPct} />
        </li>
      ))}
    </ul>
  );
}
