'use client';

import { AreaClosed, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { type SparklineTone } from './sparkline';
import { toneHex } from './tones';
import { extent, formatPlainValue, identityLabel } from './chart/chart-geometry';
import { TimeSeriesFrame } from './chart/chart-frame';
import { ChartBaseline, ValueAxisGrid } from './chart/value-axis';

const MARGIN = { top: 8, right: 8, bottom: 24, left: 44 };

const zeroBasedDomain = (ys: number[]): [number, number] => [0, Math.max(...ys, 1)];

export type TrendChartProps = {
  data: { x: number; y: number }[];
  labels: string[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  yTicks?: number;
  formatY?: (y: number) => string;
  formatTick?: (label: string) => string;
  ariaLabel?: string;
  yDomain?: readonly [number, number];
};

/** A filled line over time, read by hover or by focus and the arrow keys. */
export function TrendChart({
  data,
  labels,
  tone = 'blue',
  width = 520,
  height = 200,
  yTicks = 4,
  formatY = formatPlainValue,
  formatTick = identityLabel,
  ariaLabel = 'Trend chart',
  yDomain,
}: TrendChartProps) {
  if (data.length === 0) return null;

  const stroke = toneHex[tone];
  const points = data.map((d, i) => ({ x: d.x, y: d.y, label: labels[i] ?? String(d.x) }));
  const innerBottom = height - MARGIN.bottom;
  const plotRight = width - MARGIN.right;
  const xScale = scaleLinear<number>({
    domain: extent(points.map((point) => point.x)),
    range: [MARGIN.left, plotRight],
  });
  const yScale = scaleLinear<number>({
    domain: yDomain ? [yDomain[0], yDomain[1]] : zeroBasedDomain(points.map((point) => point.y)),
    range: [innerBottom, MARGIN.top],
    nice: true,
  });

  return (
    <TimeSeriesFrame
      points={points}
      xScale={xScale}
      yScale={yScale}
      width={width}
      height={height}
      margin={MARGIN}
      ariaLabel={ariaLabel}
      crosshairColor={stroke}
      formatTick={formatTick}
      renderTooltip={(point) => (
        <>
          <span className="text-name">{formatY(point.y)}</span>
          <span className="text-muted"> · {point.label}</span>
        </>
      )}
    >
      <ValueAxisGrid
        ticks={yScale.ticks(yTicks).filter((t) => Number.isInteger(t))}
        y={yScale}
        left={MARGIN.left}
        right={plotRight}
        format={formatY}
      />
      <ChartBaseline left={MARGIN.left} right={plotRight} y={innerBottom} />
      <AreaClosed
        data={points}
        x={(point) => xScale(point.x)}
        y={(point) => yScale(point.y)}
        yScale={yScale}
        fill={stroke}
        fillOpacity={0.07}
        stroke="none"
      />
      <LinePath
        data={points}
        x={(point) => xScale(point.x)}
        y={(point) => yScale(point.y)}
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </TimeSeriesFrame>
  );
}
