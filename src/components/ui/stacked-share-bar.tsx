import { type Tone, toneHex } from './tones';

// A single 100%-width bar split into its parts, each segment carrying its own
// value + share label directly beneath it — no separate legend. For two-way
// shares (returning vs new, referred vs direct) that used to hide in a KPI sub.
// Geometry is SVG presentation attributes; the split math is the pure
// {@link stackedShareLayout}.

/**
 * Display-ready share segment consumed by the shared visualization layer; callers keep all numeric
 * values in one consistent unit.
 */
export interface ShareSegment {
  label: string;
  value: number;
  tone: Tone;
}

/**
 * Display-ready share layout part consumed by the shared visualization layer; callers keep all
 * numeric values in one consistent unit.
 */
export interface ShareLayoutPart extends ShareSegment {
  x: number;
  w: number;
  pct: number;
  /** Label anchor x and text-anchor, precomputed so the render stays trivial: the
   * first label hugs the left edge, the last the right edge, the rest centre. */
  labelX: number;
  labelAnchor: 'start' | 'middle' | 'end';
}

/**
 * Converts non-negative share values into contiguous pixel segments whose widths fill the supplied
 * bar width.
 */
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
 * Renders the domain-neutral stacked share bar from display-ready caller data; callers own units
 * and labels while this primitive owns geometry and interaction.
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
  ariaLabel?: string;
}) {
  const parts = stackedShareLayout(segments, width);
  if (parts.length === 0) return null;
  const barH = 20;
  const last = parts.length - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="block max-w-full"
    >
      {parts.map((part, i) => (
        <rect
          key={`bar-${part.label}`}
          x={part.x}
          y={0}
          // A 1.5px gap between segments (except the last) reads them as distinct.
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
          className="font-mono text-micro"
        >
          {part.label} {part.value.toLocaleString()} · {Math.round(part.pct)}%
        </text>
      ))}
    </svg>
  );
}
