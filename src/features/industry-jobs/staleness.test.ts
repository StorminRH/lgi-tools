import { describe, expect, it } from 'vitest';
import { isJobsStale, JOBS_TTL_MS } from './staleness';

const NOW = new Date('2026-06-28T12:00:00Z');

describe('isJobsStale', () => {
  it('treats a never-synced character (null) as stale', () => {
    expect(isJobsStale(null, NOW)).toBe(true);
  });

  it('is fresh just inside the TTL window', () => {
    const justInside = new Date(NOW.getTime() - JOBS_TTL_MS + 1_000);
    expect(isJobsStale(justInside, NOW)).toBe(false);
  });

  it('is stale just outside the TTL window', () => {
    const justOutside = new Date(NOW.getTime() - JOBS_TTL_MS - 1_000);
    expect(isJobsStale(justOutside, NOW)).toBe(true);
  });

  it('mirrors the verified 300s ESI cache', () => {
    expect(JOBS_TTL_MS).toBe(300_000);
  });
});
