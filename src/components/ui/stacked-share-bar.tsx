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
