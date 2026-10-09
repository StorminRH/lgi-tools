import { cn } from './cn';
import { type Tone, toneHex } from './tones';

export interface ShareSegment {
  label: string;
  value: number;
  tone: Tone;
}

export interface ShareLayoutPart extends ShareSegment {
  x: number;
  w: number;
  pct: number;
  labelX: number;
  labelAnchor: 'start' | 'middle' | 'end';
}

export function stackedShareLayout(segments: ShareSegment[], width: number): ShareLayoutPart[] {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  if (total === 0) return [];
  const last = segments.length - 1;
  let x = 0;
  return segments.map((seg, i) => {
    const w = (seg.value / total) * width;
    const part: ShareLayoutPart = {
      ...seg,
      x,
      w,
      pct: (seg.value / total) * 100,
      labelX: i === 0 ? 0 : i === last ? width : x + w / 2,
      labelAnchor: i === 0 ? 'start' : i === last ? 'end' : 'middle',
    };
    x += w;
    return part;
  });
}

/**
 * One bar split into labelled shares. The accessible name is `ariaLabel`
 * followed by each segment's value, since the visible labels are SVG text
 * inside a role="img" that screen readers do not read.
 */
export function StackedShareBar({
  segments,
  width = 360,
  height = 44,
  ariaLabel,
}: {
  segments: ShareSegment[];
  width?: number;
  height?: number;
  /** What the bar splits, such as "Referred versus unattributed page views". */
  ariaLabel: string;
}) {
  const parts = stackedShareLayout(segments, width);
  if (parts.length === 0) return null;
  const barH = 20;
  const last = parts.length - 1;
  const values = parts.map((part) => `${part.label} ${part.value.toLocaleString()}`).join(', ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${ariaLabel}: ${values}`}
      className="block max-w-full"
    >
      {parts.map((part, i) => (
        <rect
          key={`bar-${part.label}`}
          x={part.x}
          y={0}
          width={Math.max(0, part.w - (i < last ? 1.5 : 0))}
          height={barH}
          fill={toneHex[part.tone]}
          fillOpacity={0.82}
        />
      ))}
      {parts.map((part) => (
        <text
          key={`label-${part.label}`}
          x={part.labelX}
          y={barH + 15}
          textAnchor={part.labelAnchor}
          fill={toneHex[part.tone]}
          className="font-data text-micro"
        >
          {part.label} {part.value.toLocaleString()} · {Math.round(part.pct)}%
        </text>
      ))}
    </svg>
  );
}

/**
 * A label-free share bar on the same thin rounded track as ProgressBar, for
 * places with room for a glance but not a legend. It stretches to its container.
 */
export function SlimShareBar({
  segments,
  ariaLabel,
  className,
}: {
  segments: ShareSegment[];
  ariaLabel: string;
  className?: string;
}) {
  const parts = stackedShareLayout(segments, 100);
  if (parts.length === 0) return null;
  return (
    <span className={cn('progress-soft block', className)}>
      <svg
        viewBox="0 0 100 1"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="block h-full w-full"
      >
        {parts.map((part) => (
          <rect
            key={part.label}
            x={part.x}
            y={0}
            width={part.w}
            height={1}
            fill={toneHex[part.tone]}
            fillOpacity={0.75}
          />
        ))}
        {parts.slice(1).map((part) => (
          <line
            key={`gap-${part.label}`}
            x1={part.x}
            x2={part.x}
            y1={0}
            y2={1}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="stroke-bg"
          />
        ))}
      </svg>
    </span>
  );
}
