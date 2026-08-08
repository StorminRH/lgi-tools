import { expect, test } from 'vitest';
import {
  classifyDueSubject,
  computeChainBoundary,
  computeNextDueAt,
  deriveConvexSiteUrl,
  hasSyncTarget,
  HIDDEN_PRESENCE_MAX_MS,
  isCold,
  isColdFromPresence,
  isRegisteredDataset,
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

// A representative narrow window for the pure helpers (the retired
// onlineStatus dataset's 60s visible-tab shape — the helpers are window-
// agnostic, so any value exercises them).
const ONLINE_COLD_MS = 60_000;

// A presence doc seen (and visible) at the given instant.
const seenAt = (lastSeenAt: number) => ({ lastSeenAt, lastVisibleAt: lastSeenAt });

test('dataset registration pins live-read cadence and rejects retired literals', () => {
  expect(SYNC_DATASET_CONFIG.characterLocation).toEqual({
    cadenceFloorMs: 5_000,
    coldAfterMs: 5 * 60_000,
    tokenGroup: 'char-location',
    chainOnSuccess: true,
    rateKeyScope: 'subject',
  });
  expect(MAX_COLD_AFTER_MS).toBe(5 * 60_000);
  expect(isRegisteredDataset('characterLocation')).toBe(true);
  expect(isRegisteredDataset('onlineStatus')).toBe(false);
  expect(isRegisteredDataset('skills')).toBe(false);
});

test('isCold / isColdFromPresence / isRunningFresh decide warmth across windows', () => {
  expect(isCold(seenAt(NOW - ONLINE_COLD_MS), ONLINE_COLD_MS, NOW)).toBe(false);
  expect(isCold(seenAt(NOW - ONLINE_COLD_MS - 1), ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isCold(seenAt(NOW), ONLINE_COLD_MS, NOW)).toBe(false);

  const beat = seenAt(NOW - 2 * 60_000);
  expect(isCold(beat, ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isCold(beat, SYNC_DATASET_CONFIG.characterLocation.coldAfterMs, NOW)).toBe(false);

  const hiddenOnly = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS - 1 };
  expect(isCold(hiddenOnly, MAX_COLD_AFTER_MS, NOW)).toBe(true);
  const withinCap = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS };
  expect(isCold(withinCap, MAX_COLD_AFTER_MS, NOW)).toBe(false);

  expect(isCold({ lastSeenAt: NOW }, ONLINE_COLD_MS, NOW)).toBe(false);
  expect(isCold({ lastSeenAt: NOW - ONLINE_COLD_MS - 1 }, ONLINE_COLD_MS, NOW)).toBe(true);

  expect(isColdFromPresence(null, ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isColdFromPresence(seenAt(NOW - ONLINE_COLD_MS), ONLINE_COLD_MS, NOW)).toBe(false);
  expect(isColdFromPresence(seenAt(NOW - ONLINE_COLD_MS - 1), ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isColdFromPresence(seenAt(NOW), ONLINE_COLD_MS, NOW)).toBe(false);

  expect(isRunningFresh('running', NOW - 1_000, NOW)).toBe(true);
  expect(isRunningFresh('running', NOW - STALE_RUNNING_MS, NOW)).toBe(false);
  expect(isRunningFresh('idle', NOW, NOW)).toBe(false);
});

test('classifyDueSubject decides delete / retire / skip / dispatch as one table', () => {
  expect(classifyDueSubject(null, 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('delete');
  expect(classifyDueSubject(seenAt(NOW - RETENTION_MS - 1), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe(
    'delete',
  );
  expect(classifyDueSubject(seenAt(NOW - RETENTION_MS), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe(
    'retire',
  );
  expect(
    classifyDueSubject(seenAt(NOW - ONLINE_COLD_MS - 1), 'idle', 0, ONLINE_COLD_MS, NOW),
  ).toBe('retire');

  const hiddenOnly = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS - 1 };
  expect(classifyDueSubject(hiddenOnly, 'idle', 0, MAX_COLD_AFTER_MS, NOW)).toBe('retire');

  expect(classifyDueSubject(seenAt(NOW), 'running', NOW - 1_000, ONLINE_COLD_MS, NOW)).toBe(
    'skip',
  );
  expect(classifyDueSubject(seenAt(NOW), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe('dispatch');
  expect(
    classifyDueSubject(seenAt(NOW), 'running', NOW - STALE_RUNNING_MS, ONLINE_COLD_MS, NOW),
  ).toBe('dispatch');
  expect(classifyDueSubject(seenAt(NOW - ONLINE_COLD_MS), 'idle', 0, ONLINE_COLD_MS, NOW)).toBe(
    'dispatch',
  );
});

test('scheduling helpers bound chain, due-at, stale-immediate, and sync targets', () => {
  const floor = 5_000;
  expect(computeChainBoundary(NOW + 300_000, floor, NOW)).toBe(NOW + 300_000);
  expect(computeChainBoundary(NOW + 1_000, floor, NOW)).toBe(NOW + floor);
  expect(computeChainBoundary(null, floor, NOW)).toBe(NOW + floor);

  const dueFloor = 60_000;
  const noJitter = () => 0;
  expect(computeNextDueAt(NOW + 300_000, dueFloor, NOW, noJitter)).toBe(NOW + 300_000);
  expect(computeNextDueAt(NOW + 5_000, dueFloor, NOW, noJitter)).toBe(NOW + dueFloor);
  expect(computeNextDueAt(null, dueFloor, NOW, noJitter)).toBe(NOW + dueFloor);
  const max = computeNextDueAt(null, dueFloor, NOW, () => 0.999999);
  expect(max).toBeGreaterThanOrEqual(NOW + dueFloor);
  expect(max).toBeLessThan(NOW + dueFloor + SYNC_JITTER_MS);

  expect(isStaleForImmediate(null, [1], [1], NOW)).toBe(true);
  expect(isStaleForImmediate(NOW, [1], [1], NOW)).toBe(true);
  expect(isStaleForImmediate(NOW + 30_000, [1, 2], [1, 2], NOW)).toBe(false);
  expect(isStaleForImmediate(NOW + 30_000, [1], [1, 2], NOW)).toBe(true);

  expect(minCacheWindow([NOW + 60_000, NOW + 300_000])).toBe(NOW + 60_000);
  expect(minCacheWindow([NOW + 60_000, null])).toBeNull();
  expect(minCacheWindow([])).toBeNull();

  expect(hasSyncTarget([], [])).toBe(false);
  expect(hasSyncTarget([1], [])).toBe(true);
  expect(hasSyncTarget([], [1])).toBe(true);
});

test('deriveConvexSiteUrl maps cloud and local backends; rejects unknowns', () => {
  expect(deriveConvexSiteUrl('https://doting-zebra-317.convex.cloud')).toBe(
    'https://doting-zebra-317.convex.site',
  );
  expect(deriveConvexSiteUrl('http://127.0.0.1:3210')).toBe('http://127.0.0.1:3211');
  expect(deriveConvexSiteUrl('https://example.com')).toBeNull();
  expect(deriveConvexSiteUrl('not a url')).toBeNull();
});
