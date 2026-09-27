'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import type { scaleLinear } from '@visx/scale';
import { ChartCanvas } from './chart-canvas';
import { tickAnchor, tickIndices } from './chart-geometry';
import { continuousHoverHandler } from './hover';
import { HoverCaptureRect, HoverCrosshair } from './hover-layer';
import { useChartHover } from './use-chart-hover';

/**
 * A focusable wrapper so a chart reads by keyboard too: focus shows the
 * last point, and the arrow keys step through the points.
 */
function ChartFocusFrame({
  count,
  current,
  onShow,
  onHide,
  ariaLabel,
  children,
}: {
  count: number;
  current: number;
  onShow: (index: number) => void;
  onHide: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  const onKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (step === 0) return;
    const from = current < 0 ? count - 1 : current;
    onShow(Math.min(count - 1, Math.max(0, from + step)));
  };
  return (
    <div
      tabIndex={0}
      aria-label={`${ariaLabel}; use the arrow keys to read each day`}
      onFocus={() => onShow(count - 1)}
      onKeyDown={onKey}
      onBlur={onHide}
      className="rounded-ctl outline-none focus-visible:ring-1 focus-visible:ring-isk-sub"
    >
      {children}
    </div>
  );
}

/** Up to five evenly spread date labels under the plot. */
function XTickLabels({
  points,
  x,
  y,
  format,
}: {
  points: readonly { x: number; label: string }[];
  x: (value: number) => number;
  y: number;
  format: (label: string) => string;
}) {
  return tickIndices(points.length, 5).map((i) => {
    const point = points[i];
    return point === undefined ? null : (
      <text key={i} x={x(point.x)} y={y} textAnchor={tickAnchor(i, points.length)} className="fill-[var(--color-muted)] font-data text-micro">
        {format(point.label)}
      </text>
    );
  });
}

/**
 * The shared shell of a time-series chart: keyboard stepping, the canvas and
 * its bounded tooltip, date labels, the crosshair and the hover capture. The
 * chart draws its own series as children; `yScale` maps a point's `y` to the
 * screen row the tooltip and crosshair dot anchor on.
 */
export function TimeSeriesFrame<P extends { x: number; y: number; label: string }>({
  points,
  xScale,
  yScale,
  width,
  height,
  margin,
  ariaLabel,
  crosshairColor,
  formatTick,
  renderTooltip,
  children,
}: {
  points: P[];
  xScale: ReturnType<typeof scaleLinear<number>>;
  yScale: (value: number) => number;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  ariaLabel: string;
  crosshairColor: string;
  formatTick: (label: string) => string;
  renderTooltip: (point: P) => ReactNode;
  children: ReactNode;
}) {
  const hover = useChartHover<P>();
  const innerBottom = height - margin.bottom;
  const show = (index: number) => {
    const point = points[index];
    if (point !== undefined) {
      hover.showTooltip({ tooltipData: point, tooltipLeft: xScale(point.x), tooltipTop: yScale(point.y) });
    }
  };
  return (
    <ChartFocusFrame
      count={points.length}
      current={hover.tooltipData === undefined ? -1 : points.indexOf(hover.tooltipData)}
      onShow={show}
      onHide={hover.hideTooltip}
      ariaLabel={ariaLabel}
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
        {children}
        <XTickLabels points={points} x={xScale} y={height - 6} format={formatTick} />
        <HoverCrosshair
          open={hover.tooltipOpen}
          left={hover.tooltipLeft}
          top={hover.tooltipTop}
          y1={margin.top}
          y2={innerBottom}
          color={crosshairColor}
        />
        <HoverCaptureRect
          x={margin.left}
          y={margin.top}
          width={Math.max(0, width - margin.left - margin.right)}
          height={Math.max(0, innerBottom - margin.top)}
          onMove={continuousHoverHandler({
            svgRef: hover.svgRef,
            xScale,
            yScale,
            xs: points.map((point) => point.x),
            data: points,
            showTooltip: hover.showTooltip,
          })}
          onLeave={hover.hideTooltip}
        />
      </ChartCanvas>
    </ChartFocusFrame>
  );
}
