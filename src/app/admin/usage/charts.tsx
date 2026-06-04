'use client';

import dynamic from 'next/dynamic';
import type { SparklineTone } from '@/components/ui/sparkline';

// Client-only chart wrappers for the admin dashboard. `ssr: false` keeps the
// interactive SVG/tooltip markup out of the server-rendered shell (it can only
// be set inside a Client Component — hence this module), exactly like the
// dev/sparkline demo. The server passes only serializable data; the tooltip
// formatter functions are built here, client-side, because functions can't
// cross the server→client boundary.

const Sparkline = dynamic(
  () => import('@/components/ui/sparkline').then((m) => m.Sparkline),
  { ssr: false },
);

export const BarChart = dynamic(
  () => import('@/components/ui/bar-chart').then((m) => m.BarChart),
  { ssr: false },
);

// A day-indexed trend line. `points` carry numeric x (the ordinal day index)
// and y; `labels[x]` is the day string shown in the tooltip. `unit` picks the
// y formatter so no function prop has to be serialized from the server.
// `position` is for search-result rank (one decimal, no suffix; lower is better).
export function TrendChart({
  points,
  labels,
  unit,
  tone,
  width = 440,
  height = 110,
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
  const formatX = (x: number) => labels[Math.round(x)] ?? '';
  const formatY =
    unit === 'percent'
      ? (y: number) => `${y}%`
      : unit === 'position'
        ? (y: number) => y.toFixed(1)
        : (y: number) => y.toLocaleString();
  return (
    <Sparkline
      data={points}
      tone={tone}
      width={width}
      height={height}
      formatX={formatX}
      formatY={formatY}
      ariaLabel={ariaLabel}
    />
  );
}
