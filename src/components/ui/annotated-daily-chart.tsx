'use client';

import { LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { type SparklineTone } from './sparkline';
import { toneHex } from './tones';
import { dailyChartModel, type DailyHoverPoint } from './chart/daily-chart-geometry';
import { tickIndices } from './chart/chart-geometry';
import { useChartHover } from './chart/use-chart-hover';
import { ChartCanvas } from './chart/chart-canvas';
import { ValueAxisGrid } from './chart/value-axis';
import { HoverCaptureRect, HoverCrosshair } from './chart/hover-layer';
import { continuousHoverHandler } from './chart/hover';

/**
 * The analytical daily chart: discrete daily bars (weekends de-emphasised), a
 * 7-day moving-average line, a dashed prior-period reference line, optional
 * deploy markers, and a right-gutter end label — every question answerable at
 * rest. The full-size sibling of {@link TrendChart} for count series where the
 * smooth area misleads (it implies values between days that don't exist).
 *
 * All analytics are computed server-side; this component receives plain arrays
 * (`points`, `average`, `weekend`) and pre-resolved display strings, and derives
 * its geometry through the pure {@link dailyChartModel}. Colours come from the
 * tones map (bars) and theme tokens (average line, reference, markers) — the
 * charts stay on one blue accent, so weekend bars are the same blue, dimmed.
 */

type NumericScale = (value: number) => number;

type EndLabel = {
  valueText: string;
  deltaText: string | null;
  /** Pre-resolved delta colour (from tones, chosen in the app-layer wrapper). */
  deltaHex: string | null;
};

type AnnotatedDailyChartProps = {
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
  className?: string;
  yTicks?: number;
  xTicks?: number;
  formatY?: (y: number) => string;
  formatTick?: (label: string) => string;
  ariaLabel?: string;
};

// Wide right gutter for the end label; left room for value-axis labels.
const MARGIN = { top: 10, right: 66, bottom: 24, left: 44 };

const formatNumber = (value: number): string => String(value);
const identity = (label: string): string => label;

// Daily bars — weekend bars dimmed (same blue accent, lower opacity).
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

// A faint dashed vertical rule per changelog day within range.
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

// Dashed prior-period reference line + its label; nothing when suppressed.
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
      <text x={left + 3} y={y - 3} className="fill-[var(--color-muted)] font-mono text-micro">
        {reference.label}
      </text>
    </g>
  );
}

// 7-day moving-average line, in the bright foreground token.
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

// Right-gutter end label: current value + week-over-week delta; nothing when absent.
function ChartEndLabel({ endLabel, x, y }: { endLabel: EndLabel | undefined; x: number; y: number }) {
  if (!endLabel) return null;
  return (
    <g aria-hidden>
      <text
        x={x}
        y={y}
        className="fill-[var(--color-text)] font-mono text-label"
        dominantBaseline="middle"
      >
        {endLabel.valueText}
      </text>
      {endLabel.deltaText && (
        <text
          x={x}
          y={y + 13}
          fill={endLabel.deltaHex ?? undefined}
          className="font-mono text-micro"
          dominantBaseline="middle"
        >
          {endLabel.deltaText}
        </text>
      )}
    </g>
  );
}

// X-axis date labels at the chosen tick indices.
function DailyXAxis({
  idx,
  labels,
  xScale,
  y,
  formatTick,
}: {
  idx: number[];
  labels: string[];
  xScale: NumericScale;
  y: number;
  formatTick: (label: string) => string;
}) {
  return (
    <>
      {idx.map((i) => (
        <text
          key={i}
          x={xScale(i)}
          y={y}
          textAnchor="middle"
          className="fill-[var(--color-muted)] font-mono text-micro"
        >
          {formatTick(labels[i] ?? '')}
        </text>
      ))}
    </>
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
  className,
  yTicks = 4,
  xTicks = 5,
  formatY = formatNumber,
  formatTick = identity,
  ariaLabel = 'Daily activity chart',
}: AnnotatedDailyChartProps) {
  const hover = useChartHover<DailyHoverPoint>();
  const fill = toneHex[tone];

  if (points.length === 0) return null;

  const innerBottom = height - MARGIN.bottom;
  const plotLeft = MARGIN.left;
  const plotRight = width - MARGIN.right;
  const model = dailyChartModel({
    points,
    average,
    labels,
    referenceLine,
    plotWidth: plotRight - plotLeft,
  });

  const xScale = scaleLinear<number>({
    domain: [0, Math.max(1, points.length - 1)],
    range: [plotLeft, plotRight],
  });
  const yScale = scaleLinear<number>({
    domain: [0, model.yMax],
    range: [innerBottom, MARGIN.top],
    nice: true,
  });

  const yTickValues = yScale.ticks(yTicks).filter(Number.isInteger);
  const xTickIdx = tickIndices(points.length, xTicks);
  const endY = Math.min(Math.max(yScale(model.lastAvg), MARGIN.top + 8), innerBottom - 18);

  const handleMove = continuousHoverHandler({
    svgRef: hover.svgRef,
    xScale,
    yScale,
    xs: model.xs,
    data: model.hover,
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
      tooltip={datum && <DailyTooltip datum={datum} formatY={formatY} />}
    >
      <ValueAxisGrid ticks={yTickValues} y={yScale} left={plotLeft} right={plotRight} format={formatY} />
      <line
        x1={plotLeft}
        x2={plotRight}
        y1={innerBottom}
        y2={innerBottom}
        className="stroke-[var(--color-border)]"
        strokeWidth={1}
      />
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
      <ChartEndLabel endLabel={endLabel} x={plotRight + 5} y={endY} />
      <DailyXAxis idx={xTickIdx} labels={labels} xScale={xScale} y={height - 6} formatTick={formatTick} />
      <HoverCrosshair
        open={hover.tooltipOpen}
        left={hover.tooltipLeft}
        top={hover.tooltipTop}
        y1={MARGIN.top}
        y2={innerBottom}
        color={fill}
      />
      <HoverCaptureRect
        x={plotLeft}
        y={MARGIN.top}
        width={Math.max(0, plotRight - plotLeft)}
        height={Math.max(0, innerBottom - MARGIN.top)}
        onMove={handleMove}
        onLeave={hover.hideTooltip}
      />
    </ChartCanvas>
  );
}
