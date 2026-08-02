// Planar geometry shared by the engine's crossing-aware placement and the proof suites.
//
// One authority on purpose: the engine avoids crossings using the exact predicate the property
// gate measures with, so "placement said clean" and "the suite said clean" can never disagree —
// and the point-equality test is the reconciler's own `samePosition`, so "did it move" means the
// same thing to the kernel's suites and to the live merge.
import { samePosition, type ChainPosition } from '../chain/intents';

/**
 * The unit vector of one compass heading in canvas coordinates: headings run clockwise from
 * north, and north is −y. The single owner of that convention — the engine's ring placement and
 * the overflow parking both scale this vector.
 */
export function headingVector(heading: number): ChainPosition {
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

/** Twice the signed area of triangle `o`–`p`–`q`; sign gives `q`'s side of ray `o`→`p`. */
function orientation(o: ChainPosition, p: ChainPosition, q: ChainPosition): number {
  return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
}

/** True when `q` lies within the axis-aligned bounding box of `p`–`r`. */
function withinSpan(p: ChainPosition, q: ChainPosition, r: ChainPosition): boolean {
  return (
    Math.min(p.x, r.x) <= q.x &&
    q.x <= Math.max(p.x, r.x) &&
    Math.min(p.y, r.y) <= q.y &&
    q.y <= Math.max(p.y, r.y)
  );
}

function strictlyOpposite(d1: number, d2: number): boolean {
  return (d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0);
}

/**
 * True when segments a1–a2 and b1–b2 properly intersect — crossing at an interior point of both.
 * Segments that merely share an endpoint (tree edges meeting at their common node) do not count;
 * collinear overlap does, because two overlapping edges are visually a crossing.
 */
export function segmentsIntersect(
  a1: ChainPosition,
  a2: ChainPosition,
  b1: ChainPosition,
  b2: ChainPosition,
): boolean {
  if (
    samePosition(a1, b1) ||
    samePosition(a1, b2) ||
    samePosition(a2, b1) ||
    samePosition(a2, b2)
  ) {
    return false;
  }
  const d1 = orientation(b1, b2, a1);
  const d2 = orientation(b1, b2, a2);
  const d3 = orientation(a1, a2, b1);
  const d4 = orientation(a1, a2, b2);
  if (strictlyOpposite(d1, d2) && strictlyOpposite(d3, d4)) return true;
  if (d1 === 0 && withinSpan(b1, a1, b2)) return true;
  if (d2 === 0 && withinSpan(b1, a2, b2)) return true;
  if (d3 === 0 && withinSpan(a1, b1, a2)) return true;
  return d4 === 0 && withinSpan(a1, b2, a2);
}
