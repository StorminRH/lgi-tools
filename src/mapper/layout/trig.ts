import type { ChainPosition } from '../chain/intents';

const PI = 3.141592653589793;

const HALF_PI = 1.5707963267948966;

const QUARTER_PI = 0.7853981633974483;

const TWO_PI = 6.283185307179586;

const SIN_C1 = -1.66666666666666324348e-1;
const SIN_C2 = 8.33333333332248946124e-3;
const SIN_C3 = -1.98412698298579493134e-4;
const SIN_C4 = 2.75573137070700676789e-6;
const SIN_C5 = -2.50507602534068634195e-8;
const SIN_C6 = 1.58969099521155010221e-10;

const COS_C1 = 4.16666666666666019037e-2;
const COS_C2 = -1.38888888888741095749e-3;
const COS_C3 = 2.48015872894767294178e-5;
const COS_C4 = -2.75573143513906633035e-7;
const COS_C5 = 2.08757232129817489169e-9;
const COS_C6 = -1.13596475577881948265e-11;

function reduceToPi(radians: number): number {
  let x = radians % TWO_PI;
  if (x > PI) x -= TWO_PI;
  else if (x <= -PI) x += TWO_PI;
  return x;
}

function sinNearZero(x: number): number {
  const z = x * x;
  return (
    x +
    x * z * (SIN_C1 + z * (SIN_C2 + z * (SIN_C3 + z * (SIN_C4 + z * (SIN_C5 + z * SIN_C6)))))
  );
}

function cosNearZero(x: number): number {
  const z = x * x;
  return (
    1 -
    0.5 * z +
    z * z * (COS_C1 + z * (COS_C2 + z * (COS_C3 + z * (COS_C4 + z * (COS_C5 + z * COS_C6)))))
  );
}

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

export function detSin(radians: number): number {
  const reduced = reduceToPi(radians);
  if (reduced >= 0) return sinCosInPi(reduced).sin;
  return -sinCosInPi(-reduced).sin;
}

export function detCos(radians: number): number {
  const reduced = reduceToPi(radians);
  if (reduced >= 0) return sinCosInPi(reduced).cos;
  return sinCosInPi(-reduced).cos;
}

export function distance(a: ChainPosition, b: ChainPosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
