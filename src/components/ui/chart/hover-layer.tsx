import type { MouseEvent } from 'react';

export type HoverCrosshairProps = {
  open: boolean;

  left: number | undefined;
  top: number | undefined;

  y1: number;
  y2: number;

  color: string;
};

export function HoverCrosshair({ open, left, top, y1, y2, color }: HoverCrosshairProps) {
  if (!open || left == null || top == null) return null;
  return (
    <g aria-hidden>
      <line
        x1={left}
        x2={left}
        y1={y1}
        y2={y2}
        className="stroke-[var(--color-muted)]"
        strokeWidth={1}
        strokeOpacity={0.3}
        strokeDasharray="2 2"
      />
      <circle cx={left} cy={top} r={3} fill={color} />
    </g>

  );
}

export type HoverCaptureRectProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  onMove: (event: MouseEvent<SVGRectElement>) => void;
  onLeave: () => void;
};

export function HoverCaptureRect({ x, y, width, height, onMove, onLeave }: HoverCaptureRectProps) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="transparent"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    />
  );
}
