import { describe, expect, it } from 'vitest';
import { ringDash } from './qty-ring';

describe('ringDash', () => {
  const C = 2 * Math.PI * 10;

  it('fills nothing at 0 and the whole circle at 1', () => {
    expect(ringDash(0, 10).dash).toBe(`0 ${C}`);
    expect(ringDash(1, 10).dash).toBe(`${C} ${C}`);
  });

  it('fills half the circle at 0.5', () => {
    expect(ringDash(0.5, 10).dash).toBe(`${0.5 * C} ${C}`);
  });

  it('clamps out-of-range and non-finite progress', () => {
    expect(ringDash(2, 10).dash).toBe(`${C} ${C}`);
    expect(ringDash(-1, 10).dash).toBe(`0 ${C}`);
    expect(ringDash(Number.NaN, 10).dash).toBe(`0 ${C}`);
  });

  it('reports the circumference for the given radius', () => {
    expect(ringDash(0, 10).circumference).toBeCloseTo(C);
    expect(ringDash(0, 17).circumference).toBeCloseTo(2 * Math.PI * 17);
  });
});
