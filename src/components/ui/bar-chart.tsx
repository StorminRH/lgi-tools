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

export type BarDatum = { label: string; value: number };

const formatNumber = (value: number): string => String(value);
const identity = (label: string): string => label;

export type BarChartProps = {
  data: BarDatum[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  className?: string;
  formatValue?: (v: number) => string;
  formatLabel?: (s: string) => string;
  ariaLabel?: string;
};

const MARGIN = { top: 8, right: 6, bottom: 20, left: 40 };

const Y_TICKS = 3;

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
    domain: [0, yMax === 0 ? 1 : yMax],
    range: [innerBottom, MARGIN.top],
    nice: true,
  });

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
              className="fill-[var(--color-muted)] font-data text-micro"
            >
              {formatLabel(d.label)}
            </text>
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
