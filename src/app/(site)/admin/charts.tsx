'use client';

import dynamic from 'next/dynamic';
import type { DailyChartSeries } from '@/components/ui/chart/daily-chart-geometry';
import type { SparklineTone } from '@/components/ui/sparkline';
import type { BarDatum } from '@/components/ui/bar-chart';
import { endLabelFor } from './end-label';
import type { Delta } from '@/composition/admin-period';

const TrendChart = dynamic(
  () => import('@/components/ui/trend-chart').then((m) => m.TrendChart),
  { ssr: false },
);

const BarChart = dynamic(
  () => import('@/components/ui/bar-chart').then((m) => m.BarChart),
  { ssr: false },
);

const AnnotatedDailyChart = dynamic(
  () => import('@/components/ui/annotated-daily-chart').then((m) => m.AnnotatedDailyChart),
  { ssr: false },
);

function formatterFor(unit: 'percent' | 'count' | 'position'): (y: number) => string {
  if (unit === 'percent') return (y) => `${y}%`;
  if (unit === 'position') return (y) => y.toFixed(1);
  return (y) => y.toLocaleString();
}

export function AdminDailyChart({
  points,
  average,
  labels,
  weekend,
  referenceLine,
  eventMarkers,
  endValue,
  endDelta,
  unit,
  invert = false,
  tone = 'blue',
  width,
  height,
  ariaLabel,
}: DailyChartSeries & {
  endValue?: number;
  endDelta?: Delta | null;
  unit: 'percent' | 'count' | 'position';
  invert?: boolean;
  tone?: SparklineTone;
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const formatY = formatterFor(unit);
  const endLabel =
    endValue === undefined
      ? undefined
      : endLabelFor(formatY(endValue), endDelta ?? null, invert);
  return (
    <AnnotatedDailyChart
      points={points}
      average={average}
      labels={labels}
      weekend={weekend}
      referenceLine={referenceLine}
      eventMarkers={eventMarkers}
      endLabel={endLabel}
      tone={tone}
      width={width}
      height={height}
      formatY={formatY}
      formatTick={(s) => s.slice(5)}
      ariaLabel={ariaLabel}
    />
  );
}

export function AdminTrendChart({
  points,
  labels,
  unit,
  tone = 'blue',
  width,
  height,
  ariaLabel,
}: {
  points: { x: number; y: number }[];
  labels: string[];
  unit: 'percent' | 'count' | 'position';
  tone?: SparklineTone;
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const formatY =
    unit === 'percent'
      ? (y: number) => `${y}%`
      : unit === 'position'
        ? (y: number) => y.toFixed(1)
        : (y: number) => y.toLocaleString();
  return (
    <TrendChart
      data={points}
      labels={labels}
      tone={tone}
      width={width}
      height={height}
      formatY={formatY}
      formatTick={(s) => s.slice(5)}
      ariaLabel={ariaLabel}
    />
  );
}

export function AdminBarChart({
  data,
  tone = 'blue',
  width,
  height,
  ariaLabel,
}: {
  data: BarDatum[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  return (
    <BarChart
      data={data}
      tone={tone}
      width={width}
      height={height}
      formatValue={(v) => v.toLocaleString()}
      ariaLabel={ariaLabel}
    />
  );
}
