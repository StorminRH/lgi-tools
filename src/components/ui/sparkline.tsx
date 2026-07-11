'use client';

import { type Tone } from './tones';
import { paddedDomain } from './chart/chart-geometry';
import { LineChart } from './chart/line-chart';

/**
 * Compact line chart ("sparkline") for a small ordered series — a price
 * history, a volume trend, etc. A thin config over the shared {@link LineChart}
 * core: padded (headroom) y-domain, no axes, faint fill.
 */

// The viz tones this primitive blesses. A curated subset of the shared
// vocabulary — saturated families that read as a single line on the dark
// surface. The hexes come from the canonical `toneHex` map (tones.ts); this
// only narrows which tones a chart accepts.
export type SparklineTone = Extract<
  Tone,
  'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal'
>;

export type SparklinePoint = { x: number; y: number };

// Pure geometry helpers live in ./chart/chart-geometry; re-exported here so the
// existing `sparkline.test.ts` pin keeps importing them from './sparkline'.
export { extent, paddedDomain, nearestIndex } from './chart/chart-geometry';

const formatNumber = (value: number): string => String(value);

type SparklineProps = {
  data: SparklinePoint[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
  className?: string;
  /** Format the hovered x for the tooltip (e.g. a date). Defaults to the raw number. */
  formatX?: (x: number) => string;
  /** Format the hovered y for the tooltip (e.g. ISK). Defaults to the raw number. */
  formatY?: (y: number) => string;
  ariaLabel?: string;
};

const MARGIN = { top: 6, right: 4, bottom: 6, left: 4 };

export function Sparkline({
  data,
  tone = 'green',
  width = 260,
  height = 72,
  className,
  formatX = formatNumber,
  formatY = formatNumber,
  ariaLabel = 'Trend sparkline',
}: SparklineProps) {
  return (
    <LineChart
      data={data}
      tone={tone}
      width={width}
      height={height}
      margin={MARGIN}
      className={className}
      ariaLabel={ariaLabel}
      computeYDomain={paddedDomain}
      fillOpacity={0.08}
      renderTooltip={(d) => (
        <>
          <span className="text-name">{formatY(d.y)}</span>
          <span className="text-muted"> · {formatX(d.x)}</span>
        </>
      )}
    />
  );
}
