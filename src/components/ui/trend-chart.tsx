'use client';

import { type SparklineTone } from './sparkline';
import { tickIndices } from './chart/chart-geometry';
import { LineChart } from './chart/line-chart';
import { ValueAxisGrid } from './chart/value-axis';

/**
 * Axis-equipped trend chart — the full-size sibling of {@link Sparkline} for
 * dashboard use. A config over the shared {@link LineChart} core: zero-based
 * `nice` y-domain plus an axis layer (value gridlines, baseline, date labels).
 *
 * `data` carries ordinal x (the series index); `labels[x]` is the category
 * (typically a YYYY-MM-DD day) shown in the tooltip and, via `formatTick`,
 * along the x axis.
 */

// Room for the y-axis labels (left) and the baseline date labels (bottom).
const MARGIN = { top: 8, right: 8, bottom: 24, left: 44 };

// `tickIndices` lives in ./chart/chart-geometry; re-exported so the existing
// `trend-chart.test.ts` pin keeps importing it from './trend-chart'.
export { tickIndices } from './chart/chart-geometry';

const formatNumber = (value: number): string => String(value);
const identity = (label: string): string => label;

type TrendChartProps = {
  data: { x: number; y: number }[];
  /** Category label per ordinal x — tooltip shows it in full. */
  labels: string[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  className?: string;
  /** Value-axis tick count hint (d3 picks nearby round values). */
  yTicks?: number;
  /** How many x labels to render along the baseline. */
  xTicks?: number;
  /** Format a value for the y axis + tooltip. */
  formatY?: (y: number) => string;
  /** Compact a label for the x axis (tooltip keeps the full label). */
  formatTick?: (label: string) => string;
  ariaLabel?: string;
};

/**
 * Renders the domain-neutral trend chart from display-ready caller data; callers own units and
 * labels while this primitive owns geometry and interaction.
 */
export function TrendChart({
  data,
  labels,
  tone = 'blue',
  width = 520,
  height = 200,
  className,
  yTicks = 4,
  xTicks = 5,
  formatY = formatNumber,
  formatTick = identity,
  ariaLabel = 'Trend chart',
}: TrendChartProps) {
  return (
    <LineChart
      data={data}
      tone={tone}
      width={width}
      height={height}
      margin={MARGIN}
      className={className}
      ariaLabel={ariaLabel}
      // Values here are always non-negative counts/rates, so the axis is honest
      // from zero; `nice` snaps the top tick to a round value above the max.
      computeYDomain={(ys) => [0, Math.max(...ys, 1)]}
      yNice
      fillOpacity={0.07}
      renderTooltip={(d) => (
        <>
          <span className="text-name">{formatY(d.y)}</span>
          <span className="text-muted"> · {labels[d.x] ?? d.x}</span>
        </>
      )}
      renderAxis={({ xScale, yScale, xs }) => {
        // Integer ticks only — counts/percents are whole numbers, and a small
        // domain would otherwise produce fractional ticks like 0.5.
        const yTickValues = yScale.ticks(yTicks).filter((t) => Number.isInteger(t));
        const xTickIdx = tickIndices(data.length, xTicks);
        return (
          <>
            <ValueAxisGrid
              ticks={yTickValues}
              y={yScale}
              left={MARGIN.left}
              right={width - MARGIN.right}
              format={formatY}
            />
            {/* Baseline */}
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={height - MARGIN.bottom}
              y2={height - MARGIN.bottom}
              className="stroke-[var(--color-border)]"
              strokeWidth={1}
            />
            {xTickIdx.map((i) => (
              <text
                key={i}
                x={xScale(xs[i] ?? 0)}
                y={height - 6}
                textAnchor="middle"
                className="fill-[var(--color-muted)] font-mono text-micro"
              >
                {formatTick(labels[i] ?? '')}
              </text>
            ))}
          </>
        );
      }}
    />
  );
}
