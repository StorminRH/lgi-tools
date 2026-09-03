import { samePosition, type ChainPosition } from '../chain/intents';
import { detCos, detSin } from './trig';

export function headingVector(heading: number): ChainPosition {
  return { x: detSin(heading), y: -detCos(heading) };
}

function orientation(o: ChainPosition, p: ChainPosition, q: ChainPosition): number {
  return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
}

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
