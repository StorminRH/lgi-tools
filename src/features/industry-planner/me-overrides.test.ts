import { describe, expect, it, vi } from 'vitest';
import { clampMe, effectiveMeOf, MAX_ME, nodeMeState } from './me-overrides';
import { mapOwnedBlueprints } from './owned-blueprint-maps';
import { resetOverride, setOverride } from './override-map';
import { nodeFrameState } from './node-frame-state';
import { clampTe, MAX_TE } from './te-overrides';
import type { OwnedBlueprintMeEntry } from './types';

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

describe('clampTe', () => {
  it('clamps to [0, MAX_TE], floors fractions, and falls back on non-finite input', () => {
    expect(clampTe(0)).toBe(0);
    expect(clampTe(12)).toBe(12);
    expect(clampTe(MAX_TE)).toBe(20);
    expect(clampTe(21)).toBe(20);
    expect(clampTe(-3)).toBe(0);
    expect(clampTe(3.7)).toBe(3);
    expect(clampTe(Number.NaN)).toBe(0);
    expect(clampTe(Number.NaN, 7)).toBe(7);
  });
});

describe('setOverride / resetOverride', () => {
  it('clamps into a fresh map and drops or no-ops a reset', () => {
    const current = new Map([
      [100, 4],
      [200, 8],
    ]);
    const clamp = vi.fn(() => 10);

    const next = setOverride(current, 300, 99, clamp);
    expect(clamp).toHaveBeenCalledWith(99);
    expect(next).not.toBe(current);
    expect(next).toEqual(
      new Map([
        [100, 4],
        [200, 8],
        [300, 10],
      ]),
    );
    expect(current).toEqual(
      new Map([
        [100, 4],
        [200, 8],
      ]),
    );

    const dropped = resetOverride(current, 100);
    expect(dropped).not.toBe(current);
    expect(dropped).toEqual(new Map([[200, 8]]));
    expect(resetOverride(current, 999)).toBe(current);
  });
});

describe('nodeFrameState', () => {
  const empty = new Map<number, number>();

  it('prefers a manual ME or TE override, then owned, then unowned (incl. a null owned map)', () => {
    expect(nodeFrameState(1, empty, empty, new Map([[1, 5]]), empty)).toBe('manual');
    expect(nodeFrameState(1, empty, empty, empty, new Map([[1, 12]]))).toBe('manual');
    expect(nodeFrameState(1, new Map([[1, 8]]), new Map([[1, 16]]), new Map([[1, 0]]), empty)).toBe(
      'manual',
    );
    expect(nodeFrameState(1, new Map([[1, 0]]), new Map([[1, 0]]), empty, empty)).toBe('owned');
    expect(nodeFrameState(1, new Map([[1, 10]]), empty, empty, empty)).toBe('owned');
    expect(nodeFrameState(1, empty, new Map([[1, 20]]), empty, empty)).toBe('owned');
    expect(nodeFrameState(1, empty, empty, empty, empty)).toBe('unowned');
    expect(nodeFrameState(1, new Map([[2, 5]]), new Map([[2, 10]]), empty, empty)).toBe('unowned');
    expect(nodeFrameState(1, null, null, empty, empty)).toBe('unowned');
  });
});

describe('mapOwnedBlueprints', () => {
  const BLUEPRINT: OwnedBlueprintMeEntry = {
    blueprintTypeId: 681,
    me: 10,
    te: 20,
    ownerType: 'corporation',
    ownerName: 'Lo-Gang Industries',
    locationName: 'Assembly Array',
    locationFlag: 'CorpSAG1',
  };

  it('splits a response row into the compute ME map and the readout detail map', () => {
    expect(mapOwnedBlueprints([])).toEqual({ ownedMe: new Map(), ownedDetail: new Map() });
    expect(mapOwnedBlueprints([BLUEPRINT])).toEqual({
      ownedMe: new Map([[681, 10]]),
      ownedDetail: new Map([
        [
          681,
          {
            te: 20,
            ownerType: 'corporation',
            ownerName: 'Lo-Gang Industries',
            locationName: 'Assembly Array',
            locationFlag: 'CorpSAG1',
          },
        ],
      ]),
    });
  });
});
