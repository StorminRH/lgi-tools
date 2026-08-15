// The presence-gated sync engine's pure half (3.4.9): timing math, liveness
// predicates, and the per-dataset registration data. The Convex side
// (convex/engine.ts) composes this with function references and owns the
// state; the client hook (src/data/convex/use-sync-subject.ts) shares the
// heartbeat clock. Pure and dependency-free so every scheduling decision is
// unit-testable without a Convex runtime.
//
// Two decoupled clocks, by design: the HEARTBEAT is a "still watching"
// liveness signal — one client interval shared by every subject, its only job
// is cold-detection. How long a subject may go unheard before going cold is
// per-dataset (coldAfterMs in the registry below): hidden tabs keep beating
// but browsers throttle their timers to ~1/min, so a dataset that must
// survive backgrounding (characterLocation) declares a window wide enough to
// absorb throttled beats. The SYNC CADENCE is separately per-dataset. Tying
// heartbeat frequency to a dataset's refresh rate would blind cold-detection
// for that dataset's whole cadence.

/**
 * The datasets registered with the engine — one entry per live consumer.
 * Adding a future consumer is a config change here plus a syncRef in
 * convex/engine.ts, not new machinery.
 *
 * Live consumer: characterLocation (4.0.4.2.1, ~5s floor sustained by
 * chain-on-success while watched, paced down to the ~60s online probe while
 * every tracked pilot is logged off). onlineStatus (the MIGRATE.A canary) was
 * RETIRED with the portrait dot after the location sync absorbed the online
 * probe: its schema literals + leftover rows stay dormant through the drain
 * window (isRegisteredDataset guards the engine; the sweep GC drains them)
 * until the follow-up wipe drops them. The three slow trackers (skills,
 * personal + corp industry jobs) MOVED to Neon stale-gated on-view reads in
 * MIGRATE.B; MIGRATE.D.1 wiped their dormant rows. See docs/CONVEX.md for the
 * ≤2-min placement rule and the orphan-guard pattern.
 */
export const SYNC_DATASETS = ['characterLocation'] as const;
/**
 * Closed active Convex sync-dataset registry; stored schemas may temporarily retain a retiring
 * superset during drain windows.
 */
export type SyncDataset = (typeof SYNC_DATASETS)[number];

/**
 * True iff a stored dataset still has a registered syncer. A retiring dataset
 * (onlineStatus now; skills/industryJobs/corpIndustryJobs through MIGRATE.B)
 * keeps its schema literal and leftover rows until its wipe, but no longer
 * dispatches — the engine retires such an orphan instead, so a leftover
 * hot+due row can never reach a deleted syncRef and crash the shared scan.
 */
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
  /**
   * How long the subject may go without a heartbeat before the scan stops
   * dispatching for it. Sized to the dataset's tab posture: a visible-tab
   * dataset needs a few missed 20s beats of margin; a survives-backgrounding
   * dataset must absorb hidden-tab beats throttled to ~1/min.
   */
  coldAfterMs: number;
  tokenGroup: string;
  /** Schedule chainDispatch at the jitter-free Expires boundary after success. */
  chainOnSuccess?: boolean;
  /** 'subject' keys the limiter per user; default is the shared tokenGroup. */
  rateKeyScope?: 'group' | 'subject';
};

/**
 * Per-dataset cadence, token-group, and optional chain-on-success / rate-key
 * policy for every registered sync consumer.
 */
export const SYNC_DATASET_CONFIG: Record<SyncDataset, SyncDatasetConfig> = {
  // Tracked location (4.0.4.2.1) — verified ESI location/ship cache is 5s; the
  // floor pegs to that. chainOnSuccess sustains the ~5s loop while presence is
  // fresh; rateKeyScope subject keeps concurrent tracked users from sharing one
  // char-location bucket. Own token group so location re-arms never share the
  // onlineStatus dispatch bucket. coldAfterMs 5 min: the Atlas tab keeps
  // beating while hidden behind the game client, but browsers throttle hidden
  // timers to ~1/min — five missed throttled beats of margin.
  characterLocation: {
    cadenceFloorMs: 5_000,
    coldAfterMs: 5 * 60_000,
    tokenGroup: 'char-location',
    chainOnSuccess: true,
    rateKeyScope: 'subject',
  },
};

/**
 * The widest registered cold window — the only sound presence-index range
 * bound for a mixed-dataset pass (the sweep's Pass B): a narrower bound would
 * silently exclude longer-window datasets from reconciliation.
 */
export const MAX_COLD_AFTER_MS = Math.max(
  ...Object.values(SYNC_DATASET_CONFIG).map((config) => config.coldAfterMs),
);

/**
 * Client heartbeat interval. The timer runs whether the tab is visible or
 * hidden — hidden-tab beats arrive browser-throttled (~1/min) and each
 * dataset's coldAfterMs absorbs that.
 */
export const HEARTBEAT_MS = 20_000;

/**
 * The server backstop behind the client AFK flow: presence with no VISIBLE
 * beat for this long is cold regardless of continuing hidden beats, so a
 * misbehaving client can't hold a subject hot forever from a background tab.
 * Sized above the client's 1h AFK prompt + 5 min response window.
 */
export const HIDDEN_PRESENCE_MAX_MS = 90 * 60_000;

/**
 * A subject this long without a heartbeat is deleted by the sweep — pure
 * housekeeping; a returning viewer's first heartbeat recreates the row. Lives
 * here (beside the cold windows) so the pure sweep classifier and the
 * engine's abandoned-row index range share one constant.
 */
export const RETENTION_MS = 7 * 24 * 60 * 60_000;

/**
 * A 'running' status older than this is treated as stuck (e.g. the
 * completion mutation itself failed) and taken over by the next dispatch —
 * without it one wedged run would block the subject's syncs forever. Sized
 * above a seconds-long ESI run. Carried verbatim from the 3.4.7/3.4.8
 * trackers.
 */
export const STALE_RUNNING_MS = 3 * 60_000;

/**
 * Random spread added to every computed due time so subjects sharing a token
 * group land on different scan ticks instead of dispatching as a herd.
 */
export const SYNC_JITTER_MS = 10_000;

/**
 * The liveness slice of a syncPresence doc. lastVisibleAt is optional for
 * rows written before the field existed — those clients only ever beat while
 * visible, so lastSeenAt is an honest stand-in.
 */
export interface PresenceLiveness {
  lastSeenAt: number;
  lastVisibleAt?: number;
}

/**
 * Cold-detection for one presence doc against its dataset's window: cold when
 * the last beat (visible or hidden) is older than coldAfterMs, or when no
 * VISIBLE beat has arrived within HIDDEN_PRESENCE_MAX_MS (the server backstop
 * behind the client AFK flow).
 */
export function isCold(presence: PresenceLiveness, coldAfterMs: number, now: number): boolean {
  if (now - presence.lastSeenAt > coldAfterMs) return true;
  return now - (presence.lastVisibleAt ?? presence.lastSeenAt) > HIDDEN_PRESENCE_MAX_MS;
}

/**
 * Cold-detection over a subject's presence doc, which the engine reads
 * separately from the subject row (presence lives in its own ephemeral table
 * so an interval heartbeat never invalidates forViewer). An absent presence
 * doc means no live tab has ever beaten — or its presence was already reaped —
 * so it is cold by definition; otherwise defer to isCold.
 */
export function isColdFromPresence(
  presence: PresenceLiveness | null,
  coldAfterMs: number,
  now: number,
): boolean {
  return presence === null || isCold(presence, coldAfterMs, now);
}

/**
 * True while a dispatched run still owns the subject — new dispatches must
 * wait. Past STALE_RUNNING_MS the run is presumed wedged and a new dispatch
 * takes over (the generation token makes the old run's late writes no-ops).
 */
export function isRunningFresh(
  status: 'idle' | 'running',
  lastRequestedAt: number,
  now: number,
): boolean {
  return status === 'running' && now - lastRequestedAt < STALE_RUNNING_MS;
}

/**
 * What the sweep should do with an OVERDUE subject (one its by_next_due range
 * surfaced, i.e. nextDueAt in (0, now]), given its presence liveness. Pure half
 * of the sweep's Pass A so the cold/retention/running branches are unit-tested
 * without a Convex runtime:
 *   - cold & past retention (or never seen) → 'delete' the abandoned row
 *   - cold but still within retention       → 'retire' it from the scan set
 *   - a fresh run still owns it              → 'skip'
 *   - otherwise (hot, idle)                  → 'dispatch'
 * Mirrors the inline cold/running branches the 30s scan uses, plus the sweep's
 * retention housekeeping. The retire branch needs no separate "is it overdue?"
 * test: every row in Pass A's range is already overdue.
 */
export type DueSubjectAction = 'delete' | 'retire' | 'skip' | 'dispatch';

/**
 * Classifies one sync subject as due, fresh, running, or deferred from absolute timestamps;
 * callers own scheduling the resulting action.
 */
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

/**
 * The earliest legal next-run instant: max(cache window, now + cadence floor).
 * Chain-on-success writes this boundary verbatim — jitter would push the hop
 * past its own due check and silently degrade to the 30s scan.
 */
export function computeChainBoundary(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
): number {
  return Math.max(minExpiresAt ?? 0, now + cadenceFloorMs);
}

/**
 * Next scheduled run: when the earliest per-character cache window ends, but
 * never sooner than the dataset's cadence floor, plus jitter. minExpiresAt
 * null means stale-now (first sync, or an errored character cleared its
 * window) — the floor still paces it, so an erroring subject retries at
 * cadence, never in a tight loop. Chain-on-success callers use
 * computeChainBoundary instead (jitter-free).
 */
export function computeNextDueAt(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
  random: () => number = Math.random,
): number {
  return computeChainBoundary(minExpiresAt, cadenceFloorMs, now)
    + Math.floor(random() * SYNC_JITTER_MS);
}

/**
 * Should a mount/visible heartbeat dispatch immediately, rather than
 * wait for the scan? Yes when the data is stale (no window, or window past)
 * or the viewer brought a character the engine hasn't synced yet (the
 * freshness-only hint — it never grants access; the action re-enumerates).
 */
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

/**
 * The subject-level cache window from a run's per-character windows: the
 * earliest expiry, with any null (errored character — window cleared, the
 * #95 "re-syncable now" meaning) poisoning the whole subject to stale.
 */
export function minCacheWindow(windows: Array<number | null>): number | null {
  if (windows.length === 0 || windows.some((w) => w === null)) return null;
  return Math.min(...(windows as number[]));
}

/**
 * A subject with no hinted and no previously-synced characters has nothing
 * to sync — heartbeats stay presence-only (parity with the shipped "no hint,
 * no docs" guard).
 */
export function hasSyncTarget(syncedCharacterIds: number[], characterIdsHint: number[]): boolean {
  return characterIdsHint.length > 0 || syncedCharacterIds.length > 0;
}

/**
 * The Convex HTTP-actions origin for a deployment URL: cloud deployments
 * serve them on the sibling .convex.site domain; the local dev backend
 * serves them on the API port + 1 (3210 → 3211). Returns null for shapes we
 * don't recognize so the caller can fail loudly instead of posting nowhere.
 */
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
