'use client';

import type { ReactNode } from 'react';
import { LinePath, AreaClosed } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { toneHex } from '../tones';
import type { SparklineTone, SparklinePoint } from '../sparkline';
import { extent } from './chart-geometry';
import { useChartHover } from './use-chart-hover';
import { ChartCanvas } from './chart-canvas';
import { HoverCrosshair, HoverCaptureRect } from './hover-layer';
import { continuousHoverHandler } from './hover';

type Margin = { top: number; right: number; bottom: number; left: number };

/** A d3/visx numeric scale, as the axis renderer consumes it. */
type NumericScale = ((value: number) => number) & {
  ticks: (count?: number) => number[];
  invert: (x: number) => number;
};

export type LineChartAxis = (ctx: {
  xScale: NumericScale;
  yScale: NumericScale;
  xs: number[];
}) => ReactNode;

type LineChartProps<T extends SparklinePoint> = {
  data: T[];
  tone: SparklineTone;
  width: number;
  height: number;
  margin: Margin;
  className?: string;
  ariaLabel: string;
  /** Value-axis domain from the series' y values (padded vs zero-based). */
  computeYDomain: (ys: number[]) => [number, number];
  /** d3 `nice` rounding on the y axis (TrendChart uses it; Sparkline doesn't). */
  yNice?: boolean;
  fillOpacity: number;
  /** Tooltip body for the hovered datum. */
  renderTooltip: (datum: T) => ReactNode;
  /** Optional axis / gridline layer drawn behind the series. */
  renderAxis?: LineChartAxis;
};

/**
 * The shared continuous-x line chart core behind {@link Sparkline} and
 * TrendChart: linear x/y scales, the area + line marks, hover crosshair, and
 * the self-rendered tooltip. Callers supply the genuinely different bits — the
 * y-domain strategy, `nice`, fill opacity, tooltip body, and an optional axis
 * layer — so the two charts share this instead of copying it.
 */
export function LineChart<T extends SparklinePoint>({
  data,
  tone,
  width,
  height,
  margin,
  className,
  ariaLabel,
  computeYDomain,
  yNice = false,
  fillOpacity,
  renderTooltip,
  renderAxis,
}: LineChartProps<T>) {
  const hover = useChartHover<T>();
  const stroke = toneHex[tone];

  if (data.length === 0) return null;

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const innerBottom = height - margin.bottom;

  const xScale = scaleLinear<number>({
    domain: extent(xs),
    range: [margin.left, width - margin.right],
  });
  const yScale = scaleLinear<number>({
    domain: computeYDomain(ys),
    range: [innerBottom, margin.top],
    nice: yNice,
  });

  const handleMove = continuousHoverHandler({
    svgRef: hover.svgRef,
    xScale,
    yScale,
    xs,
    data,
    showTooltip: hover.showTooltip,
  });

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
      tooltip={datum ? renderTooltip(datum) : null}
    >
      {renderAxis?.({ xScale, yScale, xs })}
      <AreaClosed
        data={data}
        x={(d) => xScale(d.x)}
        y={(d) => yScale(d.y)}
        yScale={yScale}
        fill={stroke}
        fillOpacity={fillOpacity}
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
      <HoverCrosshair
        open={hover.tooltipOpen}
        left={hover.tooltipLeft}
        top={hover.tooltipTop}
        y1={margin.top}
        y2={innerBottom}
        color={stroke}
      />
      <HoverCaptureRect
        x={margin.left}
        y={margin.top}
        width={Math.max(0, width - margin.left - margin.right)}
        height={Math.max(0, innerBottom - margin.top)}
        onMove={handleMove}
        onLeave={hover.hideTooltip}
      />
    </ChartCanvas>
  );
}
