// The presence-gated sync engine's pure half (3.4.9): timing math, liveness
// predicates, and the per-dataset registration data. The Convex side
// (convex/engine.ts) composes this with function references and owns the
// state; the client hook (src/data/convex/use-sync-subject.ts) shares the
// heartbeat clock. Pure and dependency-free so every scheduling decision is
// unit-testable without a Convex runtime.
//
// Two decoupled clocks, by design: the HEARTBEAT is a uniform "still
// watching" liveness signal — identical for every subject, its only job is
// cold-detection. The SYNC CADENCE is per-dataset and lives in the registry
// below. Tying heartbeat frequency to a dataset's refresh rate would blind
// cold-detection for that dataset's whole cadence.

// The datasets registered with the engine — one entry per live tracker.
// Adding a future consumer is a config change here plus a syncRef in
// convex/engine.ts, not new machinery.
export const SYNC_DATASETS = ['skills', 'industryJobs'] as const;
export type SyncDataset = (typeof SYNC_DATASETS)[number];

// Per-dataset scheduling data. cadenceFloorMs is the floor, not the target:
// the real schedule comes off each run's stored ESI Expires (minExpiresAt),
// and the floor only guards against polling faster than the dataset's cache
// (60s skills / ~300s jobs, both read live — see SCRATCHPAD 3.4.7/3.4.8).
// tokenGroup names the ESI token bucket the dataset bills (per-character
// buckets, group-keyed) — the engine's rate limiter smooths dispatch per
// group so a re-arm herd can't burst one group's spend.
export const SYNC_DATASET_CONFIG: Record<
  SyncDataset,
  { cadenceFloorMs: number; tokenGroup: string }
> = {
  skills: { cadenceFloorMs: 60_000, tokenGroup: 'char-detail' },
  industryJobs: { cadenceFloorMs: 300_000, tokenGroup: 'char-industry' },
};

// Client heartbeat interval while the tab is visible.
export const HEARTBEAT_MS = 20_000;

// A subject whose last heartbeat is older than this is cold: the scan stops
// dispatching for it (three missed beats of margin over HEARTBEAT_MS).
export const COLD_AFTER_MS = 60_000;

// A subject this long without a heartbeat is deleted by the sweep — pure
// housekeeping; a returning viewer's first heartbeat recreates the row. Lives
// here (beside COLD_AFTER_MS) so the pure sweep classifier and the engine's
// abandoned-row index range share one constant.
export const RETENTION_MS = 7 * 24 * 60 * 60_000;

// A 'running' status older than this is treated as stuck (e.g. the workpool
// onComplete itself failed) and taken over by the next dispatch — without it
// one wedged run would block the subject's syncs forever. Sized above the
// worst-case retry envelope (4 attempts, ~1s/2s/4s backoff, seconds-long
// runs). Carried verbatim from the 3.4.7/3.4.8 trackers.
export const STALE_RUNNING_MS = 3 * 60_000;

// Random spread added to every computed due time so subjects sharing a token
// group land on different scan ticks instead of dispatching as a herd.
export const SYNC_JITTER_MS = 10_000;

export function isCold(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt > COLD_AFTER_MS;
}

// Cold-detection over a subject's presence doc, which the engine reads
// separately from the subject row (presence lives in its own ephemeral table
// so an interval heartbeat never invalidates forViewer). An absent presence
// doc means no live tab has ever beaten — or its presence was already reaped —
// so it is cold by definition; otherwise defer to isCold.
export function isColdFromPresence(lastSeenAt: number | null, now: number): boolean {
  return lastSeenAt === null || isCold(lastSeenAt, now);
}

// True while a dispatched run still owns the subject — new dispatches must
// wait. Past STALE_RUNNING_MS the run is presumed wedged and a new dispatch
// takes over (the generation token makes the old run's late writes no-ops).
export function isRunningFresh(
  status: 'idle' | 'running',
  lastRequestedAt: number,
  now: number,
): boolean {
  return status === 'running' && now - lastRequestedAt < STALE_RUNNING_MS;
}

// What the sweep should do with an OVERDUE subject (one its by_next_due range
// surfaced, i.e. nextDueAt in (0, now]), given its presence liveness. Pure half
// of the sweep's Pass A so the cold/retention/running branches are unit-tested
// without a Convex runtime:
//   - cold & past retention (or never seen) → 'delete' the abandoned row
//   - cold but still within retention       → 'retire' it from the scan set
//   - a fresh run still owns it              → 'skip'
//   - otherwise (hot, idle)                  → 'dispatch'
// Mirrors the inline cold/running branches the 30s scan uses, plus the sweep's
// retention housekeeping. The retire branch needs no separate "is it overdue?"
// test: every row in Pass A's range is already overdue.
export type DueSubjectAction = 'delete' | 'retire' | 'skip' | 'dispatch';

export function classifyDueSubject(
  lastSeenAt: number | null,
  status: 'idle' | 'running',
  lastRequestedAt: number,
  now: number,
): DueSubjectAction {
  if (isColdFromPresence(lastSeenAt, now)) {
    return lastSeenAt === null || now - lastSeenAt > RETENTION_MS ? 'delete' : 'retire';
  }
  if (isRunningFresh(status, lastRequestedAt, now)) return 'skip';
  return 'dispatch';
}

// Next scheduled run: when the earliest per-character cache window ends, but
// never sooner than the dataset's cadence floor, plus jitter. minExpiresAt
// null means stale-now (first sync, or an errored character cleared its
// window) — the floor still paces it, so an erroring subject retries at
// cadence, never in a tight loop.
export function computeNextDueAt(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
  random: () => number = Math.random,
): number {
  const due = Math.max(minExpiresAt ?? 0, now + cadenceFloorMs);
  return due + Math.floor(random() * SYNC_JITTER_MS);
}

// Should a mount/visible heartbeat dispatch immediately, rather than
// wait for the scan? Yes when the data is stale (no window, or window past)
// or the viewer brought a character the engine hasn't synced yet (the
// freshness-only hint — it never grants access; the action re-enumerates).
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

// The subject-level cache window from a run's per-character windows: the
// earliest expiry, with any null (errored character — window cleared, the
// #95 "re-syncable now" meaning) poisoning the whole subject to stale.
export function minCacheWindow(windows: Array<number | null>): number | null {
  if (windows.length === 0 || windows.some((w) => w === null)) return null;
  return Math.min(...(windows as number[]));
}

// A subject with no hinted and no previously-synced characters has nothing
// to sync — heartbeats stay presence-only (parity with the shipped "no hint,
// no docs" guard).
export function hasSyncTarget(syncedCharacterIds: number[], characterIdsHint: number[]): boolean {
  return characterIdsHint.length > 0 || syncedCharacterIds.length > 0;
}

// The Convex HTTP-actions origin for a deployment URL: cloud deployments
// serve them on the sibling .convex.site domain; the local dev backend
// serves them on the API port + 1 (3210 → 3211). Returns null for shapes we
// don't recognize so the caller can fail loudly instead of posting nowhere.
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
