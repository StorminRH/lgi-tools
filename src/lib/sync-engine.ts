export const SYNC_DATASETS = ['characterLocation'] as const;

export type SyncDataset = (typeof SYNC_DATASETS)[number];

export function isRegisteredDataset(dataset: string): dataset is SyncDataset {
  return (SYNC_DATASETS as readonly string[]).includes(dataset);
}

/**
 * Per-dataset scheduling data. cadenceFloorMs is the floor, not the target:
 * the real schedule comes off each run's stored ESI Expires (minExpiresAt),
 * and the floor only guards against polling faster than the dataset's cache
 * (~300s jobs / 60s online, both read live).
 * tokenGroup names the ESI token bucket the dataset bills (per-character
 * buckets, group-keyed) — the engine's rate limiter smooths dispatch per
 * group so a re-arm herd can't burst one group's spend.
 * chainOnSuccess / rateKeyScope are opt-in; omitted keeps today's scan-owned
 * jittered re-arm and group-keyed limiter (onlineStatus stays byte-identical).
 */
export type SyncDatasetConfig = {
  cadenceFloorMs: number;

  coldAfterMs: number;
  tokenGroup: string;

  chainOnSuccess?: boolean;

  rateKeyScope?: 'group' | 'subject';
};

export const SYNC_DATASET_CONFIG: Record<SyncDataset, SyncDatasetConfig> = {

  characterLocation: {
    cadenceFloorMs: 5_000,
    coldAfterMs: 5 * 60_000,
    tokenGroup: 'char-location',
    chainOnSuccess: true,
    rateKeyScope: 'subject',
  },
};

export const MAX_COLD_AFTER_MS = Math.max(
  ...Object.values(SYNC_DATASET_CONFIG).map((config) => config.coldAfterMs),
);

export const HEARTBEAT_MS = 20_000;

export const HIDDEN_PRESENCE_MAX_MS = 90 * 60_000;

export const RETENTION_MS = 7 * 24 * 60 * 60_000;

export const STALE_RUNNING_MS = 3 * 60_000;

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

export function isRunningFresh(
  status: 'idle' | 'running',
  lastRequestedAt: number,
  now: number,
): boolean {
  return status === 'running' && now - lastRequestedAt < STALE_RUNNING_MS;
}

export type DueSubjectAction = 'delete' | 'retire' | 'skip' | 'dispatch';

export function classifyDueSubject(
  presence: PresenceLiveness | null,
  status: 'idle' | 'running',
  lastRequestedAt: number,
  coldAfterMs: number,
  now: number,
): DueSubjectAction {
  if (isColdFromPresence(presence, coldAfterMs, now)) {
    return presence === null || now - presence.lastSeenAt > RETENTION_MS ? 'delete' : 'retire';
  }
  if (isRunningFresh(status, lastRequestedAt, now)) return 'skip';
  return 'dispatch';
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
