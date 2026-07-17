'use client';

import type { MouseEvent } from 'react';
import { Bar } from '@visx/shape';
import { scaleBand, scaleLinear } from '@visx/scale';
import { localPoint } from '@visx/event';
import { type SparklineTone } from './sparkline';
import { toneHex } from './tones';
import { useChartHover } from './chart/use-chart-hover';
import { ChartCanvas } from './chart/chart-canvas';
import { ValueAxisGrid } from './chart/value-axis';
import { HoverCaptureRect } from './chart/hover-layer';

/**
 * Compact categorical bar chart — outcome distributions, a login-frequency
 * histogram, returning-vs-new, caller mix. Shares the frame / hover / value-axis
 * primitives in `./chart`; the categorical scale, bars, and per-bar hover are
 * bar-specific (`scaleBand` has no `.invert()`, so hover is captured per-bar
 * rather than by inverting an x probe).
 */

/**
 * Display-ready bar datum consumed by the shared visualization layer; callers keep all numeric
 * values in one consistent unit.
 */
export type BarDatum = { label: string; value: number };

const formatNumber = (value: number): string => String(value);
const identity = (label: string): string => label;

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

/**
 * Renders the domain-neutral bar chart from display-ready caller data; callers own units and
 * labels while this primitive owns geometry and interaction.
 */
export function BarChart({
  data,
  tone = 'green',
  width = 320,
  height = 150,
  className,
  formatValue = formatNumber,
  formatLabel = identity,
  ariaLabel = 'Bar chart',
}: BarChartProps) {
  const hover = useChartHover<BarDatum>();
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

  const handleMove = (event: MouseEvent<SVGRectElement>, datum: BarDatum) => {
    const point = localPoint(hover.svgRef.current as Element, event.nativeEvent);
    if (!point) return;
    const bandX = xScale(datum.label) ?? 0;
    hover.showTooltip({
      tooltipData: datum,
      tooltipLeft: bandX + xScale.bandwidth() / 2,
      tooltipTop: yScale(datum.value),
    });
  };

  const datum = hover.tooltipData;

  return (
    <ChartCanvas
      svgRef={hover.svgRef}
      width={width}
      height={height}
      ariaLabel={ariaLabel}
      className={className}
      tooltipRef={hover.tooltipRef}
      tooltipOpen={hover.tooltipOpen}
      tooltip={
        datum && (
          <>
            <span className="text-name">{formatValue(datum.value)}</span>
            <span className="text-muted"> · {formatLabel(datum.label)}</span>
          </>
        )
      }
    >
      <ValueAxisGrid
        ticks={yTickValues}
        y={yScale}
        left={MARGIN.left}
        right={width - MARGIN.right}
        format={formatValue}
      />

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
              className="fill-[var(--color-muted)] font-mono text-micro"
            >
              {formatLabel(d.label)}
            </text>
            {/* Per-bar hover capture (full column); presentation attrs only. */}
            <HoverCaptureRect
              x={bandX}
              y={MARGIN.top}
              width={barW}
              height={innerBottom - MARGIN.top}
              onMove={(e) => handleMove(e, d)}
              onLeave={hover.hideTooltip}
            />
          </g>
        );
      })}
    </ChartCanvas>
  );
}
