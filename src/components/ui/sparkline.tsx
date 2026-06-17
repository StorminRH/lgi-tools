'use client';

import { useRef } from 'react';
import { LinePath, AreaClosed } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { useTooltip } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { cn } from './cn';
import { toneHex, type Tone } from './tones';
import { useCssomTooltip } from './use-cssom-tooltip';

/**
 * Compact line chart ("sparkline") for a small ordered series — a price
 * history, a volume trend, etc. The first reusable viz primitive built on
 * `visx`, and the proof that the library is safe under the production CSP.
 *
 * Why this is CSP-clean (CLAUDE.md: `style-src 'self'` drops inline `style=`):
 *  - The chart geometry is pure SVG presentation attributes (`stroke`, `fill`,
 *    `d`, `x`, `y`) and `className` — never an inline `style` attribute.
 *  - The tooltip is rendered by THIS component (not `@visx/tooltip`'s
 *    `Tooltip`/`TooltipWithBounds`/`TooltipInPortal`, which all position via an
 *    inline `style`). Only `useTooltip` — a state-only hook — is imported. The
 *    tooltip's runtime position is set as `--tt-x` / `--tt-y` custom properties
 *    via the CSSOM (`ref.style.setProperty`), exactly like `ProgressBar`; the
 *    `.sparkline-tooltip` rule in globals.css reads them. JS-applied styles
 *    aren't gated by the CSP, unlike a `style="…"` attribute.
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

// ── Pure helpers (unit-tested in sparkline.test.ts) ──────────────────────

/** Min/max of a non-empty list, in one pass. */
export function extent(values: number[]): [number, number] {
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/**
 * Domain for the value axis with a little headroom so the line never rides the
 * top/bottom edge, and a flat series still gets a non-degenerate range.
 */
export function paddedDomain(values: number[]): [number, number] {
  const [min, max] = extent(values);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
  return [min - pad, max + pad];
}

/** Index of the datum whose x is closest to the probe x (linear scan; series are short). */
export function nearestIndex(xs: number[], x: number): number {
  if (xs.length === 0) return -1;
  let best = 0;
  let bestDist = Math.abs(xs[0] - x);
  for (let i = 1; i < xs.length; i += 1) {
    const dist = Math.abs(xs[i] - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────

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
  formatX = (x) => String(x),
  formatY = (y) => String(y),
  ariaLabel = 'Trend sparkline',
}: SparklineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    showTooltip,
    hideTooltip,
  } = useTooltip<SparklinePoint>();
  const tooltipRef = useCssomTooltip(tooltipLeft, tooltipTop, tooltipOpen);

  const stroke = toneHex[tone];

  if (data.length === 0) return null;

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);

  const xScale = scaleLinear<number>({
    domain: extent(xs),
    range: [MARGIN.left, width - MARGIN.right],
  });
  const yScale = scaleLinear<number>({
    domain: paddedDomain(ys),
    range: [height - MARGIN.bottom, MARGIN.top],
  });

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const point = localPoint(svgRef.current as Element, event.nativeEvent);
    if (!point) return;
    const probe = xScale.invert(point.x);
    const idx = nearestIndex(xs, probe);
    const datum = data[idx];
    showTooltip({
      tooltipData: datum,
      tooltipLeft: xScale(datum.x),
      tooltipTop: yScale(datum.y),
    });
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block overflow-visible"
      >
        <AreaClosed
          data={data}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          yScale={yScale}
          fill={stroke}
          fillOpacity={0.08}
          stroke="none"
        />
        <LinePath
          data={data}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.y)}
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />

        {tooltipOpen && tooltipLeft != null && tooltipTop != null && (
          <g aria-hidden>
            <line
              x1={tooltipLeft}
              x2={tooltipLeft}
              y1={MARGIN.top}
              y2={height - MARGIN.bottom}
              className="stroke-[var(--color-muted)]"
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <circle cx={tooltipLeft} cy={tooltipTop} r={3} fill={stroke} />
          </g>
        )}

        {/* Transparent capture layer for hover; presentation attrs only. */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={Math.max(0, width - MARGIN.left - MARGIN.right)}
          height={Math.max(0, height - MARGIN.top - MARGIN.bottom)}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={hideTooltip}
        />
      </svg>

      {tooltipOpen && tooltipData && (
        <div ref={tooltipRef} className="sparkline-tooltip" aria-hidden>
          <div className="sparkline-tooltip-box font-mono">
            <span className="text-name">{formatY(tooltipData.y)}</span>
            <span className="text-muted"> · {formatX(tooltipData.x)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
