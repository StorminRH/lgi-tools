'use client';

import { LinePath } from '@visx/shape';
import { scaleLinear, scaleSqrt } from '@visx/scale';
import { useState } from 'react';
import { cn } from '@/components/ui/cn';
import { formatIsk } from '@/lib/format/isk';
import { formatPct } from '@/lib/format/number';
import type { ResearchInsight } from '../../research-insight';
import { ChartLegend, SERIES, TipRows } from './chart-kit';

/** The last month's daily average as a bare line, for a table row or a card. */
export function Spark({
  insight,
  width = 96,
  height = 28,
  days = 30,
}: {
  insight: ResearchInsight;
  width?: number;
  height?: number;
  days?: number;
}) {
  const values = insight.days.slice(-days).map((day) => day.average);
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = scaleLinear<number>({ domain: [0, values.length - 1], range: [1, width - 3] });
  const y = scaleLinear<number>({ domain: min === max ? [min - 1, max + 1] : [min, max], range: [height - 2, 2] });
  const lastX = x(values.length - 1);
  const lastY = y(values.at(-1) ?? 0);
  const change = values[0] ? ((values.at(-1) ?? 0) / values[0] - 1) * 100 : 0;
  return (
    <svg width={width} height={height} role="img" aria-label={`${insight.name}: ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% over ${values.length} days`}>
      <LinePath data={values} x={(_, i) => x(i)} y={(v) => y(v)} stroke={SERIES.price} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={SERIES.price} />
    </svg>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Each weekday's volume against the average day; the busiest is labelled. */
export function WeekdayBars({ index, width, height = 72 }: { index: number[] | null; width: number; height?: number }) {
  if (index === null) return <p className="py-3 text-ui text-muted">Needs two weeks of trading.</p>;
  const max = Math.max(...index, 1.2);
  const slot = width / 7;
  const barW = Math.max(6, slot - 6);
  const floor = height - 16;
  const y = scaleLinear<number>({ domain: [0, max], range: [floor, 12] });
  const busiest = index.indexOf(Math.max(...index));
  return (
    <svg width={width} height={height} role="img" aria-label={`Busiest day ${WEEKDAYS[busiest]}, ${Math.round(((index[busiest] ?? 1) - 1) * 100)}% above an average day`}>
      <line x1={0} x2={width} y1={y(1)} y2={y(1)} className="stroke-[var(--color-border-active)]" />
      {index.map((value, i) => {
        const x = i * slot + (slot - barW) / 2;
        return (
          <g key={WEEKDAYS[i]}>
            <rect x={x} y={y(value)} width={barW} height={Math.max(1, floor - y(value))} rx={2} fill={SERIES.average} fillOpacity={i === busiest ? 0.95 : 0.5} />
            <text x={x + barW / 2} y={height - 3} textAnchor="middle" className="fill-[var(--color-muted)] font-data text-micro">
              {WEEKDAYS[i]?.[0]}
            </text>
            {i === busiest && (
              <text x={x + barW / 2} y={y(value) - 3} textAnchor="middle" className="fill-[var(--color-text)] font-data text-micro">
                +{Math.round((value - 1) * 100)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface MapPoint {
  insight: ResearchInsight;
  x: number;
  y: number;
  r: number;
}

const MARGIN_LIMITS: [number, number] = [-40, 80];

/** A margin axis in steps of ten that holds every point, zero, and a little room. */
export function marginDomain(margins: readonly number[]): [number, number] {
  const lo = Math.min(-10, ...margins.map((m) => m - 4));
  const hi = Math.max(20, ...margins.map((m) => m + 4));
  return [
    Math.max(MARGIN_LIMITS[0], Math.floor(lo / 10) * 10),
    Math.min(MARGIN_LIMITS[1], Math.ceil(hi / 10) * 10),
  ];
}

function mapPoints(insights: readonly ResearchInsight[], domain: [number, number]) {
  const withData = insights.filter((i) => i.outlook !== null && i.confidence.score !== null);
  const volumes = withData.map((i) => i.flow?.iskPerDay ?? 0);
  const r = scaleSqrt<number>({ domain: [0, Math.max(1, ...volumes)], range: [4, 14] });
  return withData.map((insight) => ({
    insight,
    x: Math.max(domain[0], Math.min(domain[1], insight.outlook?.marginPct.p50 ?? 0)),
    y: insight.confidence.score ?? 0,
    r: r(insight.flow?.iskPerDay ?? 0),
  }));
}

const LABEL_HEIGHT = 13;

/**
 * Screen rows for point labels that don't collide: labels are placed top
 * down and each is pushed below any earlier label it would overlap.
 */
export function placeLabels(
  points: readonly { id: number; x: number; y: number; width: number }[],
): Map<number, number> {
  const placed: { x: number; y: number; width: number }[] = [];
  const rows = new Map<number, number>();
  for (const point of [...points].sort((a, b) => a.y - b.y)) {
    let y = point.y;
    for (const other of placed) {
      const overlapX = point.x < other.x + other.width && other.x < point.x + point.width;
      if (overlapX && Math.abs(y - other.y) < LABEL_HEIGHT) y = other.y + LABEL_HEIGHT;
    }
    placed.push({ x: point.x, y, width: point.width });
    rows.set(point.id, y);
  }
  return rows;
}

/**
 * Every watched product by expected margin (across) and confidence (up),
 * sized by the ISK the market trades a day. Products a screen rules out are
 * hollow. The top-right corner is where builds pay and sell.
 */
export function OpportunityMap({
  insights,
  width,
  height = 280,
  selected,
  onSelect,
  confidenceFloor = 55,
}: {
  insights: readonly ResearchInsight[];
  width: number;
  height?: number;
  selected?: number | null;
  onSelect?: (blueprintTypeId: number) => void;
  confidenceFloor?: number;
}) {
  const [hover, setHover] = useState<MapPoint | null>(null);
  const domain = marginDomain(
    insights.flatMap((i) => (i.outlook === null ? [] : [i.outlook.marginPct.p50])),
  );
  const points = mapPoints(insights, domain);
  const margin = { top: 16, right: 16, bottom: 34, left: 40 };
  const x = scaleLinear<number>({ domain, range: [margin.left, width - margin.right] });
  const y = scaleLinear<number>({ domain: [0, 100], range: [height - margin.bottom, margin.top] });
  const xTicks = x.ticks(6);
  const labelled = new Set(
    [...points].sort((a, b) => b.y - a.y).slice(0, 5).map((p) => p.insight.blueprintTypeId).concat(selected ?? []),
  );
  const labelRows = placeLabels(
    points
      .filter((p) => labelled.has(p.insight.blueprintTypeId))
      .map((p) => ({ id: p.insight.blueprintTypeId, x: x(p.x) + p.r + 4, y: y(p.y), width: p.insight.name.length * 6.2 })),
  );
  const floorY = y(confidenceFloor);
  const zeroX = x(0);
  return (
    <div className="flex flex-col gap-2">
      <ChartLegend
        items={[
          { label: 'Passes screens', color: SERIES.price, mark: 'dot' },
          { label: 'Screened out (hollow)', color: SERIES.muted, mark: 'dot' },
        ]}
      />
      <div className="relative">
        <svg width={width} height={height} role="img" aria-label={`Opportunity map of ${points.length} watched products: expected margin against confidence`}>
          <rect x={zeroX} y={margin.top} width={Math.max(0, width - margin.right - zeroX)} height={Math.max(0, floorY - margin.top)} fill={SERIES.price} fillOpacity={0.05} />
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={margin.top} y2={height - margin.bottom} className={t === 0 ? 'stroke-[var(--color-border-active)]' : 'stroke-[var(--color-border-soft)]'} />
              <text x={x(t)} y={height - margin.bottom + 14} textAnchor="middle" className="fill-[var(--color-muted)] font-data text-micro">
                {t}%
              </text>
            </g>
          ))}
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} className="stroke-[var(--color-border-soft)]" />
              <text x={margin.left - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="fill-[var(--color-muted)] font-data text-micro">
                {t}
              </text>
            </g>
          ))}
          <line x1={margin.left} x2={width - margin.right} y1={floorY} y2={floorY} className="stroke-[var(--color-border-active)]" />
          <text x={width - margin.right - 4} y={margin.top + 12} textAnchor="end" className="fill-[var(--color-isk)] font-data text-micro">
            BUILD
          </text>
          <text x={margin.left + 4} y={floorY + 12} className="fill-[var(--color-faint)] font-data text-micro">
            BELOW {confidenceFloor}
          </text>
          <text x={(margin.left + width - margin.right) / 2} y={height - 4} textAnchor="middle" className="fill-[var(--color-muted)] font-data text-micro">
            Expected margin after fees →
          </text>
          {points.map((p) => {
            const screened = p.insight.gates.length > 0;
            const isSelected = selected === p.insight.blueprintTypeId;
            const cx = x(p.x);
            const cy = y(p.y);
            return (
              <g
                key={p.insight.blueprintTypeId}
                className={onSelect ? 'cursor-pointer' : undefined}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(p.insight.blueprintTypeId)}
              >
                <circle cx={cx} cy={cy} r={Math.max(12, p.r + 4)} fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={p.r}
                  fill={screened ? 'none' : SERIES.price}
                  fillOpacity={isSelected ? 0.95 : 0.6}
                  stroke={screened ? SERIES.muted : isSelected ? 'var(--color-name)' : 'var(--color-section)'}
                  strokeWidth={2}
                />
                {labelRows.has(p.insight.blueprintTypeId) && (
                  <text
                    x={cx + p.r + 4}
                    y={labelRows.get(p.insight.blueprintTypeId)}
                    dominantBaseline="central"
                    className={cn('font-ui text-micro', isSelected ? 'fill-[var(--color-name)]' : 'fill-[var(--color-text)]')}
                  >
                    {p.insight.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-ctl border border-border glass-panel px-2.5 py-2 font-data">
            <TipRows
              title={hover.insight.name}
              rows={[
                ['Margin', formatPct(hover.insight.outlook?.marginPct.p50 ?? null)],
                ['Confidence', String(hover.insight.confidence.score ?? '—')],
                ['Traded / day', formatIsk(hover.insight.flow?.iskPerDay ?? null)],
                ['Screens', hover.insight.gates.length === 0 ? 'pass' : hover.insight.gates.map((g) => g.id).join(', ')],
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
