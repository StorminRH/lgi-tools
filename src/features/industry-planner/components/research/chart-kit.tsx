import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { formatIsk } from '@/lib/format/isk';

/**
 * The research charts' series colours, checked for colour-blind separation on
 * the section surface: the price in green, its 30-day average in blue, the
 * breakeven threshold in orange and the forecast in purple.
 */
export const SERIES = {
  price: 'var(--color-chart-price)',
  average: 'var(--color-chart-average)',
  breakeven: 'var(--color-chart-breakeven)',
  forecast: 'var(--color-chart-forecast)',
  loss: 'var(--color-hostile)',
  muted: 'var(--color-muted)',
} as const;

export type LegendMark = 'line' | 'dash' | 'area' | 'dot';

export interface LegendItem {
  label: string;
  color: string;
  mark: LegendMark;
}

function Swatch({ color, mark }: { color: string; mark: LegendMark }) {
  return (
    <svg width={16} height={10} aria-hidden className="shrink-0">
      {mark === 'area' && <rect x={0} y={1} width={16} height={8} rx={2} fill={color} fillOpacity={0.3} />}
      {mark === 'dot' && <circle cx={8} cy={5} r={4} fill={color} />}
      {(mark === 'line' || mark === 'dash') && (
        <line x1={0} x2={16} y1={5} y2={5} stroke={color} strokeWidth={2} strokeDasharray={mark === 'dash' ? '4 3' : undefined} />
      )}
    </svg>
  );
}

/** A chart's key: always present for two or more series, in text ink beside each mark. */
export function ChartLegend({ items, className }: { items: readonly LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex list-none flex-wrap items-center gap-x-4 gap-y-1 font-data text-micro text-muted', className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <Swatch color={item.color} mark={item.mark} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip rows: a label in muted ink, the value in name ink. */
export function TipRows({ title, rows }: { title: string; rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <div className="flex min-w-[9rem] flex-col gap-0.5 text-micro">
      <div className="text-name">{title}</div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <span className="text-muted">{label}</span>
          <span className="tabular-nums text-text">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(month) - 1] ?? month} ${Number(day)}`;
}

export function iskTick(value: number): string {
  return formatIsk(value).replace(/\.00(?=[KMB]?$)/, '');
}

/** A horizontal 0–100 bar drawn in SVG, so it needs no runtime style. */
export function MeterBar({
  value,
  color,
  className,
  track = true,
}: {
  value: number;
  color: string;
  className?: string;
  track?: boolean;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden className={cn('block h-1.5 w-full', className)}>
      {track && <rect x={0} y={0} width={100} height={6} rx={3} className="fill-[var(--color-border)]" />}
      {width > 0 && <rect x={0} y={0} width={width} height={6} rx={3} fill={color} />}
    </svg>
  );
}
