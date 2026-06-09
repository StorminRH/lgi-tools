'use client';

import dynamic from 'next/dynamic';
import type { SparklineTone } from '@/components/ui/sparkline';
import type { BarDatum } from '@/components/ui/bar-chart';

// Client-only chart wrappers for the admin dashboard. `ssr: false` keeps the
// interactive SVG/tooltip markup out of the server-rendered shell (it can only
// be set inside a Client Component — hence this module). The server passes
// only serializable data; the formatter functions are built here, client-side,
// because functions can't cross the server→client boundary.

const TrendChart = dynamic(
  () => import('@/components/ui/trend-chart').then((m) => m.TrendChart),
  { ssr: false },
);

const BarChart = dynamic(
  () => import('@/components/ui/bar-chart').then((m) => m.BarChart),
  { ssr: false },
);

// A day-indexed trend line. `points` carry numeric x (the ordinal day index)
// and y; `labels[x]` is the day string shown in the tooltip (and, compacted to
// MM-DD, along the x axis). `unit` picks the y formatter so no function prop
// has to be serialized from the server. `position` is for search-result rank
// (one decimal, no suffix; lower is better).
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

// Categorical counts. Same serialization story as AdminTrendChart.
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
