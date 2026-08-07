import { describe, expect, it } from 'vitest';
import {
  hintAdmitsClass,
  isKnownSpaceSystemId,
  remainingMassAfterTravel,
  remainingMassBounds,
} from './wormhole-contract';

describe('wormhole-contract mass and destination math', () => {
  it.each([
    [null, { minKg: 0, maxKg: 2_200_000_000 }],
    ['stable', { minKg: 900_000_000, maxKg: 2_200_000_000 }],
    ['reduced', { minKg: 180_000_000, maxKg: 1_100_000_000 }],
    ['critical', { minKg: 0, maxKg: 220_000_000 }],
  ] as const)('derives honest %s mass bounds', (massState, expected) => {
    expect(
      remainingMassBounds({ totalMass: 2_000_000_000, massRegen: 0 }, massState),
    ).toEqual(expected);
  });

  it('suppresses estimates for missing, malformed, and regenerating facts', () => {
    expect(remainingMassBounds(null, 'stable')).toBeNull();
    expect(remainingMassBounds({ totalMass: 0, massRegen: 0 }, 'stable')).toBeNull();
    expect(
      remainingMassBounds({ totalMass: 2_000_000_000, massRegen: 1 }, 'stable'),
    ).toBeNull();
    expect(
      remainingMassBounds({ totalMass: 2_000_000_000, massRegen: -1 }, 'stable'),
    ).toBeNull();
  });

  it('subtracts only travel since the latest mass-state anchor and fails closed on bad counters', () => {
    const entry = { totalMass: 2_000_000_000, massRegen: 0 };
    expect(remainingMassAfterTravel(entry, 'stable', 300_000_000, 100_000_000)).toEqual({
      minKg: 700_000_000,
      maxKg: 2_000_000_000,
    });
    expect(remainingMassAfterTravel(entry, 'critical', 300_000_000, 0)).toEqual({
      minKg: 0,
      maxKg: 0,
    });

    // A same-value re-shake re-stamps the anchor at the current odometer.
    expect(remainingMassAfterTravel(entry, 'stable', 300_000_000, 300_000_000)).toEqual({
      minKg: 900_000_000,
      maxKg: 2_200_000_000,
    });
    expect(remainingMassAfterTravel(entry, 'stable', 350_000_000, 300_000_000)).toEqual({
      minKg: 850_000_000,
      maxKg: 2_150_000_000,
    });

    expect(remainingMassAfterTravel(entry, null, undefined, undefined)).toEqual({
      minKg: 0,
      maxKg: 2_200_000_000,
    });
    expect(remainingMassAfterTravel(entry, 'stable', Number.NaN, 0)).toBeNull();
    expect(remainingMassAfterTravel(entry, 'stable', 1, -1)).toBeNull();
    expect(remainingMassAfterTravel(entry, 'stable', 1, 2)).toBeNull();
    expect(
      remainingMassAfterTravel({ totalMass: 2_000_000_000, massRegen: 1 }, 'stable', 1, 0),
    ).toBeNull();
  });

  it.each([
    ['unknown admits C1', 'unknown', { wormholeClassId: 1, securityStatus: -1 }, true],
    ['unknown admits C13', 'unknown', { wormholeClassId: 13, securityStatus: -1 }, true],
    ['unknown rejects C4', 'unknown', { wormholeClassId: 4, securityStatus: -1 }, false],
    ['dangerous admits C4', 'dangerous', { wormholeClassId: 4, securityStatus: -1 }, true],
    ['deadly admits C6', 'deadly', { wormholeClassId: 6, securityStatus: -1 }, true],
    ['thera admits class 12', 'thera', { wormholeClassId: 12, securityStatus: -1 }, true],
    ['pochven admits class 25', 'pochven', { wormholeClassId: 25, securityStatus: -1 }, true],
    ['null-class highsec uses security band', 'hisec', { wormholeClassId: null, securityStatus: 0.8 }, true],
    ['null-class highsec rejects lowsec', 'lowsec', { wormholeClassId: null, securityStatus: 0.8 }, false],
    ['drifter class fails open', 'hisec', { wormholeClassId: 14, securityStatus: -1 }, true],
    ['future class fails open', 'deadly', { wormholeClassId: 99, securityStatus: -1 }, true],
    ['unresolved class fails open', 'nullsec', { wormholeClassId: null, securityStatus: null }, true],
  ] as const)('%s', (_name, hint, destination, expected) => {
    expect(hintAdmitsClass(hint, destination)).toBe(expected);
  });

  it('owns the stable known-space ID boundary', () => {
    expect(isKnownSpaceSystemId(30_999_999)).toBe(true);
    expect(isKnownSpaceSystemId(31_000_000)).toBe(false);
  });
});
