export const SYNC_DATASETS = ['characterLocation'] as const;
export type SyncDataset = (typeof SYNC_DATASETS)[number];
// Every dataset ever stored: retired rows must stay schema-valid until the retention GC deletes them.
export const SYNC_DATASET_HISTORY = ['onlineStatus', 'characterLocation'] as const;

/**
 * Location sync pacing. The floor is the minimum gap between runs, not the
 * target: the real schedule comes off each run's stored ESI Expires
 * (minExpiresAt), and the floor only guards against polling faster than the
 * 5s location cache.
 */
export const LOCATION_CADENCE_FLOOR_MS = 5_000;
export const LOCATION_COLD_AFTER_MS = 5 * 60_000;

export const HEARTBEAT_MS = 60_000;

export const HIDDEN_PRESENCE_MAX_MS = 90 * 60_000;

export const RETENTION_MS = 7 * 24 * 60 * 60_000;

export const SYNC_JITTER_MS = 10_000;

export interface PresenceLiveness {
  lastSeenAt: number;
  lastVisibleAt?: number;
}

export function isCold(presence: PresenceLiveness, coldAfterMs: number, now: number): boolean {
  if (now - presence.lastSeenAt > coldAfterMs) return true;
  return now - (presence.lastVisibleAt ?? presence.lastSeenAt) > HIDDEN_PRESENCE_MAX_MS;
}

export function isColdFromPresence(
  presence: PresenceLiveness | null,
  coldAfterMs: number,
  now: number,
): boolean {
  return presence === null || isCold(presence, coldAfterMs, now);
}

export function computeChainBoundary(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
): number {
  return Math.max(minExpiresAt ?? 0, now + cadenceFloorMs);
}

export function computeNextDueAt(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
  random: () => number = Math.random,
): number {
  return computeChainBoundary(minExpiresAt, cadenceFloorMs, now)
    + Math.floor(random() * SYNC_JITTER_MS);
}

export function isStaleForImmediate(
  minExpiresAt: number | null,
  syncedCharacterIds: number[],
  characterIdsHint: number[],
  now: number,
): boolean {
  if (minExpiresAt === null || minExpiresAt <= now) return true;
  const synced = new Set(syncedCharacterIds);
  return characterIdsHint.some((id) => !synced.has(id));
}

export function minCacheWindow(windows: Array<number | null>): number | null {
  if (windows.length === 0 || windows.some((w) => w === null)) return null;
  return Math.min(...(windows as number[]));
}

export function hasSyncTarget(syncedCharacterIds: number[], characterIdsHint: number[]): boolean {
  return characterIdsHint.length > 0 || syncedCharacterIds.length > 0;
}

export function deriveConvexSiteUrl(convexUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(convexUrl);
  } catch {
    return null;
  }
  if (url.hostname.endsWith('.convex.cloud')) {
    return `${url.protocol}//${url.hostname.replace(/\.convex\.cloud$/, '.convex.site')}`;
  }
  if (url.port !== '') {
    const sitePort = Number(url.port) + 1;
    return `${url.protocol}//${url.hostname}:${sitePort}`;
  }
  return null;
}
