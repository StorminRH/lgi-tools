import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetJwksCacheForTests, getCachedJwks } from './jwks-cache';

afterEach(() => {
  __resetJwksCacheForTests();
});

describe('getCachedJwks', () => {
  it('caches a non-empty key set after the first adapter read', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'k1' }]);
    const ctx = { context: { adapter: { findMany } } };

    await expect(getCachedJwks(ctx)).resolves.toEqual([{ id: 'k1' }]);
    await expect(getCachedJwks(ctx)).resolves.toEqual([{ id: 'k1' }]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ model: 'jwks' });
  });

  it('does not cache an empty first-boot result so key create can retry', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'k1' }]);
    const ctx = { context: { adapter: { findMany } } };

    await expect(getCachedJwks(ctx)).resolves.toEqual([]);
    await expect(getCachedJwks(ctx)).resolves.toEqual([{ id: 'k1' }]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
