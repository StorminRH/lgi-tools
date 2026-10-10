'use client';

import type { ReactNode } from 'react';
import { Area, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { TimeSeriesFrame } from './chart/chart-frame';
import { extent, identityLabel } from './chart/chart-geometry';
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

// A point with no neighbour on either side draws no area; mark it instead,
// so a band that has just begun (one recorded day) still shows.
function isolated(points: readonly StackedDatum[], i: number, band: number): boolean {
  const has = (j: number) => (points[j]?.values[band] ?? null) !== null;
  return has(i) && !has(i - 1) && !has(i + 1);
}

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
  formatTick = identityLabel,
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


  return (
    <TimeSeriesFrame
      points={points}
      xScale={xScale}
      yScale={yScale}
      width={width}
      height={height}
      margin={MARGIN}
      ariaLabel={ariaLabel}
      crosshairColor={edge}
      formatTick={formatTick}
      renderTooltip={renderTooltip}
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
          {points.map((point, i) =>
            isolated(points, i, index) ? (
              <circle
                key={point.x}
                cx={xScale(point.x)}
                cy={yScale(base(point, index) + (point.values[index] ?? 0))}
                r={3}
                fill={toneHex[band.tone]}
              />
            ) : null,
          )}
        </g>
      ))}
    </TimeSeriesFrame>
  );
}
