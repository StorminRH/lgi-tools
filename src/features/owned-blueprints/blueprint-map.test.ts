import { describe, expect, it } from 'vitest';
import { type BlueprintMapInput, toOwnedBlueprintMap } from './blueprint-map';

const row = (typeId: number, me: number, te: number, runs: number): BlueprintMapInput => ({
  typeId,
  materialEfficiency: me,
  timeEfficiency: te,
  runs,
});

describe('toOwnedBlueprintMap', () => {
  it('keeps the best (highest-ME) copy per type and counts how many are owned', () => {
    const map = toOwnedBlueprintMap([row(34, 5, 10, -1), row(34, 10, 20, 30), row(99, 0, 0, -1)]);
    expect(map.get(34)).toEqual({ me: 10, te: 20, runs: 30, owned: 2 });
    expect(map.get(99)).toEqual({ me: 0, te: 0, runs: -1, owned: 1 });
  });

  it('breaks an ME tie by TE, then by runs', () => {
    const map = toOwnedBlueprintMap([row(1, 10, 5, 1), row(1, 10, 8, 1), row(1, 10, 8, 5)]);
    expect(map.get(1)).toEqual({ me: 10, te: 8, runs: 5, owned: 3 });
  });

  it('is empty for no rows', () => {
    expect(toOwnedBlueprintMap([]).size).toBe(0);
  });
});
