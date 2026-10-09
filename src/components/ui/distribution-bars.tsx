import type { ReactNode } from 'react';
import { ProgressBar, type ProgressTone } from './progress-bar';

export interface DistributionInput {
  key: string;
  label: string;
  count: number;
  tone?: ProgressTone;
  /** Extra text after the count and share, such as an average duration. */
  detail?: string;
  /** A second line of detail under the bar, such as impressions and position. */
  sub?: ReactNode;
}

export interface DistributionBar extends DistributionInput {
  sharePct: number;
  fillPct: number;
}

/**
 * `fill: 'max'` scales each track against the largest row, for rankings.
 * `fill: 'share'` fills each track to its share of the total, for parts of a whole.
 */
export function distributionBars(
  rows: DistributionInput[],
  sort: 'desc' | 'none' = 'desc',
  denominator?: number,
  fill: 'max' | 'share' = 'max',
): DistributionBar[] {
  const total = denominator ?? rows.reduce((sum, r) => sum + r.count, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  const scale = fill === 'share' ? total : max;
  const ordered = sort === 'desc' ? [...rows].sort((a, b) => b.count - a.count) : rows;
  return ordered.map((r) => ({
    ...r,
    sharePct: total === 0 ? 0 : (r.count / total) * 100,
    fillPct: scale === 0 ? 0 : Math.max(2, (r.count / scale) * 100),
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
  total,
  fill = 'max',
}: {
  rows: DistributionInput[];
  formatCount?: (n: number) => string;
  sort?: 'desc' | 'none';
  ariaLabel?: string;
  total?: number;
  fill?: 'max' | 'share';
}) {
  const bars = distributionBars(rows, sort, total, fill);
  return (
    <ul aria-label={ariaLabel}>
      {bars.map((bar) => (
        <li key={bar.key} className="px-3.5 py-2 border-b border-border-soft last:border-b-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-data text-ui text-text break-all">{bar.label}</span>
            <span className="font-data text-ui text-muted tabular-nums shrink-0 ml-3">
              {formatCount(bar.count)} · {shareLabel(bar.sharePct)}
              {bar.detail === undefined ? null : ` · ${bar.detail}`}
            </span>
          </div>
          <ProgressBar pct={bar.fillPct} tone={bar.tone} />
          {bar.sub === undefined ? null : (
            <div className="mt-1 font-data text-micro tabular-nums text-muted wrap-break-word">{bar.sub}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
