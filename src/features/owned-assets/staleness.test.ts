import { describe, expect, it } from 'vitest';
import { ASSETS_TTL_MS, isAssetsStale } from './staleness';

const NOW = new Date('2026-06-28T12:00:00Z');

describe('isAssetsStale', () => {
  it('treats a never-synced owner (null) as stale', () => {
    expect(isAssetsStale(null, NOW)).toBe(true);
  });

  it('is fresh within the TTL window', () => {
    const justInside = new Date(NOW.getTime() - ASSETS_TTL_MS + 1_000);
    expect(isAssetsStale(justInside, NOW)).toBe(false);
  });

  it('is stale past the TTL window', () => {
    const justOutside = new Date(NOW.getTime() - ASSETS_TTL_MS - 1_000);
    expect(isAssetsStale(justOutside, NOW)).toBe(true);
  });

  it('mirrors ESI\'s 3600s asset cache window', () => {
    expect(ASSETS_TTL_MS).toBe(60 * 60 * 1000);
  });
});
