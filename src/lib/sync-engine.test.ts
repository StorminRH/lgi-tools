import { expect, test } from 'vitest';
import {
  computeChainBoundary,
  computeNextDueAt,
  deriveConvexSiteUrl,
  hasSyncTarget,
  HEARTBEAT_MS,
  HIDDEN_PRESENCE_MAX_MS,
  isCold,
  isColdFromPresence,
  isStaleForImmediate,
  LOCATION_CADENCE_FLOOR_MS,
  LOCATION_COLD_AFTER_MS,
  minCacheWindow,
  RETENTION_MS,
  SYNC_DATASET_HISTORY,
  SYNC_DATASETS,
  SYNC_JITTER_MS,
} from './sync-engine';

const NOW = 1_750_000_000_000;

const ONLINE_COLD_MS = 60_000;

const seenAt = (lastSeenAt: number) => ({ lastSeenAt, lastVisibleAt: lastSeenAt });

test('location pacing constants pin the live-read cadence and the stored dataset set', () => {
  expect(LOCATION_CADENCE_FLOOR_MS).toBe(5_000);
  expect(LOCATION_COLD_AFTER_MS).toBe(5 * 60_000);
  expect(HEARTBEAT_MS).toBe(60_000);
  expect(HIDDEN_PRESENCE_MAX_MS).toBe(90 * 60_000);
  expect(RETENTION_MS).toBe(7 * 24 * 60 * 60_000);
  expect(SYNC_JITTER_MS).toBe(10_000);
  // Presence must survive several missed beats before it reads cold.
  expect(LOCATION_COLD_AFTER_MS).toBeGreaterThanOrEqual(3 * HEARTBEAT_MS);
  expect(SYNC_DATASETS).toEqual(['characterLocation']);
  expect(SYNC_DATASET_HISTORY).toEqual(['onlineStatus', 'characterLocation']);
});

test('isCold / isColdFromPresence decide warmth across windows', () => {
  expect(isCold(seenAt(NOW - ONLINE_COLD_MS), ONLINE_COLD_MS, NOW)).toBe(false);
  expect(isCold(seenAt(NOW - ONLINE_COLD_MS - 1), ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isCold(seenAt(NOW), ONLINE_COLD_MS, NOW)).toBe(false);

  const beat = seenAt(NOW - 2 * 60_000);
  expect(isCold(beat, ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isCold(beat, LOCATION_COLD_AFTER_MS, NOW)).toBe(false);

  const hiddenOnly = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS - 1 };
  expect(isCold(hiddenOnly, LOCATION_COLD_AFTER_MS, NOW)).toBe(true);
  const withinCap = { lastSeenAt: NOW, lastVisibleAt: NOW - HIDDEN_PRESENCE_MAX_MS };
  expect(isCold(withinCap, LOCATION_COLD_AFTER_MS, NOW)).toBe(false);

  expect(isCold({ lastSeenAt: NOW }, ONLINE_COLD_MS, NOW)).toBe(false);
  expect(isCold({ lastSeenAt: NOW - ONLINE_COLD_MS - 1 }, ONLINE_COLD_MS, NOW)).toBe(true);

  expect(isColdFromPresence(null, ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isColdFromPresence(seenAt(NOW - ONLINE_COLD_MS), ONLINE_COLD_MS, NOW)).toBe(false);
  expect(isColdFromPresence(seenAt(NOW - ONLINE_COLD_MS - 1), ONLINE_COLD_MS, NOW)).toBe(true);
  expect(isColdFromPresence(seenAt(NOW), ONLINE_COLD_MS, NOW)).toBe(false);
});

test('scheduling helpers bound chain, due-at, stale-immediate, and sync targets', () => {
  const floor = LOCATION_CADENCE_FLOOR_MS;
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
