import type { SparklineTone } from '../sparkline';
import { toneHex } from '../tones';
import { extent } from './chart-geometry';

// A static, presentation-only sparkline: one mini polyline with an end dot, no
// axes and no hover. Server-renderable plain SVG, so a MetricTable row can draw
// its recent-trend glyph without a client boundary or a tooltip. Geometry is
// expressed through SVG presentation attributes only (the house rule); the
// stroke colour comes from the shared tones map, like the other charts. A flat
// series draws a centred line; a single point draws just the end dot.

type StaticSparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  tone?: SparklineTone;
  ariaLabel?: string;
};

/**
 * Renders the domain-neutral static sparkline from display-ready caller data; callers own units
 * and labels while this primitive owns geometry and interaction.
 */
export function StaticSparkline({
  values,
  width = 96,
  height = 24,
  tone = 'blue',
  ariaLabel,
}: StaticSparklineProps) {
  if (values.length === 0) return null;
  const stroke = toneHex[tone];
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const [min, max] = extent(values);
  const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    // Flat series (min === max) sits on the vertical centre; otherwise higher
    // values map higher on screen (smaller y).
    const norm = max === min ? 0.5 : (v - min) / (max - min);
    return { x: pad + i * stepX, y: pad + innerH - norm * innerH };
  });
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const end = points[points.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      {points.length > 1 && (
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <circle cx={end.x} cy={end.y} r={1.75} fill={stroke} />
    </svg>
  );
}
