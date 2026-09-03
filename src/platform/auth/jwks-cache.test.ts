import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetJwksCacheForTests, getCachedJwks } from './jwks-cache';

afterEach(() => {
  __resetJwksCacheForTests();
});

describe('getCachedJwks', () => {
  it('caches a non-empty key set but retries after an empty first-boot read', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'k1' }]);
    const ctx = { context: { adapter: { findMany } } };

    await expect(getCachedJwks(ctx)).resolves.toEqual([]);
    await expect(getCachedJwks(ctx)).resolves.toEqual([{ id: 'k1' }]);
    await expect(getCachedJwks(ctx)).resolves.toEqual([{ id: 'k1' }]);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith({ model: 'jwks' });
  });
});
