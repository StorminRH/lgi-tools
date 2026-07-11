type ValueAxisGridProps = {
  /** Tick values along the value (y) axis. */
  ticks: number[];
  /** The y scale — maps a tick value to its pixel row. */
  y: (value: number) => number;
  /** Left edge (gridline start + label anchor) and right edge (gridline end). */
  left: number;
  right: number;
  format: (value: number) => string;
};

/**
 * Horizontal value-axis gridlines with right-aligned tick labels — the block
 * TrendChart and BarChart render identically. Hand-rolled on `scale.ticks()`
 * rather than `@visx/axis`/`@visx/grid` (which position via inline `style`).
 */
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
            className="fill-[var(--color-muted)] font-mono text-[10px]"
          >
            {format(t)}
          </text>
        </g>
      ))}
    </>
  );
}
