'use client';

import { type SparklineTone } from './sparkline';
import { tickIndices } from './chart/chart-geometry';
import { LineChart } from './chart/line-chart';
import { ValueAxisGrid } from './chart/value-axis';

const MARGIN = { top: 8, right: 8, bottom: 24, left: 44 };

export { tickIndices } from './chart/chart-geometry';

const formatNumber = (value: number): string => String(value);
const identity = (label: string): string => label;

export type TrendChartProps = {
  data: { x: number; y: number }[];

  labels: string[];
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

export function TrendChart({
  data,
  labels,
  tone = 'blue',
  width = 520,
  height = 200,
  className,
  yTicks = 4,
  xTicks = 5,
  formatY = formatNumber,
  formatTick = identity,
  ariaLabel = 'Trend chart',
}: TrendChartProps) {
  return (
    <LineChart
      data={data}
      tone={tone}
      width={width}
      height={height}
      margin={MARGIN}
      className={className}
      ariaLabel={ariaLabel}

      computeYDomain={(ys) => [0, Math.max(...ys, 1)]}
      yNice
      fillOpacity={0.07}
      renderTooltip={(d) => (
        <>
          <span className="text-name">{formatY(d.y)}</span>

          <span className="text-muted"> · {labels[d.x] ?? d.x}</span>

        </>

      )}
      renderAxis={({ xScale, yScale, xs }) => {

        const yTickValues = yScale.ticks(yTicks).filter((t) => Number.isInteger(t));
        const xTickIdx = tickIndices(data.length, xTicks);
        return (
          <>
            <ValueAxisGrid
              ticks={yTickValues}
              y={yScale}
              left={MARGIN.left}
              right={width - MARGIN.right}
              format={formatY}
            />
            {}
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={height - MARGIN.bottom}
              y2={height - MARGIN.bottom}
              className="stroke-[var(--color-border)]"
              strokeWidth={1}
            />
            {xTickIdx.map((i) => (
              <text
                key={i}
                x={xScale(xs[i] ?? 0)}
                y={height - 6}
                textAnchor="middle"
                className="fill-[var(--color-muted)] font-data text-micro"
              >
                {formatTick(labels[i] ?? '')}
              </text>

            ))}
          </>

        );
      }}
    />
  );
}
