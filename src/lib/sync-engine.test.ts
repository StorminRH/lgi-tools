import { describe, expect, it } from 'vitest';
import {
  classifyDueSubject,
  computeChainBoundary,
  computeNextDueAt,
  deriveConvexSiteUrl,
  hasSyncTarget,
  HIDDEN_PRESENCE_MAX_MS,
  isCold,
  isColdFromPresence,
  isRunningFresh,
  isStaleForImmediate,
  MAX_COLD_AFTER_MS,
  minCacheWindow,
  RETENTION_MS,
  STALE_RUNNING_MS,
  SYNC_DATASET_CONFIG,
  SYNC_JITTER_MS,
} from './sync-engine';

const NOW = 1_750_000_000_000;

// onlineStatus's window (visible-tab dataset, three missed 20s beats).
const ONLINE_COLD_MS = SYNC_DATASET_CONFIG.onlineStatus.coldAfterMs;

// A presence doc seen (and visible) at the given instant.
const seenAt = (lastSeenAt: number) => ({ lastSeenAt, lastVisibleAt: lastSeenAt });

describe('dataset registration data', () => {
  // The floors are the live-read ESI cache windows
  // and the groups are the live-observed token buckets — pinned so a future
  // edit can't silently poll faster than a dataset's cache or bill the
  // wrong bucket. onlineStatus omits the opt-in chain fields so its path
  // stays byte-identical under the new defaults.
  it('pins the live-read cadence floor, cold window, token group, and chain policy', () => {
    expect(SYNC_DATASET_CONFIG.onlineStatus).toEqual({
      cadenceFloorMs: 60_000,
      coldAfterMs: 60_000,
      tokenGroup: 'char-online',
    });
    expect(SYNC_DATASET_CONFIG.characterLocation).toEqual({
      cadenceFloorMs: 5_000,
      coldAfterMs: 5 * 60_000,
      tokenGroup: 'char-location',
      chainOnSuccess: true,
      rateKeyScope: 'subject',
    });
  });

  it('derives the widest window as the mixed-dataset index bound', () => {
    expect(MAX_COLD_AFTER_MS).toBe(5 * 60_000);
  });
});

describe('isCold', () => {
  it('is warm exactly at the window edge and cold past it', () => {
    expect(isCold(seenAt(NOW - ONLINE_COLD_MS), ONLINE_COLD_MS, NOW)).toBe(false);
    expect(isCold(seenAt(NOW - ONLINE_COLD_MS - 1), ONLINE_COLD_MS, NOW)).toBe(true);
    expect(isCold(seenAt(NOW), ONLINE_COLD_MS, NOW)).toBe(false);
  });

  it('applies each dataset its own window', () => {
    const beat = seenAt(NOW - 2 * 60_000);
    expect(isCold(beat, SYNC_DATASET_CONFIG.onlineStatus.coldAfterMs, NOW)).toBe(true);
    expect(isCold(beat, SYNC_DATASET_CONFIG.characterLocation.coldAfterMs, NOW)).toBe(false);
  });

  it('hidden-only presence goes cold at the visible backstop despite fresh beats', () => {
    const hiddenOnly = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS - 1 };
    expect(isCold(hiddenOnly, MAX_COLD_AFTER_MS, NOW)).toBe(true);
    const withinCap = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS };
    expect(isCold(withinCap, MAX_COLD_AFTER_MS, NOW)).toBe(false);
  });

  it('a pre-migration row without lastVisibleAt falls back to lastSeenAt', () => {
    expect(isCold({ lastSeenAt: NOW }, ONLINE_COLD_MS, NOW)).toBe(false);
    expect(isCold({ lastSeenAt: NOW - ONLINE_COLD_MS - 1 }, ONLINE_COLD_MS, NOW)).toBe(true);
  });
});

describe('isColdFromPresence', () => {
  it('treats an absent presence doc as cold', () => {
    expect(isColdFromPresence(null, ONLINE_COLD_MS, NOW)).toBe(true);
  });
  it('matches isCold at the window edge when a presence doc exists', () => {
    expect(isColdFromPresence(seenAt(NOW - ONLINE_COLD_MS), ONLINE_COLD_MS, NOW)).toBe(false);
    expect(isColdFromPresence(seenAt(NOW - ONLINE_COLD_MS - 1), ONLINE_COLD_MS, NOW)).toBe(true);
    expect(isColdFromPresence(seenAt(NOW), ONLINE_COLD_MS, NOW)).toBe(false);
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

describe('classifyDueSubject', () => {
  // The sweep's Pass A decision for an overdue row, by presence liveness. These
  // pin parity with the pre-3.5.e2 single-loop sweep's cold/retention/running
  // branches.
  it('deletes an abandoned row with no presence doc', () => {
    expect(classifyDueSubject(null, 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('delete');
  });
  it('deletes a cold row past retention', () => {
    expect(classifyDueSubject(seenAt(NOW - RETENTION_MS - 1), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('delete');
  });
  it('retires a cold row exactly at the retention edge (strict >, like the old sweep)', () => {
    expect(classifyDueSubject(seenAt(NOW - RETENTION_MS), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('retire');
  });
  it('retires a cold row still within retention', () => {
    expect(classifyDueSubject(seenAt(NOW - ONLINE_COLD_MS - 1), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('retire');
  });
  it('retires a hidden-only row past the visible backstop (retention keys off lastSeenAt)', () => {
    const hiddenOnly = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS - 1 };
    expect(classifyDueSubject(hiddenOnly, 'idle', 0, MAX_COLD_AFTER_MS, NOW)).toBe('retire');
  });
  it('skips a hot row a fresh run still owns', () => {
    expect(classifyDueSubject(seenAt(NOW), 'running', NOW - 1_000, ONLINE_COLD_MS, NOW)).toBe('skip');
  });
  it('dispatches a hot idle row', () => {
    expect(classifyDueSubject(seenAt(NOW), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('dispatch');
  });
  it('dispatches a hot row whose run is presumed wedged (takeover)', () => {
    expect(classifyDueSubject(seenAt(NOW), 'running', NOW - STALE_RUNNING_MS, ONLINE_COLD_MS, NOW)).toBe('dispatch');
  });
  it('dispatches a hot row exactly at the cold edge (still warm)', () => {
    expect(classifyDueSubject(seenAt(NOW - ONLINE_COLD_MS), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('dispatch');
  });
});

describe('computeChainBoundary', () => {
  const floor = 5_000;

  it('is the jitter-free max of the cache window and the cadence floor', () => {
    expect(computeChainBoundary(NOW + 300_000, floor, NOW)).toBe(NOW + 300_000);
    expect(computeChainBoundary(NOW + 1_000, floor, NOW)).toBe(NOW + floor);
    expect(computeChainBoundary(null, floor, NOW)).toBe(NOW + floor);
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
