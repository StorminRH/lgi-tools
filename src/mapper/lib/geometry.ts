/** A point in whatever coordinate space the caller works in. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned box by its edges. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * The point `length` along the ray from `from` toward `to`; null when the two
 * coincide. Render-side (Math.hypot); the layout kernel uses layout/trig.
 */
export function pointToward(from: Point, to: Point, length: number): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  if (span === 0) return null;
  const t = length / span;
  return { x: from.x + dx * t, y: from.y + dy * t };
}
