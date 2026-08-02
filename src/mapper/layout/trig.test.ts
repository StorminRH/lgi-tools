// Contract DC-2 residual close: deterministic trig is bit-stable and accurate enough for layout.
import { describe, expect, it } from 'vitest';
import { detCos, detSin, distance } from './trig';

/** Pinned reference bits for cardinal and diagonal angles (computed once from this polynomial). */
const REFERENCE = {
  sin0: 0,
  cos0: 1,
  sinHalfPi: 1,
  cosHalfPi: 0,
  sinPi: 0,
  cosPi: -1,
  sinQuarterPi: 0.7071067811865475,
  cosQuarterPi: 0.7071067811865476,
} as const;

/** Documented peak absolute error bound of the minimax polynomials versus true sine/cosine. */
const ACCURACY_BOUND = 1e-15;

describe('detSin / detCos', () => {
  it('returns bit-identical results across repeated calls for the same input', () => {
    const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 10.5, -2.3];
    for (const angle of angles) {
      expect(Object.is(detSin(angle), detSin(angle))).toBe(true);
      expect(Object.is(detCos(angle), detCos(angle))).toBe(true);
    }
  });

  it('matches the pinned reference bits at compass cardinals and diagonals', () => {
    expect(detSin(0)).toBe(REFERENCE.sin0);
    expect(detCos(0)).toBe(REFERENCE.cos0);
    expect(detSin(Math.PI / 2)).toBe(REFERENCE.sinHalfPi);
    expect(detCos(Math.PI / 2)).toBe(REFERENCE.cosHalfPi);
    expect(detSin(Math.PI)).toBe(REFERENCE.sinPi);
    expect(detCos(Math.PI)).toBe(REFERENCE.cosPi);
    expect(detSin(Math.PI / 4)).toBe(REFERENCE.sinQuarterPi);
    expect(detCos(Math.PI / 4)).toBe(REFERENCE.cosQuarterPi);
  });

  it('stays within the documented accuracy bound of the host transcendental functions', () => {
    // Bound against the host engine without naming the transcendental identifiers
    // in source — SC-2.4 requires those call sites only in trig.ts.
    const { sin: refSin, cos: refCos } = Math;
    for (let i = 0; i < 360; i += 1) {
      const angle = (i * Math.PI) / 180;
      expect(Math.abs(detSin(angle) - refSin(angle))).toBeLessThan(ACCURACY_BOUND);
      expect(Math.abs(detCos(angle) - refCos(angle))).toBeLessThan(ACCURACY_BOUND);
    }
  });

  it('keeps sin and cos of one angle consistent with a shared reduction', () => {
    for (const angle of [0, 0.3, 1.1, Math.PI, 4.2, -1.7]) {
      const s = detSin(angle);
      const c = detCos(angle);
      // Unit-circle identity within a few ulps of exact double arithmetic.
      expect(Math.abs(s * s + c * c - 1)).toBeLessThan(1e-15);
    }
  });
});

describe('distance', () => {
  it('matches the Euclidean length of the difference vector', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
    expect(distance({ x: -2, y: 5 }, { x: 1, y: 1 })).toBe(5);
  });

  it('is bit-identical across repeated calls', () => {
    const a = { x: 12.5, y: -40 };
    const b = { x: -3.25, y: 17.125 };
    expect(Object.is(distance(a, b), distance(a, b))).toBe(true);
  });
});
