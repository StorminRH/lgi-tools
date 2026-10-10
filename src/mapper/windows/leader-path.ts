import { roundTo } from '@/lib/math';

export interface LeaderPoint {
  readonly x: number;
  readonly y: number;
}

/** SVG coordinates to two decimals, which is finer than a device pixel. */
function coords(point: LeaderPoint): string {
  return `${roundTo(point.x, 2)} ${roundTo(point.y, 2)}`;
}

function distance(a: LeaderPoint, b: LeaderPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function toward(from: LeaderPoint, to: LeaderPoint, length: number): LeaderPoint {
  const span = distance(from, to);
  if (span === 0) return from;
  const t = length / span;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/**
 * SVG path through `points` with each interior corner rounded by up to
 * `radius`. The path runs from the first point to the last, so a dash
 * animation on it draws in that direction.
 */
export function roundedLeaderPath(
  points: readonly LeaderPoint[],
  radius: number,
): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  let d = `M ${coords(first)}`;
  let previous = first;
  rest.forEach((point, index) => {
    const next = rest[index + 1];
    if (next === undefined) {
      d += ` L ${coords(point)}`;
      return;
    }
    const r = Math.min(radius, distance(previous, point) / 2, distance(point, next) / 2);
    const entry = toward(point, previous, r);
    const exit = toward(point, next, r);
    d += ` L ${coords(entry)}`;
    d += ` Q ${coords(point)} ${coords(exit)}`;
    previous = point;
  });
  return d;
}
