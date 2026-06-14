import { describe, expect, it } from 'vitest';
import {
  COLD_AFTER_MS,
  computeNextDueAt,
  deriveConvexSiteUrl,
  hasSyncTarget,
  isCold,
  isColdFromPresence,
  isRunningFresh,
  isStaleForImmediate,
  minCacheWindow,
  STALE_RUNNING_MS,
  SYNC_DATASET_CONFIG,
  SYNC_JITTER_MS,
} from './sync-engine';

const NOW = 1_750_000_000_000;

describe('dataset registration data', () => {
  // The floors are the live-read ESI cache windows (SCRATCHPAD 3.4.7/3.4.8)
  // and the groups are the live-observed token buckets — pinned so a future
  // edit can't silently poll faster than a dataset's cache or bill the
  // wrong bucket.
  it('pins the live-read cadence floors and token groups', () => {
    expect(SYNC_DATASET_CONFIG.skills).toEqual({
      cadenceFloorMs: 60_000,
      tokenGroup: 'char-detail',
    });
    expect(SYNC_DATASET_CONFIG.industryJobs).toEqual({
      cadenceFloorMs: 300_000,
      tokenGroup: 'char-industry',
    });
  });
});

describe('isCold', () => {
  it('is warm exactly at the window edge and cold past it', () => {
    expect(isCold(NOW - COLD_AFTER_MS, NOW)).toBe(false);
    expect(isCold(NOW - COLD_AFTER_MS - 1, NOW)).toBe(true);
    expect(isCold(NOW, NOW)).toBe(false);
  });
});

describe('isColdFromPresence', () => {
  it('treats an absent presence doc as cold', () => {
    expect(isColdFromPresence(null, NOW)).toBe(true);
  });
  it('matches isCold at the window edge when a presence doc exists', () => {
    expect(isColdFromPresence(NOW - COLD_AFTER_MS, NOW)).toBe(false);
    expect(isColdFromPresence(NOW - COLD_AFTER_MS - 1, NOW)).toBe(true);
    expect(isColdFromPresence(NOW, NOW)).toBe(false);
  });
});

describe('isRunningFresh', () => {
  it('holds while a recent run owns the subject', () => {
    expect(isRunningFresh('running', NOW - 1_000, NOW)).toBe(true);
  });
  it('releases for takeover once the run is presumed wedged', () => {
    expect(isRunningFresh('running', NOW - STALE_RUNNING_MS, NOW)).toBe(false);
  });
  it('never holds an idle subject', () => {
    expect(isRunningFresh('idle', NOW, NOW)).toBe(false);
  });
});

describe('computeNextDueAt', () => {
  const floor = 60_000;
  const noJitter = () => 0;

  it('schedules off the cache window when it is past the floor', () => {
    const expires = NOW + 300_000;
    expect(computeNextDueAt(expires, floor, NOW, noJitter)).toBe(expires);
  });

  it('never schedules under the cadence floor', () => {
    expect(computeNextDueAt(NOW + 5_000, floor, NOW, noJitter)).toBe(NOW + floor);
  });

  it('treats a null window (first sync / errored) as stale-now, paced by the floor', () => {
    expect(computeNextDueAt(null, floor, NOW, noJitter)).toBe(NOW + floor);
  });

  it('adds bounded jitter', () => {
    const max = computeNextDueAt(null, floor, NOW, () => 0.999999);
    expect(max).toBeGreaterThanOrEqual(NOW + floor);
    expect(max).toBeLessThan(NOW + floor + SYNC_JITTER_MS);
  });
});

describe('isStaleForImmediate', () => {
  it('is stale with no window or a lapsed window', () => {
    expect(isStaleForImmediate(null, [1], [1], NOW)).toBe(true);
    expect(isStaleForImmediate(NOW, [1], [1], NOW)).toBe(true);
  });
  it('is fresh inside the window when every hinted character is known', () => {
    expect(isStaleForImmediate(NOW + 30_000, [1, 2], [1, 2], NOW)).toBe(false);
  });
  it('a hinted character the engine has never synced forces a dispatch', () => {
    expect(isStaleForImmediate(NOW + 30_000, [1], [1, 2], NOW)).toBe(true);
  });
});

describe('minCacheWindow', () => {
  it('takes the earliest expiry', () => {
    expect(minCacheWindow([NOW + 60_000, NOW + 300_000])).toBe(NOW + 60_000);
  });
  it('one errored character (null window) poisons the subject to stale', () => {
    expect(minCacheWindow([NOW + 60_000, null])).toBeNull();
  });
  it('no characters means no window', () => {
    expect(minCacheWindow([])).toBeNull();
  });
});

describe('hasSyncTarget', () => {
  it('nothing hinted and nothing synced means presence-only', () => {
    expect(hasSyncTarget([], [])).toBe(false);
    expect(hasSyncTarget([1], [])).toBe(true);
    expect(hasSyncTarget([], [1])).toBe(true);
  });
});

describe('deriveConvexSiteUrl', () => {
  it('maps a cloud deployment to its .convex.site sibling', () => {
    expect(deriveConvexSiteUrl('https://doting-zebra-317.convex.cloud')).toBe(
      'https://doting-zebra-317.convex.site',
    );
  });
  it('maps the local backend to the API port + 1', () => {
    expect(deriveConvexSiteUrl('http://127.0.0.1:3210')).toBe('http://127.0.0.1:3211');
  });
  it('returns null for unrecognized shapes so callers fail loudly', () => {
    expect(deriveConvexSiteUrl('https://example.com')).toBeNull();
    expect(deriveConvexSiteUrl('not a url')).toBeNull();
  });
});
