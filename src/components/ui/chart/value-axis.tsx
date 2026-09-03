export type ValueAxisGridProps = {
  ticks: number[];
  y: (value: number) => number;
  left: number;
  right: number;
  format: (value: number) => string;
};

export function ValueAxisGrid({ ticks, y, left, right, format }: ValueAxisGridProps) {
  return (
    <>
      {ticks.map((t) => (
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
