import { describe, expect, it } from 'vitest';
import { resolveExpiresAt } from './characterSync';

const NOW = 1_700_000_000_000;
const FALLBACK = 60_000;

describe('resolveExpiresAt', () => {
  it('returns the earliest present window', () => {
    expect(resolveExpiresAt([NOW + 5000, NOW + 1000], FALLBACK, NOW)).toBe(NOW + 1000);
  });

  it('ignores null windows when at least one is present', () => {
    expect(resolveExpiresAt([null, NOW + 2000], FALLBACK, NOW)).toBe(NOW + 2000);
  });

  it('falls back to now + ttl when every window is null', () => {
    expect(resolveExpiresAt([null, null], FALLBACK, NOW)).toBe(NOW + FALLBACK);
  });

  it('falls back to now + ttl when there are no windows', () => {
    expect(resolveExpiresAt([], FALLBACK, NOW)).toBe(NOW + FALLBACK);
  });

  it('passes a single present window through', () => {
    expect(resolveExpiresAt([NOW + 300_000], FALLBACK, NOW)).toBe(NOW + 300_000);
  });
});
