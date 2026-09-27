'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { Area, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { ChartCanvas } from './chart/chart-canvas';
import { extent, tickIndices } from './chart/chart-geometry';
import { continuousHoverHandler } from './chart/hover';
import { HoverCaptureRect, HoverCrosshair } from './chart/hover-layer';
import { useChartHover } from './chart/use-chart-hover';
import { ValueAxisGrid } from './chart/value-axis';
import type { SparklineTone } from './sparkline';
import { toneHex } from './tones';

const MARGIN = { top: 8, right: 10, bottom: 24, left: 52 };
const FILL_OPACITY = [0.34, 0.22];

export interface StackedBand {
  key: string;
  tone: SparklineTone;
}

/** One point in time; `values[i]` is band i's own height, null where band i has no data. */
export interface StackedDatum {
  x: number;
  label: string;
  values: readonly (number | null)[];
}

type Point = StackedDatum & { y: number };

const base = (datum: StackedDatum, band: number) =>
  datum.values.slice(0, band).reduce<number>((sum, value) => sum + (value ?? 0), 0);

/**
 * Bands stacked from zero, each drawn only where it has data, so a band can
 * begin partway along. Hover or keyboard focus shows the point under it.
 */
export function StackedAreaChart({
  data,
  bands,
  width,
  height = 180,
  formatY,
  formatTick = (label) => label,
  ariaLabel,
  renderTooltip,
}: {
  data: readonly StackedDatum[];
  bands: readonly StackedBand[];
  width: number;
  height?: number;
  formatY: (value: number) => string;
  formatTick?: (label: string) => string;
  ariaLabel: string;
  renderTooltip: (datum: StackedDatum) => ReactNode;
}) {
  const hover = useChartHover<Point>();
  if (data.length < 2) return null;

  const points: Point[] = data.map((datum) => ({ ...datum, y: base(datum, datum.values.length) }));
  const xs = points.map((point) => point.x);
  const innerBottom = height - MARGIN.bottom;
  const xScale = scaleLinear<number>({ domain: extent(xs), range: [MARGIN.left, width - MARGIN.right] });
  const yScale = scaleLinear<number>({
    domain: [0, Math.max(...points.map((point) => point.y), 1)],
    range: [innerBottom, MARGIN.top],
    nice: true,
  });
  const top = bands.at(-1);
  const edge = toneHex[top?.tone ?? 'green'];

  const show = (point: Point) =>
    hover.showTooltip({ tooltipData: point, tooltipLeft: xScale(point.x), tooltipTop: yScale(point.y) });
  const onKey = (event: KeyboardEvent) => {
    const current = hover.tooltipData === undefined ? points.length - 1 : points.indexOf(hover.tooltipData);
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const next = points[Math.min(points.length - 1, Math.max(0, current + step))];
    if (step !== 0 && next !== undefined) show(next);
  };
  const tickIdx = tickIndices(points.length, 5);

  return (
    <div
      tabIndex={0}
      aria-label={`${ariaLabel}; use the arrow keys to read each day`}
      onFocus={() => {
        const last = points.at(-1);
        if (last !== undefined) show(last);
      }}
      onKeyDown={onKey}
      onBlur={hover.hideTooltip}
      className="rounded-ctl outline-none focus-visible:ring-1 focus-visible:ring-isk-sub"
    >
      <ChartCanvas
        svgRef={hover.svgRef}
        width={width}
        height={height}
        ariaLabel={ariaLabel}
        tooltipRef={hover.tooltipRef}
        tooltipOpen={hover.tooltipOpen}
        tooltip={hover.tooltipData === undefined ? null : renderTooltip(hover.tooltipData)}
      >
        <ValueAxisGrid
          ticks={yScale.ticks(4)}
          y={yScale}
          left={MARGIN.left}
          right={width - MARGIN.right}
          format={formatY}
        />
        {bands.map((band, index) => (
          <g key={band.key} data-band={band.key}>
            <Area<Point>
              data={points}
              x={(point) => xScale(point.x)}
              y0={(point) => yScale(base(point, index))}
              y1={(point) => yScale(base(point, index) + (point.values[index] ?? 0))}
              defined={(point) => point.values[index] !== null}
              fill={toneHex[band.tone]}
              fillOpacity={FILL_OPACITY[index] ?? 0.2}
            />
            <LinePath<Point>
              data={points}
              x={(point) => xScale(point.x)}
              y={(point) => yScale(base(point, index) + (point.values[index] ?? 0))}
              defined={(point) => point.values[index] !== null}
              stroke={toneHex[band.tone]}
              strokeWidth={index === bands.length - 1 ? 1.5 : 1}
              strokeOpacity={index === bands.length - 1 ? 1 : 0.7}
              fill="none"
            />
          </g>
        ))}
        {tickIdx.map((i) => {
          const point = points[i];
          return point === undefined ? null : (
            <text
              key={i}
              x={xScale(point.x)}
              y={height - 6}
              textAnchor="middle"
              className="fill-[var(--color-muted)] font-data text-micro"
            >
              {formatTick(point.label)}
            </text>
          );
        })}
        <HoverCrosshair
          open={hover.tooltipOpen}
          left={hover.tooltipLeft}
          top={hover.tooltipTop}
          y1={MARGIN.top}
          y2={innerBottom}
          color={edge}
        />
        <HoverCaptureRect
          x={MARGIN.left}
          y={MARGIN.top}
          width={Math.max(0, width - MARGIN.left - MARGIN.right)}
          height={Math.max(0, innerBottom - MARGIN.top)}
          onMove={continuousHoverHandler({
            svgRef: hover.svgRef,
            xScale,
            yScale,
            xs,
            data: points,
            showTooltip: hover.showTooltip,
          })}
          onLeave={hover.hideTooltip}
        />
      </ChartCanvas>
    </div>
  );
}
