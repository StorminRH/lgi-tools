import type { SparklineTone } from '../sparkline';
import { toneHex } from '../tones';
import { extent } from './chart-geometry';

export type StaticSparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  tone?: SparklineTone;
  ariaLabel?: string;
};

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
