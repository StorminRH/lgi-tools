export type ValueAxisGridProps = {
  ticks: number[];
  y: (value: number) => number;
  left: number;
  right: number;
  format: (value: number) => string;
};

// Ticks closer together than the format's precision print the same label; keep the first of each.
function distinctTicks(ticks: readonly number[], format: (value: number) => string): number[] {
  const seen = new Set<string>();
  return ticks.filter((t) => {
    const label = format(t);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

export function ValueAxisGrid({ ticks, y, left, right, format }: ValueAxisGridProps) {
  return (
    <>
      {distinctTicks(ticks, format).map((t) => (
        <g key={t}>
          <line
            x1={left}
            x2={right}
            y1={y(t)}
            y2={y(t)}
            className="stroke-[var(--color-border-soft)]"
            strokeWidth={1}
          />
          <text
            x={left - 6}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-[var(--color-muted)] font-data text-micro"
          >
            {format(t)}
          </text>
        </g>
      ))}
    </>
  );
}

/** The plot's bottom edge: drawn after the value grid, so it covers a grid line at the bottom. */
export function ChartBaseline({ left, right, y }: { left: number; right: number; y: number }) {
  return <line x1={left} x2={right} y1={y} y2={y} className="stroke-[var(--color-border)]" strokeWidth={1} />;
}
