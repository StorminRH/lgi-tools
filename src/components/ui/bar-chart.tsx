'use client';

import { useLayoutEffect, useRef } from 'react';
import { Bar } from '@visx/shape';
import { scaleBand, scaleLinear } from '@visx/scale';
import { useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { cn } from './cn';
import { type SparklineTone } from './sparkline';
import { toneHex } from './tones';

/**
 * Compact categorical bar chart — outcome distributions, a login-frequency
 * histogram, returning-vs-new, caller mix. The second viz primitive on `visx`,
 * built to the same CSP rules as {@link Sparkline} (CLAUDE.md: `style-src
 * 'self'` drops inline `style=`):
 *  - Geometry is pure SVG presentation attributes + `className` — `Bar` renders
 *    a plain `<rect>`, never an inline `style`.
 *  - The tooltip is self-rendered (not `@visx/tooltip`'s components, which
 *    position via inline `style`); its position is set as `--tt-x` / `--tt-y`
 *    custom properties through the CSSOM and read by the shared
 *    `.sparkline-tooltip` rule in globals.css.
 *  - Draws from the canonical `toneHex` palette (tones.ts) and shares the
 *    tooltip CSS with Sparkline rather than forking them.
 * `scaleBand` has no `.invert()`, so hover is captured per-bar rather than by
 * inverting an x probe.
 */

export type BarDatum = { label: string; value: number };

type BarChartProps = {
  data: BarDatum[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  className?: string;
  /** Format the value for the tooltip (e.g. a count or percentage). */
  formatValue?: (v: number) => string;
  /** Transform the category label for the axis + tooltip. */
  formatLabel?: (s: string) => string;
  ariaLabel?: string;
};

// Extra bottom room for the category labels under each bar; left room for the
// value-axis tick labels.
const MARGIN = { top: 8, right: 6, bottom: 20, left: 40 };

// Value-axis tick count hint (d3 picks nearby round values).
const Y_TICKS = 3;

export function BarChart({
  data,
  tone = 'green',
  width = 320,
  height = 150,
  className,
  formatValue = (v) => String(v),
  formatLabel = (s) => s,
  ariaLabel = 'Bar chart',
}: BarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { tooltipOpen, tooltipLeft, tooltipTop, tooltipData, showTooltip, hideTooltip } =
    useTooltip<BarDatum>();

  // Position the self-rendered tooltip via CSS custom properties through the
  // CSSOM — never an inline `style` attribute. Mirrors Sparkline/ProgressBar.
  useLayoutEffect(() => {
    if (tooltipLeft == null || tooltipTop == null) return;
    tooltipRef.current?.style.setProperty('--tt-x', `${tooltipLeft}px`);
    tooltipRef.current?.style.setProperty('--tt-y', `${tooltipTop}px`);
  }, [tooltipLeft, tooltipTop, tooltipOpen]);

  const fill = toneHex[tone];

  if (data.length === 0) return null;

  const innerBottom = height - MARGIN.bottom;
  const yMax = Math.max(...data.map((d) => d.value), 0);

  const xScale = scaleBand<string>({
    domain: data.map((d) => d.label),
    range: [MARGIN.left, width - MARGIN.right],
    padding: 0.3,
  });
  const yScale = scaleLinear<number>({
    // Bars grow from 0; a flat all-zero series still gets a sane axis. `nice`
    // snaps the top tick to a round value so the axis labels read cleanly.
    domain: [0, yMax === 0 ? 1 : yMax],
    range: [innerBottom, MARGIN.top],
    nice: true,
  });

  // Integer ticks only — every series this renders is a count, and a small
  // domain would otherwise produce fractional ticks like 0.5.
  const yTickValues = yScale.ticks(Y_TICKS).filter((t) => Number.isInteger(t));

  const handleMove = (event: React.MouseEvent<SVGRectElement>, datum: BarDatum) => {
    const point = localPoint(svgRef.current as Element, event.nativeEvent);
    if (!point) return;
    const bandX = xScale(datum.label) ?? 0;
    showTooltip({
      tooltipData: datum,
      tooltipLeft: bandX + xScale.bandwidth() / 2,
      tooltipTop: yScale(datum.value),
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
              {formatValue(t)}
            </text>
          </g>
        ))}

        {data.map((d) => {
          const bandX = xScale(d.label) ?? 0;
          const barW = xScale.bandwidth();
          const barY = yScale(d.value);
          const barH = Math.max(0, innerBottom - barY);
          return (
            <g key={d.label}>
              <Bar x={bandX} y={barY} width={barW} height={barH} fill={fill} fillOpacity={0.85} />
              <text
                x={bandX + barW / 2}
                y={height - 6}
                textAnchor="middle"
                className="fill-[var(--color-muted)] font-mono text-[10px]"
              >
                {formatLabel(d.label)}
              </text>
              {/* Per-bar hover capture (full column); presentation attrs only. */}
              <rect
                x={bandX}
                y={MARGIN.top}
                width={barW}
                height={innerBottom - MARGIN.top}
                fill="transparent"
                onMouseMove={(e) => handleMove(e, d)}
                onMouseLeave={hideTooltip}
              />
            </g>
          );
        })}
      </svg>

      {tooltipOpen && tooltipData && (
        <div ref={tooltipRef} className="sparkline-tooltip" aria-hidden>
          <div className="sparkline-tooltip-box font-mono">
            <span className="text-name">{formatValue(tooltipData.value)}</span>
            <span className="text-muted"> · {formatLabel(tooltipData.label)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
