import { describe, expect, it } from 'vitest';
import { earliestExpiry, expiryFor, isExpired, untilExpires } from './expiry';
import type { StoredRow } from './types';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function row(expiresAt: number | null): StoredRow {
  return { expiresAt, etags: [], lastModified: null, checkedAt: NOW, body: null };
}

describe('expiryFor', () => {
  it("takes CCP's Expires when the answer carried one", () => {
    expect(expiryFor(NOW + 30_000, 300, NOW)).toBe(NOW + 30_000);
  });

  it("falls back to the route's published cache time counted from the check", () => {
    expect(expiryFor(null, 300, NOW)).toBe(NOW + 300_000);
  });

  it('is due at once when the spec declares no cache time either', () => {
    expect(expiryFor(null, null, NOW)).toBeNull();
  });
});

describe('isExpired', () => {
  it('treats a missing expiry, a past one and the exact moment as due', () => {
    expect(isExpired(null, NOW)).toBe(true);
    expect(isExpired(NOW - 1, NOW)).toBe(true);
    expect(isExpired(NOW, NOW)).toBe(true);
    expect(isExpired(NOW + 1, NOW)).toBe(false);
  });
});

describe('earliestExpiry', () => {
  it('returns the earliest expiry across rows', () => {
    expect(earliestExpiry([row(NOW + 5000), row(NOW + 1000), row(NOW + 9000)])).toBe(NOW + 1000);
  });

  it('is null when any row is missing or has no expiry, since that key is due', () => {
    expect(earliestExpiry([row(NOW + 5000), null])).toBeNull();
    expect(earliestExpiry([row(NOW + 5000), row(null)])).toBeNull();
    expect(earliestExpiry([])).toBeNull();
  });
});

describe('untilExpires', () => {
  it('revalidates and expires at the seconds left until Expires, rounded up', () => {
    expect(untilExpires(NOW + 29_500, NOW)).toEqual({ stale: 30, revalidate: 30, expire: 30 });
  });

  it('clamps to one second for a past, present or missing expiry, because cacheLife accepts negatives unchecked', () => {
    expect(untilExpires(NOW - 60_000, NOW)).toEqual({ stale: 1, revalidate: 1, expire: 1 });
    expect(untilExpires(NOW, NOW)).toEqual({ stale: 1, revalidate: 1, expire: 1 });
    expect(untilExpires(null, NOW)).toEqual({ stale: 1, revalidate: 1, expire: 1 });
  });
});
