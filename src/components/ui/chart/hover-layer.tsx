import type { MouseEvent } from 'react';

type HoverCrosshairProps = {
  open: boolean;
  /** Tooltip anchor in svg space (undefined until the first hover). */
  left: number | undefined;
  top: number | undefined;
  /** Vertical span of the crosshair line. */
  y1: number;
  y2: number;
  /** Dot fill (the series tone). */
  color: string;
};

/**
 * The hover crosshair for a continuous-x line chart: a dashed vertical rule and
 * a dot on the line at the hovered datum. Renders nothing until a datum is
 * hovered (matching the original `tooltipOpen && left != null && top != null`).
 */
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

type HoverCaptureRectProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  onMove: (event: MouseEvent<SVGRectElement>) => void;
  onLeave: () => void;
};

/** Transparent full-plot capture layer for pointer hover (presentation attrs only). */
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
