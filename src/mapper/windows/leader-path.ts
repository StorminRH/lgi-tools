import { roundTo } from '@/lib/math';
import { pointToward, type Point } from '../lib/geometry';

/** SVG coordinates to two decimals, which is finer than a device pixel. */
function coords(point: Point): string {
  return `${roundTo(point.x, 2)} ${roundTo(point.y, 2)}`;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * SVG path through `points` with each interior corner rounded by up to
 * `radius`. The path runs from the first point to the last, so a dash
 * animation on it draws in that direction.
 */
export function roundedLeaderPath(
  points: readonly Point[],
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
    const entry = pointToward(point, previous, r) ?? point;
    const exit = pointToward(point, next, r) ?? point;
    d += ` L ${coords(entry)}`;
    d += ` Q ${coords(point)} ${coords(exit)}`;
    previous = point;
  });
  return d;
}
