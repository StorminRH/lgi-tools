import { ProgressBar } from './progress-bar';

export interface DistributionInput {
  key: string;
  label: string;
  count: number;
}

export interface DistributionBar extends DistributionInput {
  sharePct: number;
  fillPct: number;
}

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
            <span className="font-data text-ui text-text break-all">{bar.label}</span>
            <span className="font-data text-ui text-muted tabular-nums shrink-0 ml-3">
              {formatCount(bar.count)} · {shareLabel(bar.sharePct)}
            </span>
          </div>
          <ProgressBar pct={bar.fillPct} />
        </li>
      ))}
    </ul>
  );
}
