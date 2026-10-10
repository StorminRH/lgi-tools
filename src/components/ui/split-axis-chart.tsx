'use client';

import type { ReactNode } from 'react';
import { scaleLinear } from '@visx/scale';
import { BAND_CHART_MARGIN, BandSeries } from './chart/band-series';
import { TimeSeriesFrame } from './chart/chart-frame';
import { extent, identityLabel } from './chart/chart-geometry';
import { ValueAxisGrid } from './chart/value-axis';
import type { SparklineTone } from './sparkline';
import { toneHex } from './tones';

// The upper series gets the larger share; the break sits in a small gap.
const UPPER_SHARE = 0.6;
const BREAK_GAP = 12;

/** One point in time: `upper` on the top segment (null where it has no data), `lower` below. */
export interface SplitDatum {
  x: number;
  label: string;
  upper: number | null;
  lower: number;
}

type Point = SplitDatum & { y: number };

interface Segment {
  key: 'upper' | 'lower';
  tone: SparklineTone;
  scale: ReturnType<typeof scaleLinear<number>>;
  floor: number;
  value: (point: SplitDatum) => number | null;
}

/**
 * Two series whose ranges are far apart, each on its own fitted segment of
 * one plot, with a break marker between them: the span between the two
 * ranges is left out, and each segment carries its own value ticks.
 */
export function SplitAxisChart({
  data,
  upperTone,
  lowerTone,
  upperDomain,
  lowerDomain,
  width,
  height = 190,
  formatY,
  formatTick = identityLabel,
  ariaLabel,
  renderTooltip,
}: {
  data: readonly SplitDatum[];
  upperTone: SparklineTone;
  lowerTone: SparklineTone;
  upperDomain: [number, number];
  lowerDomain: [number, number];
  width: number;
  height?: number;
  formatY: (value: number) => string;
  formatTick?: (label: string) => string;
  ariaLabel: string;
  renderTooltip: (datum: SplitDatum) => ReactNode;
}) {
  if (data.length < 2) return null;

  const innerBottom = height - BAND_CHART_MARGIN.bottom;
  const plot = innerBottom - BAND_CHART_MARGIN.top - BREAK_GAP;
  const upperFloor = BAND_CHART_MARGIN.top + plot * UPPER_SHARE;
  const lowerTop = upperFloor + BREAK_GAP;
  const segments: Segment[] = [
    {
      key: 'upper',
      tone: upperTone,
      scale: scaleLinear<number>({ domain: upperDomain, range: [upperFloor, BAND_CHART_MARGIN.top] }),
      floor: upperFloor,
      value: (point) => point.upper,
    },
    {
      key: 'lower',
      tone: lowerTone,
      scale: scaleLinear<number>({ domain: lowerDomain, range: [innerBottom, lowerTop] }),
      floor: innerBottom,
      value: (point) => point.lower,
    },
  ];
  const [upper, lower] = segments as [Segment, Segment];
  const xScale = scaleLinear<number>({ domain: extent(data.map((d) => d.x)), range: [BAND_CHART_MARGIN.left, width - BAND_CHART_MARGIN.right] });
  // Hover positions are screen y already: the upper value where it exists, else the lower.
  const points: Point[] = data.map((datum) => ({
    ...datum,
    y: datum.upper === null ? lower.scale(datum.lower) : upper.scale(datum.upper),
  }));
  const breakY = upperFloor + BREAK_GAP / 2;

  return (
    <TimeSeriesFrame
      points={points}
      xScale={xScale}
      yScale={(y) => y}
      width={width}
      height={height}
      margin={BAND_CHART_MARGIN}
      ariaLabel={ariaLabel}
      crosshairColor={toneHex[upperTone]}
      formatTick={formatTick}
      renderTooltip={renderTooltip}
    >
      {segments.map((segment) => (
        <g key={segment.key} data-axis={segment.key}>
          <ValueAxisGrid
            ticks={segment.scale.ticks(2)}
            y={segment.scale}
            left={BAND_CHART_MARGIN.left}
            right={width - BAND_CHART_MARGIN.right}
            format={formatY}
          />
          <BandSeries
            points={points}
            x={(point) => xScale(point.x)}
            y0={() => segment.floor}
            y1={(point) => segment.scale(segment.value(point) ?? 0)}
            defined={(point) => segment.value(point) !== null}
            color={toneHex[segment.tone]}
            fillOpacity={0.14}
          />
        </g>
      ))}
      <g data-axis-break aria-hidden className="stroke-[var(--color-muted)]" strokeWidth={1}>
        <line
          x1={BAND_CHART_MARGIN.left}
          x2={width - BAND_CHART_MARGIN.right}
          y1={breakY}
          y2={breakY}
          strokeDasharray="2 4"
          strokeOpacity={0.35}
        />
      </g>
    </TimeSeriesFrame>
  );
}
