// Deterministic transcendental math for the layout zone.
//
// ECMA-262 lets engines approximate Math.sin / Math.cos / Math.hypot, and the
// compass engine branches on exact orientation zeros — so a cross-engine float
// drift can flip a discrete placement choice. This module owns the only
// transcendental ops the layout zone may call: sin/cos via argument reduction
// plus fixed minimax polynomials (IEEE-754-exact + - * / only), and distance
// via Math.sqrt (correctly rounded per IEEE-754, hence deterministic).
import type { ChainPosition } from '../chain/intents';

/** π as the shared IEEE double every JS engine ships for Math.PI. */
const PI = 3.141592653589793;
/** π/2. */
const HALF_PI = 1.5707963267948966;
/** π/4. */
const QUARTER_PI = 0.7853981633974483;
/** 2π. */
const TWO_PI = 6.283185307179586;

/**
 * Remez minimax coefficients for sin(x) on [0, π/4] as an odd polynomial in x
 * (even powers of z = x²). Peak absolute error versus true sine stays below
 * 1e-16 on the interval — tighter than a double can represent for layout
 * purposes.
 */
const SIN_C1 = -1.66666666666666324348e-1;
const SIN_C2 = 8.33333333332248946124e-3;
const SIN_C3 = -1.98412698298579493134e-4;
const SIN_C4 = 2.75573137070700676789e-6;
const SIN_C5 = -2.50507602534068634195e-8;
const SIN_C6 = 1.58969099521155010221e-10;

/**
 * Remez minimax coefficients for cos(x) on [0, π/4] as an even polynomial in
 * z = x². Same accuracy class as the sine polynomial.
 */
const COS_C1 = 4.16666666666666019037e-2;
const COS_C2 = -1.38888888888741095749e-3;
const COS_C3 = 2.48015872894767294178e-5;
const COS_C4 = -2.75573143513906633035e-7;
const COS_C5 = 2.08757232129817489169e-9;
const COS_C6 = -1.13596475577881948265e-11;

/** Folds any finite angle into (−π, π]. */
function reduceToPi(radians: number): number {
  let x = radians % TWO_PI;
  if (x > PI) x -= TWO_PI;
  else if (x <= -PI) x += TWO_PI;
  return x;
}

/** Sine on [0, π/4] via the fixed minimax polynomial. */
function sinNearZero(x: number): number {
  const z = x * x;
  return (
    x +
    x * z * (SIN_C1 + z * (SIN_C2 + z * (SIN_C3 + z * (SIN_C4 + z * (SIN_C5 + z * SIN_C6)))))
  );
}

/** Cosine on [0, π/4] via the fixed minimax polynomial. */
function cosNearZero(x: number): number {
  const z = x * x;
  return (
    1 -
    0.5 * z +
    z * z * (COS_C1 + z * (COS_C2 + z * (COS_C3 + z * (COS_C4 + z * (COS_C5 + z * COS_C6)))))
  );
}

/**
 * Sine and cosine of a non-negative angle in [0, π], via quadrant folding into
 * [0, π/4] so each polynomial only evaluates where it is accurate.
 */
function sinCosInPi(x: number): { sin: number; cos: number } {
  if (x <= QUARTER_PI) {
    return { sin: sinNearZero(x), cos: cosNearZero(x) };
  }
  if (x <= HALF_PI) {
    const y = HALF_PI - x;
    return { sin: cosNearZero(y), cos: sinNearZero(y) };
  }
  if (x <= HALF_PI + QUARTER_PI) {
    const y = x - HALF_PI;
    return { sin: cosNearZero(y), cos: -sinNearZero(y) };
  }
  const y = PI - x;
  return { sin: sinNearZero(y), cos: -cosNearZero(y) };
}

/**
 * Deterministic sine: identical bits on every JS engine; only IEEE-exact ops.
 *
 * Precondition: `radians` is finite. Absolute error versus true sine stays
 * below 1e-15 on the real line (after exact quadrant reduction).
 */
export function detSin(radians: number): number {
  const reduced = reduceToPi(radians);
  if (reduced >= 0) return sinCosInPi(reduced).sin;
  return -sinCosInPi(-reduced).sin;
}

/**
 * Deterministic cosine: identical bits on every JS engine; only IEEE-exact ops.
 *
 * Shares the same reduction and polynomials as `detSin`, so sin/cos of one
 * angle cannot disagree about that angle.
 */
export function detCos(radians: number): number {
  const reduced = reduceToPi(radians);
  if (reduced >= 0) return sinCosInPi(reduced).cos;
  return sinCosInPi(-reduced).cos;
}

/**
 * Euclidean distance via exactly-rounded sqrt; the layout zone's only length op.
 *
 * Precondition: both positions have finite coordinates.
 */
export function distance(a: ChainPosition, b: ChainPosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
