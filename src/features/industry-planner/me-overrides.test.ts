import { describe, expect, it } from 'vitest';
import { clampMe, effectiveMeOf, MAX_ME, nodeMeState } from './me-overrides';

describe('clampMe', () => {
  it('passes an in-range integer through', () => {
    expect(clampMe(0)).toBe(0);
    expect(clampMe(5)).toBe(5);
    expect(clampMe(MAX_ME)).toBe(10);
  });

  it('clamps above MAX_ME down and below 0 up', () => {
    expect(clampMe(11)).toBe(10);
    expect(clampMe(999)).toBe(10);
    expect(clampMe(-3)).toBe(0);
  });

  it('floors a fractional input', () => {
    expect(clampMe(3.7)).toBe(3);
    expect(clampMe(10.9)).toBe(10);
  });

  it('falls back on a non-finite input (empty / malformed field)', () => {
    expect(clampMe(Number.NaN)).toBe(0);
    expect(clampMe(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampMe(Number.NaN, 7)).toBe(7);
  });
});

describe('effectiveMeOf', () => {
  it('is byte-identical to the owned map when no override is set', () => {
    // THE anchor for the planner wiring: empty overrides ⇒ the effective lookup
    // equals owned.get for EVERY blueprint (present or absent), so the ledger is
    // unchanged from the owned-only path.
    const owned = new Map([
      [10, 5],
      [20, 10],
      [30, 0],
    ]);
    const meOf = effectiveMeOf(owned, new Map());
    for (const bp of [10, 20, 30, 40]) {
      expect(meOf(bp)).toBe(owned.get(bp));
    }
  });

  it('lets a manual override win over the owned ME', () => {
    const owned = new Map([[10, 5]]);
    const meOf = effectiveMeOf(owned, new Map([[10, 9]]));
    expect(meOf(10)).toBe(9);
  });

  it('applies an override on a node the player does not own', () => {
    const meOf = effectiveMeOf(new Map(), new Map([[10, 8]]));
    expect(meOf(10)).toBe(8);
  });

  it('honours an explicit override of 0 (a deliberate ME0 what-if)', () => {
    const owned = new Map([[10, 10]]);
    const meOf = effectiveMeOf(owned, new Map([[10, 0]]));
    expect(meOf(10)).toBe(0);
  });

  it('falls back to undefined for an unowned, un-overridden blueprint', () => {
    const meOf = effectiveMeOf(new Map([[10, 5]]), new Map());
    expect(meOf(99)).toBeUndefined();
  });

  it('tolerates a null owned map (read not yet settled)', () => {
    expect(effectiveMeOf(null, new Map())(10)).toBeUndefined();
    expect(effectiveMeOf(null, new Map([[10, 7]]))(10)).toBe(7);
  });
});

describe('nodeMeState', () => {
  it('reads as manual whenever an override is set — even at 0', () => {
    expect(nodeMeState(5, 9)).toBe('manual');
    expect(nodeMeState(undefined, 8)).toBe('manual');
    expect(nodeMeState(10, 0)).toBe('manual');
  });

  it('reads as owned when a researched copy is owned and not overridden', () => {
    expect(nodeMeState(5, undefined)).toBe('owned');
    expect(nodeMeState(10, undefined)).toBe('owned');
  });

  it('reads as unowned with no override and no researched copy', () => {
    expect(nodeMeState(undefined, undefined)).toBe('unowned');
    expect(nodeMeState(0, undefined)).toBe('unowned');
  });
});
