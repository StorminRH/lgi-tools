import type { Delta } from './period';

// One headline number on the dashboard's KPI row: label, big value, an
// optional period-over-period delta, and a one-line context sub. Delta colors
// are the only place besides the status strip where green/red appear — charts
// stay on the single blue accent.

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.pct === null) {
    // No previous-window denominator: the metric is new (or still zero).
    return delta.direction === 'up' ? (
      <span className="font-mono text-[11px] text-isk">new</span>
    ) : (
      <span className="font-mono text-[11px] text-muted">—</span>
    );
  }
  if (delta.direction === 'flat') {
    return <span className="font-mono text-[11px] text-muted tabular-nums">±0%</span>;
  }
  const cls = delta.direction === 'up' ? 'text-isk' : 'text-tone-red';
  const arrow = delta.direction === 'up' ? '▲' : '▼';
  return (
    <span className={`font-mono text-[11px] tabular-nums ${cls}`}>
      {arrow} {Math.abs(delta.pct)}%
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: Delta | null;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3.5 border border-border bg-bg">
      <div className="text-[10px] tracking-[0.16em] uppercase text-muted">{label}</div>
      <div className="flex items-baseline gap-2.5">
        <span className="font-display font-bold text-[26px] leading-none text-name tabular-nums">
          {value}
        </span>
        {delta && <DeltaBadge delta={delta} />}
      </div>
      {sub && <div className="font-mono text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
