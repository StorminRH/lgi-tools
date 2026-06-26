'use client';

import { useRef } from 'react';
import { LinePath, AreaClosed } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { cn } from './cn';
import {
  extent,
  nearestIndex,
  type SparklinePoint,
  type SparklineTone,
} from './sparkline';
import { toneHex } from './tones';
import { useCssomTooltip } from './use-cssom-tooltip';

/**
 * Axis-equipped trend chart — the full-size sibling of {@link Sparkline} for
 * dashboard use: horizontal gridlines, labeled value ticks, and date labels
 * along the baseline. Same house style as Sparkline (geometry/positioning stay
 * off inline `style` attributes): geometry is SVG presentation attributes +
 * `className`, the tooltip is self-rendered and positioned via `--tt-x` /
 * `--tt-y` custom properties through the CSSOM. Axes are hand-rolled on
 * `scaleLinear().ticks()` rather than pulling in `@visx/axis`/`@visx/grid`,
 * which would need their own inline-style audit.
 *
 * `data` carries ordinal x (the series index); `labels[x]` is the category
 * (typically a YYYY-MM-DD day) shown in the tooltip and, via `formatTick`,
 * along the x axis.
 */

// Room for the y-axis labels (left) and the baseline date labels (bottom).
const MARGIN = { top: 8, right: 8, bottom: 24, left: 44 };

/**
 * Up to `max` evenly spaced indices into a series of `count` points, always
 * including the first and last. Exported for tests.
 */
export function tickIndices(count: number, max: number): number[] {
  if (count <= 0) return [];
  if (max <= 1 || count === 1) return [0];
  const n = Math.min(count, max);
  const step = (count - 1) / (n - 1);
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) indices.push(Math.round(i * step));
  return [...new Set(indices)];
}

type TrendChartProps = {
  data: SparklinePoint[];
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

export function TrendChart({
  data,
  labels,
  tone = 'blue',
  width = 520,
  height = 200,
  className,
  yTicks = 4,
  xTicks = 5,
  formatY = (y) => String(y),
  formatTick = (s) => s,
  ariaLabel = 'Trend chart',
}: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { tooltipOpen, tooltipLeft, tooltipTop, tooltipData, showTooltip, hideTooltip } =
    useTooltip<SparklinePoint>();
  const tooltipRef = useCssomTooltip(tooltipLeft, tooltipTop, tooltipOpen);

  const stroke = toneHex[tone];

  if (data.length === 0) return null;

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const innerBottom = height - MARGIN.bottom;

  const xScale = scaleLinear<number>({
    domain: extent(xs),
    range: [MARGIN.left, width - MARGIN.right],
  });
  // Values here are always non-negative counts/rates, so the axis is honest
  // from zero; `nice` snaps the top tick to a round value above the max.
  const yScale = scaleLinear<number>({
    domain: [0, Math.max(...ys, 1)],
    range: [innerBottom, MARGIN.top],
    nice: true,
  });

  // Integer ticks only — counts/percents are whole numbers, and a small
  // domain would otherwise produce fractional ticks like 0.5.
  const yTickValues = yScale.ticks(yTicks).filter((t) => Number.isInteger(t));
  const xTickIdx = tickIndices(data.length, xTicks);

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = localPoint(svgRef.current as Element, event.nativeEvent);
    if (!point) return;
    const probe = xScale.invert(point.x);
    const idx = nearestIndex(xs, probe);
    const datum = data[idx];
    showTooltip({
      tooltipData: datum,
      tooltipLeft: xScale(datum.x),
      tooltipTop: yScale(datum.y),
    });
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block overflow-visible"
      >
        {yTickValues.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={yScale(t)}
              y2={yScale(t)}
              className="stroke-[var(--color-border-soft)]"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={yScale(t)}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-[var(--color-muted)] font-mono text-[10px]"
            >
              {formatY(t)}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={innerBottom}
          y2={innerBottom}
          className="stroke-[var(--color-border)]"
          strokeWidth={1}
        />
        {xTickIdx.map((i) => (
          <text
            key={i}
            x={xScale(xs[i])}
            y={height - 6}
            textAnchor="middle"
            className="fill-[var(--color-muted)] font-mono text-[10px]"
          >
            {formatTick(labels[i] ?? '')}
          </text>
        ))}

        <AreaClosed
          data={data}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          yScale={yScale}
          fill={stroke}
          fillOpacity={0.07}
          stroke="none"
        />
        <LinePath
          data={data}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />

        {tooltipOpen && tooltipLeft != null && tooltipTop != null && (
          <g aria-hidden>
            <line
              x1={tooltipLeft}
              x2={tooltipLeft}
              y1={MARGIN.top}
              y2={innerBottom}
              className="stroke-[var(--color-muted)]"
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <circle cx={tooltipLeft} cy={tooltipTop} r={3} fill={stroke} />
          </g>
        )}

        {/* Transparent capture layer for hover; presentation attrs only. */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={Math.max(0, width - MARGIN.left - MARGIN.right)}
          height={Math.max(0, innerBottom - MARGIN.top)}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={hideTooltip}
        />
      </svg>

      {tooltipOpen && tooltipData && (
        <div ref={tooltipRef} className="sparkline-tooltip" aria-hidden>
          <div className="sparkline-tooltip-box font-mono">
            <span className="text-name">{formatY(tooltipData.y)}</span>
            <span className="text-muted"> · {labels[tooltipData.x] ?? tooltipData.x}</span>
          </div>
        </div>
      )}
    </div>
  );
}
