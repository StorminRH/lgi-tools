import type { AttrMap } from '@/data/eve-data/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getTypeAttributesBatch: vi.fn(),
  missileTypeIdFor: vi.fn(),
  composeCombatStats: vi.fn(),
}));

vi.mock('@/data/eve-data/queries', () => ({
  getTypeAttributesBatch: h.getTypeAttributesBatch,
}));

vi.mock('./math', () => ({
  missileTypeIdFor: h.missileTypeIdFor,
  composeCombatStats: h.composeCombatStats,
}));

import { getCombatStatsBatch } from './queries';

beforeEach(() => {
  h.getTypeAttributesBatch.mockReset();
  h.missileTypeIdFor.mockReset();
  h.composeCombatStats.mockReset();
});

describe('getCombatStatsBatch', () => {
  it('returns an empty map without reading attributes for empty input', async () => {
    await expect(getCombatStatsBatch([])).resolves.toEqual(new Map());
    expect(h.getTypeAttributesBatch).not.toHaveBeenCalled();
    expect(h.missileTypeIdFor).not.toHaveBeenCalled();
    expect(h.composeCombatStats).not.toHaveBeenCalled();
  });

  it('batches sleeper and deduplicated missile attributes before assembling keyed results', async () => {
    const typeIds = [101, 102, 103, 104, 105, 106];
    const sleeperA: AttrMap = { 1: 11, 5000: 9001 };
    const sleeperB: AttrMap = { 1: 12, 5000: 9001 };
    const emptySleeper: AttrMap = {};
    const noMissile: AttrMap = { 1: 15 };
    const unavailableMissile: AttrMap = { 1: 16, 5000: 9002 };
    const sharedMissile: AttrMap = { 2: 91 };
    const statsA = { fixture: 'A' };
    const statsB = { fixture: 'B' };
    const statsNoMissile = { fixture: 'no-missile' };
    const statsUnavailableMissile = { fixture: 'unavailable-missile' };

    h.getTypeAttributesBatch
      .mockResolvedValueOnce(new Map([
        [101, sleeperA],
        [102, sleeperB],
        [104, emptySleeper],
        [105, noMissile],
        [106, unavailableMissile],
      ]))
      .mockResolvedValueOnce(new Map([[9001, sharedMissile]]));
    h.missileTypeIdFor.mockImplementation(
      (attrs: AttrMap) => attrs[5000] ?? null,
    );
    h.composeCombatStats
      .mockReturnValueOnce(statsA)
      .mockReturnValueOnce(statsB)
      .mockReturnValueOnce(statsNoMissile)
      .mockReturnValueOnce(statsUnavailableMissile);

    const result = await getCombatStatsBatch(typeIds);

    expect(h.getTypeAttributesBatch.mock.calls).toEqual([
      [typeIds],
      [[9001, 9002]],
    ]);
    expect(h.composeCombatStats.mock.calls).toEqual([
      [sleeperA, sharedMissile],
      [sleeperB, sharedMissile],
      [noMissile, null],
      [unavailableMissile, null],
    ]);
    expect([...result.keys()]).toEqual([101, 102, 105, 106]);
    expect(result.get(101)).toBe(statsA);
    expect(result.get(102)).toBe(statsB);
    expect(result.get(105)).toBe(statsNoMissile);
    expect(result.get(106)).toBe(statsUnavailableMissile);
    expect(result.has(103)).toBe(false);
    expect(result.has(104)).toBe(false);
  });
});
