// IDEMPOTENCY REGISTRY (3.10.3.2) — the third test-only sibling of
// data-ownership-registry.ts and vendor-resilience-registry.ts.
//
// The growth registry answers "why is this table bounded". The ownership
// registry answers "who may write it". The vendor registry answers "what bounds
// our outbound calls". This one answers the remaining question: when our own
// work runs twice, what breaks.
//
// Every entry records live behavior rather than an aspiration, and its census
// (src/esi-datasets/idempotency.test.ts) fails when the description and the tree
// disagree. Test-only, exactly like its siblings: no runtime module imports it,
// and nothing here configures behavior — a registry that did would become the
// only place a guarantee existed.
//
// The recorded outcome of the 3.10.3.1.1 sweep is that NO entry is at-risk. That
// empty set is a terminal outcome, not an omission: contract DC-6 accepts a
// recorded no-at-risk verdict, and HC-4 forbids adding an idempotency key where
// the duplicate or loss risk is not real.
import type { VendorIntegrationId } from './vendor-resilience-registry';

/**
 * What happens when this unit of work runs twice.
 *
 * - `inherently-idempotent` — a second run converges on the same state by construction.
 * - `key-protected` — a persisted key, unique index, or lock rejects or absorbs the duplicate.
 * - `accepted-risk` — a duplicate is possible but has no observable business effect, and the
 *   protection that would prevent it would reject legitimate writes.
 * - `coordinated-elsewhere` — the workflow is owned by another tranche and is not built here.
 *
 * There is deliberately no `at-risk` member: an at-risk finding is remediated in the session that
 * finds it, so recording one as a durable state would be recording an unfixed defect.
 */
export type IdempotencyVerdict =
  | 'inherently-idempotent'
  | 'key-protected'
  | 'accepted-risk'
  | 'coordinated-elsewhere';

/** The kind of work an entry describes, used by the census to pick the right cross-check. */
export type IdempotencyWorkKind =
  | 'vercel-cron'
  | 'convex-cron'
  | 'convex-action'
  | 'convex-mutation'
  | 'queue'
  | 'alert'
  | 'http-route'
  | 'future';

/** One re-runnable unit of work, what can redeliver it, and what happens when it re-runs. */
export interface IdempotencyEntry {
  id: string;
  workKind: IdempotencyWorkKind;
  /** What can cause this work to run a second time. */
  redeliverySource: string;
  verdict: IdempotencyVerdict;
  /** Live code, constraint, or documented platform behavior supporting the verdict. */
  evidence: string;
  /** Repository-relative module owning the work; the census resolves it against the tree. */
  module?: string;
  /** Vercel cron path, resolved against `vercel.json`. */
  cronPath?: string;
  /** POST route file, resolved against the tree. */
  route?: string;
  /** Cross-reference into the outbound resilience registry. */
  vendor?: VendorIntegrationId;
}

// Vercel does not automatically retry a failed cron job
// (vercel.com/docs/cron-jobs, fetched 2026-07-25), so the only redelivery for a
// scheduled route is schedule overlap on the two 15-minute jobs.
const VERCEL_CRON_REDELIVERY =
  'Schedule overlap only — Vercel does not automatically retry a failed cron run.';

const CRON_ENTRIES: readonly IdempotencyEntry[] = [
  {
    id: 'cron/drain-esi-refresh-jobs',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/drain-esi-refresh-jobs',
    module: 'src/app/api/cron/drain-esi-refresh-jobs/declaration.ts',
    redeliverySource: `${VERCEL_CRON_REDELIVERY} Runs every 15 minutes, so overlap is real.`,
    verdict: 'key-protected',
    evidence:
      'defineCronRoute serializes the run under the ADVISORY_LOCK_ESI_REFRESH_QUEUE session advisory lock; a concurrent run short-circuits to the declared busy body without claiming a job.',
  },
  {
    id: 'cron/sync-sweeper',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/sync-sweeper',
    module: 'src/app/api/cron/sync-sweeper/declaration.ts',
    redeliverySource: `${VERCEL_CRON_REDELIVERY} Runs every 15 minutes, so overlap is real.`,
    verdict: 'inherently-idempotent',
    evidence:
      'The watchdog declares lock mode none and calls Convex only; dispatching an already-due subject twice is absorbed by the engine’s own generation guard, and a healthy no-op touches zero Neon.',
  },
  {
    id: 'cron/refresh-affiliations',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/refresh-affiliations',
    module: 'src/app/api/cron/refresh-affiliations/declaration.ts',
    redeliverySource: VERCEL_CRON_REDELIVERY,
    verdict: 'key-protected',
    evidence:
      'Guarded by the ADVISORY_LOCK_AFFILIATION_REFRESH session advisory lock; a second run returns the declared busy body.',
  },
  {
    id: 'cron/refresh-prices',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/refresh-prices',
    module: 'src/app/api/cron/refresh-prices/declaration.ts',
    redeliverySource: VERCEL_CRON_REDELIVERY,
    verdict: 'inherently-idempotent',
    evidence:
      'Declares lock mode none with the written justification that it is the sole bulk writer and races safely with last-write-wins on-demand refreshes; a second run rewrites the same rows with the same source data.',
  },
  {
    id: 'cron/refresh-industry-indices',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/refresh-industry-indices',
    module: 'src/app/api/cron/refresh-industry-indices/declaration.ts',
    redeliverySource: VERCEL_CRON_REDELIVERY,
    verdict: 'key-protected',
    evidence:
      'Guarded by the ADVISORY_LOCK_INDUSTRY_INDICES session advisory lock; the index upserts are replace-shaped besides.',
  },
  {
    id: 'cron/refresh-sde',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/refresh-sde',
    module: 'src/app/api/cron/refresh-sde/declaration.ts',
    redeliverySource: VERCEL_CRON_REDELIVERY,
    verdict: 'key-protected',
    evidence:
      'Guarded by the ADVISORY_LOCK_SDE_INGEST session advisory lock; the ingest is a full replace keyed on the published SDE checksum, so a repeat of the same build is a no-op.',
  },
  {
    id: 'cron/refresh-wh-statics',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/refresh-wh-statics',
    module: 'src/app/api/cron/refresh-wh-statics/declaration.ts',
    redeliverySource: VERCEL_CRON_REDELIVERY,
    verdict: 'key-protected',
    vendor: 'anoik-statics',
    evidence:
      'The conditional probe runs before the shared ADVISORY_LOCK_WH_STATICS_REFRESH lock; a changed body is serialized, and recordSnapshot atomically supersedes any prior pending snapshot.',
  },
  {
    id: 'cron/refresh-gsc',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/refresh-gsc',
    module: 'src/app/api/cron/refresh-gsc/declaration.ts',
    redeliverySource: VERCEL_CRON_REDELIVERY,
    verdict: 'key-protected',
    vendor: 'google-search-console',
    evidence:
      'Guarded by the ADVISORY_LOCK_GSC_SYNC session advisory lock; rows are upserted per (date, dimension) so a repeat pull overwrites rather than accumulates.',
  },
];

const CONVEX_ENTRIES: readonly IdempotencyEntry[] = [
  {
    id: 'convex/crons:sync engine scan',
    workKind: 'convex-cron',
    module: 'convex/crons.ts',
    redeliverySource:
      'The 30-second Convex interval cron, plus the external 15-minute Vercel sweeper that dispatches the same due subjects.',
    verdict: 'inherently-idempotent',
    vendor: 'convex',
    evidence:
      'internal.engine.scan is an internalMutation. Convex scheduled mutations execute exactly once and retry transient errors inside the transaction (docs.convex.dev/scheduling/scheduled-functions, fetched 2026-07-25); dispatch is gated on syncSubjects.nextDueAt, which the same transaction advances.',
  },
  {
    id: 'convex/engine:scan',
    workKind: 'convex-mutation',
    module: 'convex/engine.ts',
    redeliverySource: 'Convex transactional retry of a transient error inside the mutation.',
    verdict: 'inherently-idempotent',
    vendor: 'convex',
    evidence:
      'Declared internalMutation, so a retry re-runs the whole transaction atomically and cannot half-apply.',
  },
  {
    id: 'convex/engine:sweep',
    workKind: 'convex-mutation',
    module: 'convex/engine.ts',
    redeliverySource: 'Convex transactional retry of a transient error inside the mutation.',
    verdict: 'inherently-idempotent',
    vendor: 'convex',
    evidence:
      'Declared internalMutation reclaiming stranded in-flight subjects; reclaiming an already-reclaimed subject is a no-op within the same transaction.',
  },
  {
    id: 'convex/engine:onSyncComplete',
    workKind: 'convex-mutation',
    module: 'convex/engine.ts',
    redeliverySource:
      'Convex transactional retry, and a duplicate completion callback from a Workpool-retried sync action.',
    verdict: 'inherently-idempotent',
    vendor: 'convex',
    evidence:
      'Declared internalMutation whose generation guard (convex/engine.ts:84-85) makes a duplicate apply a no-op, so a late or repeated completion cannot rewind a newer sync.',
  },
  {
    id: 'convex/onlineStatusSync:syncUser',
    workKind: 'convex-action',
    module: 'convex/onlineStatusSync.ts',
    redeliverySource:
      'The Convex Workpool (convex/convex.config.ts) runs the engine’s sync actions with durable exponential-backoff retries — the third retry owner, living in the Convex isolate.',
    verdict: 'inherently-idempotent',
    vendor: 'convex',
    evidence:
      'convex/engine.ts:84-85 declares the safety condition: the actions’ error taxonomy reserves throwing for transient failures, and the generation guard makes a duplicate apply a no-op. The online-status write itself is replace-shaped, so a retry converges.',
  },
];

const QUEUE_ENTRIES: readonly IdempotencyEntry[] = [
  {
    id: 'queue/enqueue',
    workKind: 'queue',
    module: 'src/data/esi-refresh-jobs/queries.ts',
    redeliverySource:
      'Two owner-sync paths deferring the same resource for the same owner before either runs.',
    verdict: 'key-protected',
    evidence:
      'The esi_refresh_jobs_live_key_unique partial unique index on idempotency_key across the live statuses rejects a second live job for the same key, so a duplicate deferral collapses into the queued one.',
  },
  {
    id: 'queue/process-job',
    workKind: 'queue',
    module: 'src/composition/sync/esi-refresh-worker.ts',
    redeliverySource:
      'The durable retry schedule (15 min – 24 h) and stranded-worker recovery both re-run a job whose first attempt did not record a terminal status.',
    verdict: 'inherently-idempotent',
    evidence:
      'Every runner writes replace-shaped: delete-then-insert per owner in owned-assets, owned-blueprints, and corporation industry-jobs, and onConflictDoUpdate in skill-queue and character industry-jobs. A second run converges on the same owner state.',
  },
  {
    id: 'queue/recover-stranded',
    workKind: 'queue',
    module: 'src/data/esi-refresh-jobs/queries.ts',
    redeliverySource:
      'Overlapping drains both observing the same stale running job past ESI_REFRESH_STALE_RUNNING_MS.',
    verdict: 'key-protected',
    evidence:
      'Both recovery statements are UPDATE ... WHERE status = \'running\' ... RETURNING, so a job leaves the running status as it is returned and only one drain can claim it; the drain itself runs under the queue advisory lock.',
  },
  {
    id: 'queue/requeue-dead-lettered',
    workKind: 'queue',
    module: 'src/data/esi-refresh-jobs/queries.ts',
    redeliverySource: 'An operator double-submitting the admin retry form.',
    verdict: 'key-protected',
    evidence:
      'requeueDeadLetteredJob is a single atomic CTE returning requeued / superseded / not_found, so the second submit reports superseded or not_found rather than creating a second live job.',
  },
  {
    id: 'sync/insert-esi-snapshot',
    workKind: 'queue',
    module: 'src/composition/sync/owned-assets-sync.ts',
    redeliverySource: 'A recovered or retried owned-assets job re-running after a partial attempt.',
    verdict: 'accepted-risk',
    evidence:
      'The one append-shaped write in the runner set, so a re-run can leave a second snapshot row. No duplicate is observable — readers take the latest by fetchedAt — the table is retention-pruned, and a uniqueness constraint would also reject a legitimate re-pull of an unchanged etag, which HC-4 forbids. Operator verdict, 2026-07-25.',
  },
];

const ALERT_ENTRIES: readonly IdempotencyEntry[] = [
  {
    id: 'alert/esi-refresh-dead-letter',
    workKind: 'alert',
    module: 'src/lib/alerts.ts',
    vendor: 'discord-webhooks',
    redeliverySource:
      'A re-run of the drain that dead-lettered the job, or two drains interleaving on the same job.',
    verdict: 'inherently-idempotent',
    evidence:
      'drainEsiRefreshJobs alerts on recovery.deadLettered in src/composition/sync/esi-refresh-worker.ts; the recovery UPDATEs move each job off running as they return it and the drain holds the queue advisory lock, so no interleaving double-alerts.',
  },
  {
    id: 'alert/public-esi-budget-exhaustion',
    workKind: 'alert',
    module: 'src/lib/alerts.ts',
    vendor: 'discord-webhooks',
    redeliverySource: 'Concurrent serverless instances all observing the same exhausted budget.',
    verdict: 'key-protected',
    evidence:
      'claimPublicEsiBudgetAlert takes a short-lived per-window lease before delivery and hasPublicEsiBudgetAlertForWindow gates on the window, so exactly one instance delivers per window.',
  },
  {
    id: 'alert/price-source-degradation',
    workKind: 'alert',
    module: 'src/lib/alerts.ts',
    vendor: 'discord-webhooks',
    redeliverySource: 'Every degraded price read on every instance.',
    verdict: 'accepted-risk',
    evidence:
      'Deliberately one message per degradation event: the signal is the rate, not the occurrence, and suppressing repeats would hide a worsening outage. Delivery is best-effort and never blocks the read.',
  },
];

// Every POST-bearing route. Nothing redelivers a browser mutation:
// src/transport/api-client.ts contains no retry, and Vercel does not replay a
// request. A repeated submit is therefore user-initiated, which is why the
// default mutation verdict is accepted-risk rather than a manufactured key —
// HC-4 bars adding one where the risk is not real.
const NO_PLATFORM_REDELIVERY =
  'User-initiated repeat submit only — src/transport/api-client.ts contains no retry and no platform replays the request.';

function readRoute(route: string, evidence: string): IdempotencyEntry {
  return {
    id: `route:${route}`,
    workKind: 'http-route',
    route,
    redeliverySource: NO_PLATFORM_REDELIVERY,
    verdict: 'inherently-idempotent',
    evidence,
  };
}

function mutationRoute(
  route: string,
  verdict: IdempotencyVerdict,
  evidence: string,
): IdempotencyEntry {
  return {
    id: `route:${route}`,
    workKind: 'http-route',
    route,
    redeliverySource: NO_PLATFORM_REDELIVERY,
    verdict,
    evidence,
  };
}

const ROUTE_ENTRIES: readonly IdempotencyEntry[] = [
  // ── POST-bodied tool reads: no write, so re-running is free ─────────────
  readRoute('src/app/api/eve/names/route.ts', 'Pure resolution of posted ids through the ESI gate; writes nothing.'),
  readRoute('src/app/api/industry/build-location/route.ts', 'Pure resolution over reference data; writes nothing.'),
  readRoute('src/app/api/industry/owned-assets/route.ts', 'Read of the caller’s own stored assets; writes nothing.'),
  readRoute('src/app/api/industry/owned-blueprints/route.ts', 'Read of the caller’s own stored blueprints; writes nothing.'),
  readRoute('src/app/api/industry/skill-levels/route.ts', 'Read of the caller’s own stored skills; writes nothing.'),
  readRoute('src/app/api/account/custom-structures/parse-fit/route.ts', 'Parses a pasted fit against reference data; writes nothing.'),

  // ── Set-shaped mutations: the second write states the same value ────────
  mutationRoute('src/app/api/account/active-character/route.ts', 'inherently-idempotent', 'Sets the active character to a named id; a repeat sets the same id.'),
  mutationRoute('src/app/api/preferences/route.ts', 'inherently-idempotent', 'Upserts one preference key to a named value; a repeat writes the same value.'),
  mutationRoute('src/app/api/account/corp-structures/sharing/route.ts', 'inherently-idempotent', 'Sets a corporation’s sharing flag to a named boolean; a repeat sets the same flag.'),
  mutationRoute('src/app/api/account/corp-structures/rigs/route.ts', 'inherently-idempotent', 'Replaces a structure’s rig set with the posted set; a repeat replaces it with the same set.'),
  mutationRoute('src/app/api/account/custom-structures/set-pin/route.ts', 'inherently-idempotent', 'Sets a structure’s system pin to a named id; a repeat sets the same pin.'),
  mutationRoute('src/app/api/account/custom-structures/set-tax/route.ts', 'inherently-idempotent', 'Sets a structure’s tax rate to a named value; a repeat sets the same rate.'),
  mutationRoute('src/app/api/account/saved-plans/rename/route.ts', 'inherently-idempotent', 'Sets a plan’s name by id; a repeat sets the same name.'),
  mutationRoute('src/app/api/account/saved-plans/favorite/route.ts', 'inherently-idempotent', 'Sets a plan’s favorite flag by id to a named boolean; a repeat sets the same flag.'),
  mutationRoute('src/app/api/admin/role/route.ts', 'inherently-idempotent', 'Sets a user’s role to a named value; a repeat sets the same role.'),
  mutationRoute('src/app/api/admin/wh-statics/route.ts', 'key-protected', 'Refresh uses the shared advisory lock, serializes snapshot writes, and reuses an identical latest ETag and digest instead of superseding it; promote and reject accept only a pending snapshot, so a repeated review action is refused without changing the promoted copy.'),

  // ── Delete-shaped mutations: the second delete finds nothing ────────────
  mutationRoute('src/app/api/account/saved-plans/delete/route.ts', 'inherently-idempotent', 'Deletes one owned plan by id; the second delete matches no row and returns not found.'),
  mutationRoute('src/app/api/account/custom-structures/delete/route.ts', 'inherently-idempotent', 'Deletes one owned structure by id; the second delete matches no row.'),
  mutationRoute('src/app/api/account/characters/unlink/route.ts', 'inherently-idempotent', 'Unlinks one owned character by id; the second unlink matches no linked account.'),
  mutationRoute('src/app/api/admin/characters/unlink/route.ts', 'inherently-idempotent', 'Admin unlink of one character by id; the second matches no linked account.'),
  mutationRoute('src/app/api/account/purge-character/route.ts', 'inherently-idempotent', 'Purges one owned character’s data; a repeat finds nothing left to purge.'),
  mutationRoute('src/app/api/account/delete/route.ts', 'inherently-idempotent', 'Deletes the caller’s account and owned rows; a repeat finds no account and fails the identity gate.'),
  mutationRoute('src/app/api/account/sessions/revoke/route.ts', 'inherently-idempotent', 'Revokes all of the caller’s sessions; a repeat revokes an already-empty set.'),
  mutationRoute('src/app/api/admin/sessions/revoke/route.ts', 'inherently-idempotent', 'Revokes all of one user’s sessions; a repeat revokes an already-empty set.'),

  // ── Create-shaped and effectful mutations ──────────────────────────────
  mutationRoute('src/app/api/account/saved-plans/route.ts', 'accepted-risk', 'A double submit can create a second plan. Nothing redelivers it, the route already enforces a per-user plan cap, and a client-supplied key would add a protection HC-4 bars where the risk is not real; the duplicate is user-visible and user-deletable.'),
  mutationRoute('src/app/api/account/custom-structures/route.ts', 'accepted-risk', 'A double submit can create a second custom structure. Nothing redelivers it, the route already enforces a per-user cap, and the duplicate is user-visible and user-deletable.'),
  mutationRoute('src/app/api/feedback/route.ts', 'accepted-risk', 'A double submit can deliver a second Discord message and telemetry row. Rate-limited per client, no durable state is corrupted, and deduplicating free-text feedback would suppress genuine repeat reports.'),
  mutationRoute('src/app/api/admin/characters/reassign/route.ts', 'inherently-idempotent', 'Moves one character onto a named account; the second reassignment to the same target is a no-op and to a different target is a deliberate new decision.'),
  mutationRoute('src/app/api/admin/esi-jobs/retry/route.ts', 'key-protected', 'Delegates to requeueDeadLetteredJob, a single atomic CTE returning requeued / superseded / not_found, so a double submit cannot create a second live job.'),
  mutationRoute('src/app/api/market-prices/refresh/route.ts', 'inherently-idempotent', 'Refreshes prices for the posted type ids and persists write-behind as the new seed; a repeat re-reads and rewrites the same seed rows last-write-wins.'),
  mutationRoute('src/app/api/market-history/refresh/route.ts', 'inherently-idempotent', 'Refreshes history for the posted type ids and upserts per (typeId, date); a repeat rewrites the same rows.'),

  // ── The four uninstrumented POST surfaces, judged with the rest ─────────
  mutationRoute('src/app/api/auth/[...all]/route.ts', 'inherently-idempotent', 'Better Auth owns its own request lifecycle; session creation is keyed on its own token and a repeated callback is rejected or replaces the same session.'),
  mutationRoute('src/app/api/internal/eve-characters/route.ts', 'inherently-idempotent', 'Machine-to-machine read of linked characters for the Convex isolate; writes nothing.'),
  mutationRoute('src/app/api/internal/eve-token/route.ts', 'key-protected', 'Machine-to-machine token vend. Concurrent vends of a rotating refresh token are resolved by the stored-token row, and the eve_token_refresh_race telemetry records the losing vend rather than corrupting state.'),
  mutationRoute('src/app/api/telemetry/route.ts', 'accepted-risk', 'The client beacon can deliver the same page view twice. Counts are the product, an exactly-once beacon is not achievable from a browser, and no durable state beyond the count is affected.'),
];

const FUTURE_ENTRIES: readonly IdempotencyEntry[] = [
  {
    id: 'LGI-06/revocation-outbox',
    workKind: 'future',
    redeliverySource:
      'A future outbox draining pending EVE token revocations, which would retry a delivery whose acknowledgement was lost.',
    verdict: 'coordinated-elsewhere',
    evidence:
      'LGI-06 belongs to the security tranche of docs/VERSION_3_10_PLAN.md and is not implemented here. Contract HC-6 permits citing it and forbids building it, so this entry deliberately names no owning module.',
  },
];

/**
 * Every re-runnable unit of work in the tree, with what can redeliver it, the verdict, and the live
 * evidence for that verdict. The census in `src/esi-datasets/idempotency.test.ts` binds this to the
 * tree: it resolves every declared module, route, and cron path, requires an entry for every
 * `vercel.json` cron and every `convex/crons.ts` job, and fails when an entry describes work that
 * no longer exists.
 */
export const IDEMPOTENCY_REGISTRY: readonly IdempotencyEntry[] = [
  ...CRON_ENTRIES,
  ...CONVEX_ENTRIES,
  ...QUEUE_ENTRIES,
  ...ALERT_ENTRIES,
  ...ROUTE_ENTRIES,
  ...FUTURE_ENTRIES,
];
