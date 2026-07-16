import { describe, expect, it, vi } from 'vitest';
import { resetOverride, setOverride } from './override-map';

describe('setOverride', () => {
  it('clamps the value and returns a fresh map identity', () => {
    const current = new Map([[100, 4]]);
    const clamp = vi.fn(() => 10);

    const next = setOverride(current, 200, 99, clamp);

    expect(clamp).toHaveBeenCalledWith(99);
    expect(next).not.toBe(current);
    expect(next).toEqual(
      new Map([
        [100, 4],
        [200, 10],
      ]),
    );
    expect(current).toEqual(new Map([[100, 4]]));
  });
});

describe('resetOverride', () => {
  it('drops an existing entry through a fresh map identity', () => {
    const current = new Map([
      [100, 4],
      [200, 8],
    ]);

    const next = resetOverride(current, 100);

    expect(next).not.toBe(current);
    expect(next).toEqual(new Map([[200, 8]]));
    expect(current).toHaveLength(2);
  });

  it('returns the existing identity when the entry is already absent', () => {
    const current = new Map([[100, 4]]);

    expect(resetOverride(current, 200)).toBe(current);
  });
});
