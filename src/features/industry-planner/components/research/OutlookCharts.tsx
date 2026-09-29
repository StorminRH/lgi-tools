'use client';

import { Area, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { useState } from 'react';
import {
  CONFIDENCE_FACTOR_LABELS,
  type BuildConfidence,
  type ConfidenceFactor,
} from '@/data/industry-math/build-confidence';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { formatIsk } from '@/lib/format/isk';
import type { ResearchInsight } from '../../research-insight';
import { FACTOR_SHORT_LABEL } from '../../research-insight-view';
import { ChartLegend, iskTick, MeterBar, SERIES } from './chart-kit';

const SAMPLES = 64;

function density(x: number, mu: number, sd: number): number {
  if (x <= 0 || sd <= 0) return 0;
  const z = (Math.log(x) - mu) / sd;
  return Math.exp(-0.5 * z * z) / (x * sd);
}

/**
 * Where the sale price may land by the time the batch sells, as a curve: the
 * area right of breakeven is the chance the build pays.
 */
export function ProfitDistribution({ insight, width, height = 132 }: { insight: ResearchInsight; width: number; height?: number }) {
  const outlook = insight.outlook;
  if (outlook === null) return <p className="py-6 text-center text-ui text-muted">Price the build to see the odds.</p>;
  const { logMean: mu, logSd: sd } = outlook.projection;
  const margin = { top: 18, right: 12, bottom: 10, left: 12 };
  const lo = Math.min(outlook.breakeven * 0.97, Math.exp(mu - 2.6 * sd));
  const hi = Math.max(outlook.breakeven * 1.03, Math.exp(mu + 2.6 * sd));
  const xs = Array.from({ length: SAMPLES }, (_, i) => lo + ((hi - lo) * i) / (SAMPLES - 1));
  const curve = xs.map((x) => ({ x, y: sd > 0 ? density(x, mu, sd) : 0 }));
  const yMax = Math.max(...curve.map((p) => p.y), 1e-12);
  const xScale = scaleLinear<number>({ domain: [lo, hi], range: [margin.left, width - margin.right] });
  const yScale = scaleLinear<number>({ domain: [0, yMax], range: [height - margin.bottom, margin.top] });
  const floor = height - margin.bottom;
  const profit = curve.filter((p) => p.x >= outlook.breakeven);
  const loss = curve.filter((p) => p.x <= outlook.breakeven);
  const odds = Math.round(outlook.probProfit * 100);
  const beX = xScale(outlook.breakeven);
  return (
    <div className="flex flex-col gap-2">
      <ChartLegend
        items={[
          { label: `Profit ${odds}%`, color: SERIES.price, mark: 'area' },
          { label: `Loss ${100 - odds}%`, color: SERIES.loss, mark: 'area' },
          { label: 'Breakeven', color: SERIES.breakeven, mark: 'dash' },
        ]}
      />
      <svg width={width} height={height} role="img" aria-label={`${odds}% chance the sale clears breakeven of ${formatIsk(outlook.breakeven)}`}>
        <Area data={loss} x={(p) => xScale(p.x)} y0={floor} y1={(p) => yScale(p.y)} fill={SERIES.loss} fillOpacity={0.28} />
        <Area data={profit} x={(p) => xScale(p.x)} y0={floor} y1={(p) => yScale(p.y)} fill={SERIES.price} fillOpacity={0.32} />
        <LinePath data={curve} x={(p) => xScale(p.x)} y={(p) => yScale(p.y)} className="stroke-[var(--color-text)]" strokeWidth={1.25} />
        <line x1={margin.left} x2={width - margin.right} y1={floor} y2={floor} className="stroke-[var(--color-border)]" />
        <line x1={beX} x2={beX} y1={margin.top - 6} y2={floor} stroke={SERIES.breakeven} strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={beX} y={margin.top - 9} textAnchor="middle" className="fill-[var(--color-text)] font-data text-micro">
          B/E {iskTick(outlook.breakeven)}
        </text>
        {(['p10', 'p50', 'p90'] as const).map((key) => (
          <line
            key={key}
            x1={xScale(outlook.projection[key])}
            x2={xScale(outlook.projection[key])}
            y1={floor}
            y2={floor + (key === 'p50' ? 6 : 4)}
            className="stroke-[var(--color-muted)]"
          />
        ))}
      </svg>
      <p className="font-data text-micro text-muted">
        Sale price P10 <span className="text-text">{formatIsk(outlook.projection.p10)}</span> · P50{' '}
        <span className="text-text">{formatIsk(outlook.projection.p50)}</span> · P90{' '}
        <span className="text-text">{formatIsk(outlook.projection.p90)}</span> · in {outlook.projection.horizonDays < 1 ? `${Math.max(1, Math.round(outlook.projection.horizonDays * 24))}h` : `${outlook.projection.horizonDays.toFixed(1)}d`}
      </p>
    </div>
  );
}

function penaltyText(factor: ConfidenceFactor): string {
  if (factor.score === null) return 'n/a';
  const lost = Math.round(factor.penalty);
  return lost <= 0 ? '0' : `−${lost}`;
}

/** Each factor's own score as a bar, with its weight and the points it costs the total. */
export function ConfidenceBars({ confidence, details }: { confidence: BuildConfidence; details?: Partial<Record<ConfidenceFactor['id'], string>> }) {
  const columns = [
    {
      key: 'factor',
      label: 'Factor',
      rowHeader: true,
      className: 'w-[36%] px-0 py-1.5 pr-3 text-micro',
      headerClassName: 'px-0 pr-3',
      render: (factor: ConfidenceFactor) => (
        <span className={confidence.weakest === factor.id ? 'text-name' : 'text-text'}>
          <span className="block">{CONFIDENCE_FACTOR_LABELS[factor.id]}</span>
          {details?.[factor.id] !== undefined && <span className="block text-faint">{details[factor.id]}</span>}
        </span>
      ),
    },
    {
      key: 'score',
      label: 'Score',
      className: 'px-0 py-1.5 pr-3 text-micro',
      headerClassName: 'px-0 pr-3',
      render: (factor: ConfidenceFactor) => (
        <span className="flex items-center gap-2">
          <MeterBar value={factor.score === null ? 0 : factor.score * 100} color={factorColor(factor)} />
          <span className="w-7 shrink-0 text-right tabular-nums">{factor.score === null ? '—' : Math.round(factor.score * 100)}</span>
        </span>
      ),
    },
    {
      key: 'weight',
      label: 'Wt',
      align: 'right',
      className: 'w-10 px-0 py-1.5 pr-2 text-micro tabular-nums text-faint',
      headerClassName: 'px-0 pr-2',
      render: (factor: ConfidenceFactor) => `${Math.round(factor.share * 100)}%`,
    },
    {
      key: 'lost',
      label: 'Pts',
      align: 'right',
      className: 'w-10 px-0 py-1.5 text-micro tabular-nums',
      headerClassName: 'px-0',
      render: penaltyText,
    },
  ] satisfies readonly StaticTableColumn<ConfidenceFactor>[];
  return (
    <StaticTable
      ariaLabel="Confidence factors: score, weight and points lost"
      columns={columns}
      rows={confidence.factors}
      getRowKey={(factor) => factor.id}
      theadClassName="[&_th]:text-micro"
    />
  );
}

function factorColor(factor: ConfidenceFactor): string {
  if (factor.score === null) return SERIES.muted;
  if (factor.score >= 0.75) return SERIES.price;
  if (factor.score >= 0.45) return SERIES.breakeven;
  return SERIES.loss;
}

/** From a perfect 100, each factor steps the score down by the points it costs. */
export function ConfidenceWaterfall({ confidence, width, height = 150 }: { confidence: BuildConfidence; width: number; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const known = confidence.factors.filter((f) => f.score !== null);
  const bars = [
    { id: 'start', label: 'Start', from: 100, to: 0 },
    ...known.reduce<{ id: string; label: string; from: number; to: number }[]>((acc, factor) => {
      const top = acc.length === 0 ? 100 : (acc.at(-1)?.to ?? 100);
      acc.push({ id: factor.id, label: FACTOR_SHORT_LABEL[factor.id], from: top, to: Math.max(0, top - factor.penalty) });
      return acc;
    }, []),
    { id: 'score', label: 'Score', from: confidence.score ?? 0, to: 0 },
  ];
  const margin = { top: 14, right: 4, bottom: 22, left: 4 };
  const slot = (width - margin.left - margin.right) / bars.length;
  const barW = Math.max(6, slot - 8);
  const y = scaleLinear<number>({ domain: [0, 100], range: [height - margin.bottom, margin.top] });
  return (
    <svg width={width} height={height} role="img" aria-label={`Confidence ${confidence.score ?? 'unknown'} of 100, built up from ${known.length} factors`}>
      {bars.map((bar, i) => {
        const x = margin.left + i * slot + (slot - barW) / 2;
        const top = y(Math.max(bar.from, bar.to));
        const h = Math.max(1, Math.abs(y(bar.from) - y(bar.to)));
        const total = bar.id === 'start' || bar.id === 'score';
        const lost = bar.from - bar.to;
        return (
          <g key={bar.id} onMouseEnter={() => setHover(bar.id)} onMouseLeave={() => setHover(null)}>
            <rect x={x - 4} y={margin.top} width={barW + 8} height={height - margin.top - margin.bottom} fill="transparent" />
            <rect
              x={x}
              y={top}
              width={barW}
              height={h}
              rx={2}
              fill={total ? SERIES.price : SERIES.loss}
              fillOpacity={total ? (bar.id === 'score' ? 0.9 : 0.35) : hover === bar.id ? 0.9 : 0.6}
            />
            <text x={x + barW / 2} y={top - 4} textAnchor="middle" className="fill-[var(--color-text)] font-data text-micro">
              {total ? Math.round(bar.from) : lost >= 0.5 ? `−${Math.round(lost)}` : '0'}
            </text>
            <text x={x + barW / 2} y={height - margin.bottom + 14} textAnchor="middle" className="fill-[var(--color-muted)] font-data text-micro">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const DIAL_R = 34;

/** The confidence score on a ring, with its band as a word so colour never carries it alone. */
export function ConfidenceDial({ score, band, size = 88 }: { score: number | null; band: string | null; size?: number }) {
  const circumference = 2 * Math.PI * DIAL_R;
  const fraction = score === null ? 0 : Math.max(0, Math.min(1, score / 100));
  const color = score === null ? SERIES.muted : score >= 75 ? SERIES.price : score >= 55 ? SERIES.average : score >= 35 ? SERIES.breakeven : SERIES.loss;
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" role="img" aria-label={`Confidence ${score ?? 'unknown'}${band ? `, ${band}` : ''}`}>
      <circle cx={44} cy={44} r={DIAL_R} fill="none" className="stroke-[var(--color-border)]" strokeWidth={7} />
      <circle
        cx={44}
        cy={44}
        r={DIAL_R}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${circumference * fraction} ${circumference}`}
        transform="rotate(-90 44 44)"
      />
      <text x={44} y={44} textAnchor="middle" dominantBaseline="central" className="fill-[var(--color-name)] font-data text-h3">
        {score ?? '—'}
      </text>
      {band !== null && (
        <text x={44} y={62} textAnchor="middle" className="fill-[var(--color-muted)] font-data text-micro uppercase">
          {band}
        </text>
      )}
    </svg>
  );
}

export interface MarginPart {
  key: string;
  label: string;
  value: number;
  color: string;
  opacity: number;
}

export function marginParts(insight: ResearchInsight, salesTaxPct: number, brokerFeePct: number): MarginPart[] | null {
  const { unit, economics } = insight;
  if (unit === null || economics === null) return null;
  const price = unit.listPrice;
  const perUnit = (value: number) => value / economics.quantityPerRun;
  const inputs = perUnit(economics.inputCost);
  const jobFee = perUnit(economics.jobFee ?? 0);
  const tax = price * (salesTaxPct / 100);
  const broker = price * (brokerFeePct / 100);
  const net = price - inputs - jobFee - tax - broker;
  return [
    { key: 'inputs', label: 'Materials', value: inputs, color: SERIES.average, opacity: 0.75 },
    { key: 'job', label: 'Job fee', value: jobFee, color: SERIES.average, opacity: 0.45 },
    { key: 'tax', label: 'Sales tax', value: tax, color: SERIES.breakeven, opacity: 0.75 },
    { key: 'broker', label: 'Broker', value: broker, color: SERIES.breakeven, opacity: 0.45 },
    { key: 'net', label: net >= 0 ? 'Profit' : 'Loss', value: net, color: net >= 0 ? SERIES.price : SERIES.loss, opacity: 0.9 },
  ];
}

/**
 * Where one unit's expected list price goes: materials, job fee, sales tax and
 * broker fee, and what's left. A loss runs past the price in red.
 */
export function MarginBreakdown({
  insight,
  salesTaxPct,
  brokerFeePct,
  width,
}: {
  insight: ResearchInsight;
  salesTaxPct: number;
  brokerFeePct: number;
  width: number;
}) {
  const parts = marginParts(insight, salesTaxPct, brokerFeePct);
  if (parts === null || insight.unit === null) return <p className="py-4 text-ui text-muted">No build cost for this blueprint yet.</p>;
  const price = insight.unit.listPrice;
  const costs = parts.filter((p) => p.key !== 'net').reduce((sum, p) => sum + p.value, 0);
  const total = Math.max(price, costs);
  const scale = (value: number) => (Math.max(0, value) / total) * width;
  const segments = parts
    .filter((p) => p.value > 0)
    .reduce<(MarginPart & { x: number; w: number })[]>((acc, p) => {
      const last = acc.at(-1);
      acc.push({ ...p, x: last === undefined ? 0 : last.x + last.w, w: scale(p.value) });
      return acc;
    }, []);
  return (
    <div className="flex flex-col gap-2">
      <svg width={width} height={22} role="img" aria-label={`Per unit at ${formatIsk(price)}: ${parts.map((p) => `${p.label} ${formatIsk(p.value)}`).join(', ')}`}>
        {segments.map((s) => (
          <rect key={s.key} x={s.x + 1} y={2} width={Math.max(1, s.w - 2)} height={18} rx={3} fill={s.color} fillOpacity={s.opacity} />
        ))}
        {costs > price && <line x1={scale(price)} x2={scale(price)} y1={0} y2={22} className="stroke-[var(--color-name)]" strokeWidth={1.5} />}
      </svg>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-data text-micro sm:grid-cols-5">
        {parts.map((p) => (
          <div key={p.key} className="flex flex-col">
            <dt className="flex items-center gap-1.5 text-muted">
              <svg width={8} height={8} aria-hidden>
                <rect width={8} height={8} rx={2} fill={p.color} fillOpacity={p.opacity} />
              </svg>
              {p.label}
            </dt>
            <dd className="tabular-nums text-text">{formatIsk(p.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
