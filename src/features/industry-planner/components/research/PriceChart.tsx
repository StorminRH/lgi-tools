'use client';

import { Area, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { TimeSeriesFrame } from '@/components/ui/chart/chart-frame';
import { paddedDomain } from '@/components/ui/chart/chart-geometry';
import { ValueAxisGrid } from '@/components/ui/chart/value-axis';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity } from '@/lib/format/number';
import type { ResearchInsight } from '../../research-insight';
import { ChartLegend, iskTick, type LegendItem, SERIES, shortDate, TipRows } from './chart-kit';

const FORECAST_DAYS_MAX = 30;

interface PricePoint {
  x: number;
  y: number;
  label: string;
  high: number;
  low: number;
  volume: number;
  ma30: number | null;
}

function pricePoints(insight: ResearchInsight): PricePoint[] {
  return insight.days.map((day, i) => ({
    x: i,
    y: day.average,
    label: day.date,
    high: day.high,
    low: day.low,
    volume: day.volume,
    ma30: insight.ma30[i] ?? null,
  }));
}

function forecastCone(insight: ResearchInsight, lastX: number, lastPrice: number) {
  const projection = insight.outlook?.projection;
  if (projection === undefined || projection.horizonDays <= 0) return null;
  const span = Math.min(FORECAST_DAYS_MAX, Math.max(1, projection.horizonDays));
  const steps = 12;
  const z = 1.2815515655446004;
  const start = Math.log(insight.unit?.listPrice ?? lastPrice);
  const drift = (projection.logMean - start) / projection.horizonDays;
  const sdPerDay = projection.logSd / Math.sqrt(projection.horizonDays);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (span * i) / steps;
    const mu = start + drift * t;
    const sd = sdPerDay * Math.sqrt(t);
    return { x: lastX + t, p10: Math.exp(mu - z * sd), p50: Math.exp(mu), p90: Math.exp(mu + z * sd) };
  });
}

function ReferenceLine({
  y,
  left,
  right,
  color,
  dashed,
  label,
}: {
  y: number;
  left: number;
  right: number;
  color: string;
  dashed?: boolean;
  label: string;
}) {
  return (
    <g>
      <line x1={left} x2={right} y1={y} y2={y} stroke={color} strokeWidth={1.25} strokeDasharray={dashed ? '5 4' : undefined} />
      <text x={right + 6} y={y} dominantBaseline="central" className="fill-[var(--color-text)] font-data text-micro">
        {label}
      </text>
    </g>
  );
}

export function priceLegend(insight: ResearchInsight): LegendItem[] {
  const items: LegendItem[] = [
    { label: 'Daily average', color: SERIES.price, mark: 'line' },
    { label: 'Daily range', color: SERIES.price, mark: 'area' },
    { label: '30-day average', color: SERIES.average, mark: 'line' },
  ];
  if (insight.outlook !== null) {
    items.push({ label: 'Breakeven', color: SERIES.breakeven, mark: 'dash' });
    items.push({ label: 'Forecast P10–P90', color: SERIES.forecast, mark: 'area' });
  }
  return items;
}

/**
 * Ninety days of Jita trading: the daily average inside its clipped high–low
 * range, the 30-day average, and — once the build is priced — the breakeven
 * line and a cone of where the price may sit by the time the batch sells.
 */
export function PriceChart({
  insight,
  width,
  height = 240,
  legend = true,
}: {
  insight: ResearchInsight;
  width: number;
  height?: number;
  legend?: boolean;
}) {
  const points = pricePoints(insight);
  const last = points.at(-1);
  if (last === undefined || points.length < 2) {
    return <p className="py-10 text-center text-ui text-muted">No trading history for this product yet.</p>;
  }
  const breakeven = insight.outlook?.breakeven ?? null;
  const cone = forecastCone(insight, last.x, last.y);
  const margin = { top: 10, right: 92, bottom: 24, left: 56 };
  const values = [
    ...points.flatMap((p) => [p.high, p.low]),
    ...(cone ?? []).flatMap((c) => [c.p10, c.p90]),
    ...(breakeven === null ? [] : [breakeven]),
    ...(insight.sell === null ? [] : [insight.sell]),
  ];
  const xMax = cone?.at(-1)?.x ?? last.x;
  const xScale = scaleLinear<number>({ domain: [0, xMax], range: [margin.left, width - margin.right] });
  const yScale = scaleLinear<number>({ domain: paddedDomain(values), range: [height - margin.bottom, margin.top], nice: true });
  const right = width - margin.right;
  const ma30 = points.filter((p): p is PricePoint & { ma30: number } => p.ma30 !== null);

  return (
    <div className="flex flex-col gap-2">
      {legend && <ChartLegend items={priceLegend(insight)} />}
      <TimeSeriesFrame
        points={points}
        xScale={xScale}
        yScale={yScale}
        width={width}
        height={height}
        margin={margin}
        ariaLabel={`${insight.name}: daily average price over ${points.length} days`}
        crosshairColor={SERIES.price}
        formatTick={shortDate}
        renderTooltip={(p) => (
          <TipRows
            title={shortDate(p.label)}
            rows={[
              ['Average', formatIsk(p.y)],
              ['Range', `${formatIsk(p.low)} – ${formatIsk(p.high)}`],
              ['30-day avg', formatIsk(p.ma30)],
              ['Volume', formatCompactQuantity(p.volume)],
            ]}
          />
        )}
      >
        <ValueAxisGrid ticks={yScale.ticks(4)} y={yScale} left={margin.left} right={right} format={iskTick} />
        <Area<PricePoint>
          data={points}
          x={(p) => xScale(p.x)}
          y0={(p) => yScale(p.low)}
          y1={(p) => yScale(p.high)}
          fill={SERIES.price}
          fillOpacity={0.14}
        />
        {cone !== null && (
          <g data-forecast>
            <line x1={xScale(last.x)} x2={xScale(last.x)} y1={margin.top} y2={height - margin.bottom} className="stroke-[var(--color-border)]" />
            <Area
              data={cone}
              x={(c) => xScale(c.x)}
              y0={(c) => yScale(c.p10)}
              y1={(c) => yScale(c.p90)}
              fill={SERIES.forecast}
              fillOpacity={0.18}
            />
            <LinePath data={cone} x={(c) => xScale(c.x)} y={(c) => yScale(c.p50)} stroke={SERIES.forecast} strokeWidth={1.5} strokeDasharray="4 3" />
          </g>
        )}
        <LinePath data={ma30} x={(p) => xScale(p.x)} y={(p) => yScale(p.ma30)} stroke={SERIES.average} strokeWidth={1.5} />
        <LinePath data={points} x={(p) => xScale(p.x)} y={(p) => yScale(p.y)} stroke={SERIES.price} strokeWidth={2} strokeLinejoin="round" />
        {insight.sell !== null && (
          <ReferenceLine y={yScale(insight.sell)} left={margin.left} right={right} color={SERIES.muted} label={`Ask ${iskTick(insight.sell)}`} />
        )}
        {breakeven !== null && (
          <ReferenceLine
            y={yScale(breakeven)}
            left={margin.left}
            right={right}
            color={SERIES.breakeven}
            dashed
            label={`B/E ${iskTick(breakeven)}`}
          />
        )}
      </TimeSeriesFrame>
    </div>
  );
}

interface VolumePoint {
  x: number;
  y: number;
  label: string;
  orders: number;
}

/** Units traded each day, with the 30-day average as a reference line. */
export function VolumeChart({ insight, width, height = 96 }: { insight: ResearchInsight; width: number; height?: number }) {
  const points: VolumePoint[] = insight.days.map((day, i) => ({ x: i, y: day.volume, label: day.date, orders: day.orderCount }));
  if (points.length < 2) return null;
  const margin = { top: 6, right: 92, bottom: 22, left: 56 };
  const max = Math.max(1, ...points.map((p) => p.y));
  const xScale = scaleLinear<number>({ domain: [0, points.length - 1], range: [margin.left, width - margin.right] });
  const yScale = scaleLinear<number>({ domain: [0, max], range: [height - margin.bottom, margin.top], nice: true });
  const step = (width - margin.left - margin.right) / points.length;
  const barW = Math.max(1, step - 2);
  const adv = insight.flow?.adv ?? null;
  const floor = height - margin.bottom;
  return (
    <TimeSeriesFrame
      points={points}
      xScale={xScale}
      yScale={yScale}
      width={width}
      height={height}
      margin={margin}
      ariaLabel={`${insight.name}: units traded per day`}
      crosshairColor={SERIES.price}
      formatTick={shortDate}
      renderTooltip={(p) => (
        <TipRows title={shortDate(p.label)} rows={[['Volume', formatCompactQuantity(p.y)], ['Trades', formatCompactQuantity(p.orders)]]} />
      )}
    >
      <ValueAxisGrid ticks={yScale.ticks(2)} y={yScale} left={margin.left} right={width - margin.right} format={formatCompactQuantity} />
      {points.map((p) => (
        <rect
          key={p.x}
          x={xScale(p.x) - barW / 2}
          y={yScale(p.y)}
          width={barW}
          height={Math.max(0, floor - yScale(p.y))}
          rx={Math.min(2, barW / 2)}
          fill={SERIES.price}
          fillOpacity={0.55}
        />
      ))}
      {adv !== null && (
        <ReferenceLine
          y={yScale(adv)}
          left={margin.left}
          right={width - margin.right}
          color={SERIES.average}
          label={`30d ${formatCompactQuantity(adv)}/d`}
        />
      )}
    </TimeSeriesFrame>
  );
}
