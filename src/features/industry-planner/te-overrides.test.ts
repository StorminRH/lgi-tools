import { describe, expect, it } from 'vitest';
import { clampTe, effectiveTeOf, MAX_TE, nodeTeState } from './te-overrides';

describe('clampTe', () => {
  it('passes an in-range integer through', () => {
    expect(clampTe(0)).toBe(0);
    expect(clampTe(12)).toBe(12);
    expect(clampTe(MAX_TE)).toBe(20);
  });

  it('clamps above MAX_TE down and below 0 up', () => {
    expect(clampTe(21)).toBe(20);
    expect(clampTe(999)).toBe(20);
    expect(clampTe(-3)).toBe(0);
  });

  it('floors a fractional input', () => {
    expect(clampTe(3.7)).toBe(3);
    expect(clampTe(20.9)).toBe(20);
  });

  it('falls back on a non-finite input (empty / malformed field)', () => {
    expect(clampTe(Number.NaN)).toBe(0);
    expect(clampTe(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampTe(Number.NaN, 7)).toBe(7);
  });
});

// effectiveTeOf / nodeTeState are the level-agnostic ME helpers re-exported under TE
// names (their full behaviour is covered by me-overrides.test). These smoke tests
// just confirm the TE wiring resolves the right value/state.
describe('effectiveTeOf / nodeTeState (TE wiring)', () => {
  it('returns the owned TE when no override is set, override otherwise', () => {
    const owned = new Map([[10, 20]]);
    expect(effectiveTeOf(owned, new Map())(10)).toBe(20);
    expect(effectiveTeOf(owned, new Map([[10, 8]]))(10)).toBe(8);
    expect(effectiveTeOf(null, new Map())(10)).toBeUndefined();
  });

  it('reads owned/manual/unowned states', () => {
    expect(nodeTeState(20, undefined)).toBe('owned');
    expect(nodeTeState(20, 8)).toBe('manual');
    expect(nodeTeState(undefined, undefined)).toBe('unowned');
    expect(nodeTeState(0, undefined)).toBe('unowned');
  });
});
