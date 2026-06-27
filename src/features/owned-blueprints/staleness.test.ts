import { describe, expect, it } from 'vitest';
import { BLUEPRINTS_TTL_MS, isBlueprintsStale } from './staleness';

const NOW = new Date('2026-06-27T12:00:00Z');

describe('isBlueprintsStale', () => {
  it('treats a never-synced owner (null) as stale', () => {
    expect(isBlueprintsStale(null, NOW)).toBe(true);
  });

  it('is fresh within the TTL window', () => {
    const justInside = new Date(NOW.getTime() - BLUEPRINTS_TTL_MS + 1_000);
    expect(isBlueprintsStale(justInside, NOW)).toBe(false);
  });

  it('is stale past the TTL window', () => {
    const justOutside = new Date(NOW.getTime() - BLUEPRINTS_TTL_MS - 1_000);
    expect(isBlueprintsStale(justOutside, NOW)).toBe(true);
  });
});
