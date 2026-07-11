import { describe, expect, it } from 'vitest';
import { mapByIdDroppingNulls } from './fan-out';

describe('mapByIdDroppingNulls', () => {
  it('keeps only the ids whose getter returns non-null, keyed by id', async () => {
    const map = await mapByIdDroppingNulls([1, 2, 3], async (id) =>
      id === 2 ? null : { value: id * 10 },
    );

    expect([...map.entries()]).toEqual([
      [1, { value: 10 }],
      [3, { value: 30 }],
    ]);
    expect(map.has(2)).toBe(false);
  });

  it('returns an empty map for no ids', async () => {
    const map = await mapByIdDroppingNulls([], async () => ({ value: 1 }));
    expect(map.size).toBe(0);
  });

  it('returns an empty map when every owner is unsynced (all null)', async () => {
    const map = await mapByIdDroppingNulls([1, 2], async () => null);
    expect(map.size).toBe(0);
  });

  it('keeps a falsy-but-non-null value (0, empty string) — only null is dropped', async () => {
    const map = await mapByIdDroppingNulls<number>([1, 2], async (id) => (id === 1 ? 0 : 5));
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(5);
  });

  it('runs the getters concurrently (Promise.all), not sequentially', async () => {
    let active = 0;
    let maxActive = 0;
    await mapByIdDroppingNulls([1, 2, 3], async (id) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { value: id };
    });
    expect(maxActive).toBeGreaterThan(1);
  });
});
