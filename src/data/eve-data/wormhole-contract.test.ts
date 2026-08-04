import { describe, expect, it } from 'vitest';
import {
  CONNECTION_MASS_STATES,
  isKnownSpaceSystemId,
  remainingMassBounds,
  WORMHOLE_LIFE_STAGES,
  WORMHOLE_MASS_STATE_THRESHOLDS,
  WORMHOLE_MASS_VARIANCE,
  WORMHOLE_SIZE_CLASSES,
} from './wormhole-contract';

describe('wormhole-contract vocabularies', () => {
  it('owns the observed mass and Reliable Lifetime buckets', () => {
    expect(CONNECTION_MASS_STATES).toEqual(['stable', 'reduced', 'critical']);
    expect(WORMHOLE_LIFE_STAGES).toEqual([
      'under_1_day',
      'under_4_hours',
      'under_1_hour',
      'expired',
    ]);
    expect(WORMHOLE_SIZE_CLASSES).toEqual(['S', 'M', 'L', 'XL']);
  });

  it('owns the mass thresholds and spawn variance', () => {
    expect(WORMHOLE_MASS_VARIANCE).toBe(0.1);
    expect(WORMHOLE_MASS_STATE_THRESHOLDS).toEqual({
      stable: { minFraction: 0.5, maxFraction: 1 },
      reduced: { minFraction: 0.1, maxFraction: 0.5 },
      critical: { minFraction: 0, maxFraction: 0.1 },
      unset: { minFraction: 0, maxFraction: 1 },
    });
  });

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
  });

  it('owns the stable known-space ID boundary', () => {
    expect(isKnownSpaceSystemId(30_999_999)).toBe(true);
    expect(isKnownSpaceSystemId(31_000_000)).toBe(false);
  });
});
