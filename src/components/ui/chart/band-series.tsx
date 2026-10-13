import { Area, LinePath } from '@visx/shape';

/** Plot margins shared by the two worth-chart modes, so switching modes keeps the plot in place. */
export const BAND_CHART_MARGIN = { top: 8, right: 10, bottom: 24, left: 52 } as const;

// A point with no neighbour on either side draws no line or area; it gets a dot instead.
function isolatedAt<P>(points: readonly P[], i: number, defined: (point: P) => boolean): boolean {
  const has = (j: number) => {
    const point = points[j];
    return point !== undefined && defined(point);
  };
  return has(i) && !has(i - 1) && !has(i + 1);
}

/**
 * One filled band between `y0` and `y1` with a line along `y1`, broken
 * wherever `defined` is false. A point with data but no neighbours on either
 * side is marked with a dot, so a series that has just begun still shows.
 */
export function BandSeries<P extends { x: number }>({
  points,
  x,
  y0,
  y1,
  defined,
  color,
  fillOpacity,
  strokeWidth = 1.5,
  strokeOpacity,
}: {
  points: P[];
  x: (point: P) => number;
  y0: (point: P) => number;
  y1: (point: P) => number;
  defined: (point: P) => boolean;
  color: string;
  fillOpacity: number;
  strokeWidth?: number;
  /** Left off the line when undefined. */
  strokeOpacity?: number;
}) {
  return (
    <>
      <Area<P> data={points} x={x} y0={y0} y1={y1} defined={defined} fill={color} fillOpacity={fillOpacity} />
      <LinePath<P>
        data={points}
        x={x}
        y={y1}
        defined={defined}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        fill="none"
      />
      {points.map((point, i) =>
        isolatedAt(points, i, defined) ? <circle key={point.x} cx={x(point)} cy={y1(point)} r={3} fill={color} /> : null,
      )}
    </>
  );
}
