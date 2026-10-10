'use client';

import { LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { type SparklineTone } from './sparkline';
import { toneHex } from './tones';
import { dailyChartModel, type DailyHoverPoint } from './chart/daily-chart-geometry';
import { formatPlainValue, identityLabel } from './chart/chart-geometry';
import { TimeSeriesFrame } from './chart/chart-frame';
import { ChartBaseline, ValueAxisGrid } from './chart/value-axis';

type NumericScale = (value: number) => number;

export type EndLabel = {
  valueText: string;
  deltaText: string | null;
  deltaHex: string | null;
};

export type AnnotatedDailyChartProps = {
  points: { x: number; y: number }[];
  average: number[];
  labels: string[];
  weekend: boolean[];
  referenceLine: { value: number; label: string } | null;
  eventMarkers?: { x: number; label: string }[];
  endLabel?: EndLabel;
  tone?: SparklineTone;
  width?: number;
  height?: number;
  yTicks?: number;
  formatY?: (y: number) => string;
  formatTick?: (label: string) => string;
  ariaLabel?: string;
};

const MARGIN = { top: 10, right: 66, bottom: 24, left: 44 };

function DailyBars({
  points,
  weekend,
  xScale,
  yScale,
  barW,
  innerBottom,
  fill,
}: {
  points: { x: number; y: number }[];
  weekend: boolean[];
  xScale: NumericScale;
  yScale: NumericScale;
  barW: number;
  innerBottom: number;
  fill: string;
}) {
  return (
    <>
      {points.map((p, i) => {
        const barY = yScale(p.y);
        return (
          <rect
            key={p.x}
            x={xScale(p.x) - barW / 2}
            y={barY}
            width={barW}
            height={Math.max(0, innerBottom - barY)}
            fill={fill}
            fillOpacity={weekend[i] ? 0.3 : 0.82}
          />
        );
      })}
    </>
  );
}

function DeployMarkers({
  markers,
  xScale,
  y1,
  y2,
}: {
  markers: { x: number; label: string }[];
  xScale: NumericScale;
  y1: number;
  y2: number;
}) {
  return (
    <>
      {markers.map((m) => (
        <line
          key={`${m.x}-${m.label}`}
          x1={xScale(m.x)}
          x2={xScale(m.x)}
          y1={y1}
          y2={y2}
          className="stroke-[var(--color-border-active)]"
          strokeWidth={1}
          strokeDasharray="2 3"
        >
          <title>{m.label}</title>
        </line>
      ))}
    </>
  );
}

function ReferenceLine({
  reference,
  yScale,
  left,
  right,
}: {
  reference: { value: number; label: string } | null;
  yScale: NumericScale;
  left: number;
  right: number;
}) {
  if (!reference) return null;
  const y = yScale(reference.value);
  return (
    <g aria-hidden>
      <line
        x1={left}
        x2={right}
        y1={y}
        y2={y}
        className="stroke-[var(--color-muted)]"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      <text x={left + 3} y={y - 3} className="fill-[var(--color-muted)] font-data text-micro">
        {reference.label}
      </text>
    </g>
  );
}

function MovingAverageLine({
  average,
  xScale,
  yScale,
}: {
  average: number[];
  xScale: NumericScale;
  yScale: NumericScale;
}) {
  const pts = average.map((y, x) => ({ x, y }));
  return (
    <LinePath
      data={pts}
      x={(d) => xScale(d.x)}
      y={(d) => yScale(d.y)}
      className="stroke-[var(--color-text)]"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      fill="none"
    />
  );
}

function ChartEndLabel({ endLabel, x, y }: { endLabel: EndLabel | undefined; x: number; y: number }) {
  if (!endLabel) return null;
  return (
    <g aria-hidden>
      <text
        x={x}
        y={y}
        className="fill-[var(--color-text)] font-data text-label"
        dominantBaseline="middle"
      >
        {endLabel.valueText}
      </text>
      {endLabel.deltaText && (
        <text
          x={x}
          y={y + 13}
          fill={endLabel.deltaHex ?? undefined}
          className="font-data text-micro"
          dominantBaseline="middle"
        >
          {endLabel.deltaText}
        </text>
      )}
    </g>
  );
}

function DailyTooltip({ datum, formatY }: { datum: DailyHoverPoint; formatY: (y: number) => string }) {
  return (
    <>
      <span className="text-name">{formatY(datum.y)}</span>
      <span className="text-muted"> · {datum.label}</span>
      <span className="text-muted"> · 7d avg {formatY(Math.round(datum.avg))}</span>
    </>
  );
}

export function AnnotatedDailyChart({
  points,
  average,
  labels,
  weekend,
  referenceLine,
  eventMarkers = [],
  endLabel,
  tone = 'blue',
  width = 520,
  height = 220,
  yTicks = 4,
  formatY = formatPlainValue,
  formatTick = identityLabel,
  ariaLabel = 'Daily activity chart',
}: AnnotatedDailyChartProps) {
  if (points.length === 0) return null;

  const fill = toneHex[tone];
  const innerBottom = height - MARGIN.bottom;
  const plotLeft = MARGIN.left;
  const plotRight = width - MARGIN.right;
  const model = dailyChartModel({
    points,
    average,
    labels,
    referenceLine,
    plotLeft,
    plotRight,
  });

  const xScale = scaleLinear<number>({
    domain: [0, Math.max(1, points.length - 1)],
    range: model.xRange,
  });
  const yScale = scaleLinear<number>({
    domain: [0, model.yMax],
    range: [innerBottom, MARGIN.top],
    nice: true,
  });

  const yTickValues = yScale.ticks(yTicks).filter(Number.isInteger);
  const endY = Math.min(Math.max(yScale(model.lastAvg), MARGIN.top + 8), innerBottom - 18);

  return (
    <TimeSeriesFrame
      points={model.hover}
      xScale={xScale}
      yScale={yScale}
      width={width}
      height={height}
      margin={MARGIN}
      ariaLabel={ariaLabel}
      crosshairColor={fill}
      formatTick={formatTick}
      renderTooltip={(datum) => <DailyTooltip datum={datum} formatY={formatY} />}
    >
      <ValueAxisGrid ticks={yTickValues} y={yScale} left={plotLeft} right={plotRight} format={formatY} />
      <ChartBaseline left={plotLeft} right={plotRight} y={innerBottom} />
      <DailyBars
        points={points}
        weekend={weekend}
        xScale={xScale}
        yScale={yScale}
        barW={model.barW}
        innerBottom={innerBottom}
        fill={fill}
      />
      <DeployMarkers markers={eventMarkers} xScale={xScale} y1={MARGIN.top} y2={innerBottom} />
      <ReferenceLine reference={referenceLine} yScale={yScale} left={plotLeft} right={plotRight} />
      <MovingAverageLine average={average} xScale={xScale} yScale={yScale} />
      <ChartEndLabel endLabel={endLabel} x={model.endX} y={endY} />
    </TimeSeriesFrame>
  );
}
