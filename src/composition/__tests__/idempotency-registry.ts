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
    id: 'cron/purge-maps',
    workKind: 'vercel-cron',
    cronPath: '/api/cron/purge-maps',
    module: 'src/app/api/cron/purge-maps/declaration.ts',
    redeliverySource: VERCEL_CRON_REDELIVERY,
    verdict: 'key-protected',
    evidence:
      'defineCronRoute serializes the daily sweep under ADVISORY_LOCK_MAP_PURGE. Neon claims each due row before the first Convex delete, which blocks publish and restore; each Convex batch deletes only remaining indexed rows, and Neon tombstones only after a clean terminal response.',
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
      'The conditional probe runs before the shared ADVISORY_LOCK_WH_STATICS_REFRESH lock; a changed body is serialized, and recordSnapshot atomically supersedes any prior pending snapshot only when the probe baseline still matches, so a redelivered or delayed run cannot replace a newer observation.',
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

type ConvexIdempotencyEntry = Pick<
  IdempotencyEntry,
  'id' | 'workKind' | 'module' | 'redeliverySource' | 'evidence'
>;

function convexEntry(entry: ConvexIdempotencyEntry): IdempotencyEntry {
  return {
    ...entry,
    verdict: 'inherently-idempotent',
    vendor: 'convex',
  };
}

const convexMapSignaturePurge = convexEntry({
  id: 'convex/crons:map signature purge',
  workKind: 'convex-cron',
  module: 'convex/crons.ts',
  redeliverySource:
    'The 15-minute Convex interval may run again after an earlier bounded batch partially drained expired signature tombstones.',
  evidence:
    'The internal mutation ranges only purgeAfter values that are currently expired, deletes each matching document atomically, and reports exact continuation truth; a repeat sees only the remaining indexed range.',
});
const convexMapChainPurge = convexEntry({
  id: 'convex/crons:map chain purge',
  workKind: 'convex-cron',
  module: 'convex/crons.ts',
  redeliverySource:
    'The 15-minute Convex interval may run again after an earlier batch partially drained the expiry ranges.',
  evidence:
    'The internal mutation atomically deletes only currently expired rows or clears purgeAfter on live-endpoint skeleton ties; a repeat observes the remaining indexed range and cannot repeat a completed write.',
});
const convexMapCeilingCollapse = convexEntry({
  id: 'convex/crons:map ceiling collapse',
  workKind: 'convex-cron',
  module: 'convex/crons.ts',
  redeliverySource:
    'The 15-minute Convex interval may run again after an earlier bounded batch collapsed only part of the expired-ceiling range.',
  evidence:
    'The internal mutation ranges live rows only (the candidate index leads with the tombstone field, so a collapsed row leaves the range when stamped), re-reads each row before acting so in-batch branch collateral is skipped, isolates per-row failures without committing partial work, and every collapse routes through the shared-stamp core; a repeat observes only rows every previous batch left live.',
});
const convexSyncEngineScan = convexEntry({
  id: 'convex/crons:sync engine scan',
  workKind: 'convex-cron',
  module: 'convex/crons.ts',
  redeliverySource:
    'The 30-second Convex interval cron, plus the external 15-minute Vercel sweeper that dispatches the same due subjects.',
  evidence:
    'internal.engineScan.scan is an internalMutation. Convex scheduled mutations execute exactly once and retry transient errors inside the transaction (docs.convex.dev/scheduling/scheduled-functions, fetched 2026-07-25); dispatch is gated on syncSubjects.nextDueAt, which the same transaction advances.',
});
const convexEngineScan = convexEntry({
  id: 'convex/engineScan:scan',
  workKind: 'convex-mutation',
  module: 'convex/engineScan.ts',
  redeliverySource: 'Convex transactional retry of a transient error inside the mutation.',
  evidence:
    'Declared internalMutation, so a retry re-runs the whole transaction atomically and cannot half-apply.',
});
const convexEngineSweep = convexEntry({
  id: 'convex/engineSweep:sweep',
  workKind: 'convex-mutation',
  module: 'convex/engineSweep.ts',
  redeliverySource: 'Convex transactional retry of a transient error inside the mutation.',
  evidence:
    'Declared internalMutation reclaiming stranded in-flight subjects; reclaiming an already-reclaimed subject is a no-op within the same transaction.',
});
const convexEngineOnSyncComplete = convexEntry({
  id: 'convex/engineComplete:onSyncComplete',
  workKind: 'convex-mutation',
  module: 'convex/engineComplete.ts',
  redeliverySource: 'Convex transactional retry of a transient error inside the mutation.',
  evidence:
    'Declared internalMutation whose workId ownership guard makes a late or repeated completion a no-op, so it cannot clear a newer run’s status.',
});
const convexLocationSyncUser = convexEntry({
  id: 'convex/characterLocationSync:syncUser',
  workKind: 'convex-action',
  module: 'convex/characterLocationSync.ts',
  redeliverySource:
    'A single scheduled Convex action (engine dispatch via scheduler.runAfter). Scheduled actions execute at most once and are not retried.',
  evidence:
    'convex/lib/engineCore.ts declares the safety condition: only transient failures throw, and the generation guard on apply plus the workId guard on onSyncComplete make a duplicate write a no-op. Location and held-probe upserts are replace-shaped keyed by userId+characterId.',
});

const CONVEX_ENTRIES: readonly IdempotencyEntry[] = [
  convexMapSignaturePurge,
  convexMapChainPurge,
  convexMapCeilingCollapse,
  convexSyncEngineScan,
  convexEngineScan,
  convexEngineSweep,
  convexEngineOnSyncComplete,
  convexLocationSyncUser,
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
    module: 'src/composition/sync/owned-assets-source-save.ts',
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

const NO_PLATFORM_REDELIVERY =
  'User-initiated repeat submit only — src/transport/api-client.ts contains no retry and no platform replays the request.';

type ReadRouteEntry = {
  readonly route: string;
  readonly evidence: string;
};

type MutationRouteEntry = ReadRouteEntry & {
  readonly verdict: IdempotencyVerdict;
};

function readRoute(entry: ReadRouteEntry): IdempotencyEntry {
  const { route, evidence } = entry;
  return {
    id: `route:${route}`,
    workKind: 'http-route',
    route,
    redeliverySource: NO_PLATFORM_REDELIVERY,
    verdict: 'inherently-idempotent',
    evidence,
  };
}

function mutationRoute(entry: MutationRouteEntry): IdempotencyEntry {
  const { route, verdict, evidence } = entry;
  return {
    id: `route:${route}`,
    workKind: 'http-route',
    route,
    redeliverySource: NO_PLATFORM_REDELIVERY,
    verdict,
    evidence,
  };
}

const mapsSearchCharactersRoute = mutationRoute({
  route: 'src/app/api/maps/search-characters/route.ts',
  verdict: 'key-protected',
  evidence:
    'Character results are read-only, while token vending may refresh encrypted EVE credentials or invalid-grant state; those writes use ciphertext-keyed compare-and-swap and a repeat reflects the stored winner rather than applying an unsafe second mutation.',
});
const eveNamesRoute = readRoute({
  route: 'src/app/api/eve/names/route.ts',
  evidence: 'Pure resolution of posted ids through the ESI gate; writes nothing.',
});
const industryBuildLocationRoute = readRoute({
  route: 'src/app/api/industry/build-location/route.ts',
  evidence: 'Pure resolution over reference data; writes nothing.',
});
const industryOwnedAssetsRoute = readRoute({
  route: 'src/app/api/industry/owned-assets/route.ts',
  evidence: 'Read of the caller’s own stored assets; writes nothing.',
});
const industryOwnedBlueprintsRoute = readRoute({
  route: 'src/app/api/industry/owned-blueprints/route.ts',
  evidence: 'Read of the caller’s own stored blueprints; writes nothing.',
});
const industrySkillLevelsRoute = readRoute({
  route: 'src/app/api/industry/skill-levels/route.ts',
  evidence: 'Read of the caller’s own stored skills; writes nothing.',
});
const customStructuresParseFitRoute = readRoute({
  route: 'src/app/api/account/custom-structures/parse-fit/route.ts',
  evidence: 'Parses a pasted fit against reference data; writes nothing.',
});
const accountActiveCharacterRoute = mutationRoute({
  route: 'src/app/api/account/active-character/route.ts',
  verdict: 'inherently-idempotent',
  evidence: 'Sets the active character to a named id; a repeat sets the same id.',
});
const preferencesRoute = mutationRoute({
  route: 'src/app/api/preferences/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Upserts one preference key to a named value; a repeat writes the same value.',
});
const corpStructuresSharingRoute = mutationRoute({
  route: 'src/app/api/account/corp-structures/sharing/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Sets a corporation’s sharing flag to a named boolean; a repeat sets the same flag.',
});
const corpStructuresRigsRoute = mutationRoute({
  route: 'src/app/api/account/corp-structures/rigs/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Replaces a structure’s rig set with the posted set; a repeat replaces it with the same set.',
});
const customStructuresSetPinRoute = mutationRoute({
  route: 'src/app/api/account/custom-structures/set-pin/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Sets a structure’s system pin to a named id; a repeat sets the same pin.',
});
const customStructuresSetTaxRoute = mutationRoute({
  route: 'src/app/api/account/custom-structures/set-tax/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Sets a structure’s tax rate to a named value; a repeat sets the same rate.',
});
const savedPlansRenameRoute = mutationRoute({
  route: 'src/app/api/account/saved-plans/rename/route.ts',
  verdict: 'inherently-idempotent',
  evidence: 'Sets a plan’s name by id; a repeat sets the same name.',
});
const savedPlansFavoriteRoute = mutationRoute({
  route: 'src/app/api/account/saved-plans/favorite/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Sets a plan’s favorite flag by id to a named boolean; a repeat sets the same flag.',
});
const adminRoleRoute = mutationRoute({
  route: 'src/app/api/admin/role/route.ts',
  verdict: 'inherently-idempotent',
  evidence: 'Sets a user’s role to a named value; a repeat sets the same role.',
});
const adminWhStaticsRoute = mutationRoute({
  route: 'src/app/api/admin/wh-statics/route.ts',
  verdict: 'key-protected',
  evidence:
    'Refresh uses the shared advisory lock, serializes snapshot writes, reuses an identical latest non-rejected ETag and digest instead of superseding it, and refuses a response whose pre-lock baseline no longer matches the newest snapshot; rejected observations remain eligible for a later pending review. Promote and reject accept only a pending snapshot, so a repeated review action is refused without changing the promoted copy.',
});
const mapsSignatureEliminationRoute = mutationRoute({
  route: 'src/app/api/maps/signature-elimination/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'The Convex deduction door re-reads every target atomically, skips equal writes, and refuses any field no longer null or assumed; repeating a pass therefore converges without overwriting human facts.',
});
const mapsJumpRoute = mutationRoute({
  route: 'src/app/api/maps/jump/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Convex atomically stamps each genuine location transition before applying its odometer effect; a repeated request for the same transition observes the stamp and converges without applying mass twice.',
});
const mapsAccessRoute = mutationRoute({
  route: 'src/app/api/maps/access/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Upsert sets one composite-keyed durable grant to the posted role and revoke deletes that exact key; an identical repeat leaves Neon in the same state, then reserves a newer durable projection revision before recomputing the complete one-way access projection.',
});
const mapsDeleteRoute = mutationRoute({
  route: 'src/app/api/maps/delete/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'The guarded update transitions only an active map into archive; a repeat finds no active row, changes nothing, and cannot start collaborative purge.',
});
const mapsRestoreRoute = mutationRoute({
  route: 'src/app/api/maps/restore/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'The guarded update clears archive only inside grace before purge begins; a purge claim blocks restore, and a repeat finds no archived row and changes nothing.',
});
const mapsPurgeNowRoute = mutationRoute({
  route: 'src/app/api/maps/purge-now/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'The creator-only guarded update sets purge_requested_at only while it and purge_claimed_at are null; a repeat cannot advance the timestamp or invoke collaborative deletion directly.',
});
const savedPlansDeleteRoute = mutationRoute({
  route: 'src/app/api/account/saved-plans/delete/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Deletes one owned plan by id; the second delete matches no row and returns not found.',
});
const customStructuresDeleteRoute = mutationRoute({
  route: 'src/app/api/account/custom-structures/delete/route.ts',
  verdict: 'inherently-idempotent',
  evidence: 'Deletes one owned structure by id; the second delete matches no row.',
});
const accountCharactersUnlinkRoute = mutationRoute({
  route: 'src/app/api/account/characters/unlink/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Unlinks one owned character by id; the second unlink matches no linked account.',
});
const adminCharactersUnlinkRoute = mutationRoute({
  route: 'src/app/api/admin/characters/unlink/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Admin unlink of one character by id; the second matches no linked account.',
});
const accountPurgeCharacterRoute = mutationRoute({
  route: 'src/app/api/account/purge-character/route.ts',
  verdict: 'inherently-idempotent',
  evidence: 'Purges one owned character’s data; a repeat finds nothing left to purge.',
});
const accountDeleteRoute = mutationRoute({
  route: 'src/app/api/account/delete/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Deletes the caller’s account and owned rows; a repeat finds no account and fails the identity gate.',
});
const accountSessionsRevokeRoute = mutationRoute({
  route: 'src/app/api/account/sessions/revoke/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Revokes all of the caller’s sessions; a repeat revokes an already-empty set.',
});
const adminSessionsRevokeRoute = mutationRoute({
  route: 'src/app/api/admin/sessions/revoke/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Revokes all of one user’s sessions; a repeat revokes an already-empty set.',
});
const mapsCreateRoute = mutationRoute({
  route: 'src/app/api/maps/create/route.ts',
  verdict: 'accepted-risk',
  evidence:
    'A repeated authenticated submit can create another visible map. Nothing redelivers the request, and the route is limited to five creates per user per minute. Each durable map-plus-grants insert is atomic. Failure tears down any possibly-applied projection before deleting Neon; a purge claim blocks publish and takes terminal cleanup ownership.',
});
const savedPlansCreateRoute = mutationRoute({
  route: 'src/app/api/account/saved-plans/route.ts',
  verdict: 'accepted-risk',
  evidence:
    'A double submit can create a second plan. Nothing redelivers it, the route already enforces a per-user plan cap, and a client-supplied key would add a protection HC-4 bars where the risk is not real; the duplicate is user-visible and user-deletable.',
});
const customStructuresCreateRoute = mutationRoute({
  route: 'src/app/api/account/custom-structures/route.ts',
  verdict: 'accepted-risk',
  evidence:
    'A double submit can create a second custom structure. Nothing redelivers it, the route already enforces a per-user cap, and the duplicate is user-visible and user-deletable.',
});
const feedbackRoute = mutationRoute({
  route: 'src/app/api/feedback/route.ts',
  verdict: 'accepted-risk',
  evidence:
    'A double submit can open a second Linear issue and telemetry row. Rate-limited per client, no durable state is corrupted, and deduplicating free-text feedback would suppress genuine repeat reports.',
});
const adminCharactersReassignRoute = mutationRoute({
  route: 'src/app/api/admin/characters/reassign/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Moves one character onto a named account; the second reassignment to the same target is a no-op and to a different target is a deliberate new decision.',
});
const adminEsiJobsRetryRoute = mutationRoute({
  route: 'src/app/api/admin/esi-jobs/retry/route.ts',
  verdict: 'key-protected',
  evidence:
    'Delegates to requeueDeadLetteredJob, a single atomic CTE returning requeued / superseded / not_found, so a double submit cannot create a second live job.',
});
const marketPricesRefreshRoute = mutationRoute({
  route: 'src/app/api/market-prices/refresh/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Refreshes prices for the posted type ids and persists write-behind as the new seed; a repeat re-reads and rewrites the same seed rows last-write-wins.',
});
const marketHistoryRefreshRoute = mutationRoute({
  route: 'src/app/api/market-history/refresh/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Refreshes history for the posted type ids and upserts per (typeId, date); a repeat rewrites the same rows.',
});
const authCatchAllRoute = mutationRoute({
  route: 'src/app/api/auth/[...all]/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Better Auth owns its own request lifecycle; session creation is keyed on its own token and a repeated callback is rejected or replaces the same session.',
});
const internalEveCharactersRoute = mutationRoute({
  route: 'src/app/api/internal/eve-characters/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Machine-to-machine read of linked characters for the Convex isolate; writes nothing.',
});
const internalEveTokenRoute = mutationRoute({
  route: 'src/app/api/internal/eve-token/route.ts',
  verdict: 'key-protected',
  evidence:
    'Machine-to-machine token vend. Concurrent vends of a rotating refresh token are resolved by the stored-token row, and the eve_token_refresh_race telemetry records the losing vend rather than corrupting state.',
});
const telemetryRoute = mutationRoute({
  route: 'src/app/api/telemetry/route.ts',
  verdict: 'accepted-risk',
  evidence:
    'The client beacon can deliver the same page view twice. Counts are the product, an exactly-once beacon is not achievable from a browser, and no durable state beyond the count is affected.',
});
const syncLeaveRoute = mutationRoute({
  route: 'src/app/api/sync-leave/route.ts',
  verdict: 'inherently-idempotent',
  evidence:
    'Tab-close leave retires one user×dataset subject when the posted tabId is still the live beater; a repeat or a stale tab is a no-op, and a newer tab is ignored.',
});

const ROUTE_ENTRIES: readonly IdempotencyEntry[] = [
  mapsSearchCharactersRoute,
  eveNamesRoute,
  industryBuildLocationRoute,
  industryOwnedAssetsRoute,
  industryOwnedBlueprintsRoute,
  industrySkillLevelsRoute,
  customStructuresParseFitRoute,
  accountActiveCharacterRoute,
  preferencesRoute,
  corpStructuresSharingRoute,
  corpStructuresRigsRoute,
  customStructuresSetPinRoute,
  customStructuresSetTaxRoute,
  savedPlansRenameRoute,
  savedPlansFavoriteRoute,
  adminRoleRoute,
  adminWhStaticsRoute,
  mapsSignatureEliminationRoute,
  mapsJumpRoute,
  mapsAccessRoute,
  mapsDeleteRoute,
  mapsRestoreRoute,
  mapsPurgeNowRoute,
  savedPlansDeleteRoute,
  customStructuresDeleteRoute,
  accountCharactersUnlinkRoute,
  adminCharactersUnlinkRoute,
  accountPurgeCharacterRoute,
  accountDeleteRoute,
  accountSessionsRevokeRoute,
  adminSessionsRevokeRoute,
  mapsCreateRoute,
  savedPlansCreateRoute,
  customStructuresCreateRoute,
  feedbackRoute,
  adminCharactersReassignRoute,
  adminEsiJobsRetryRoute,
  marketPricesRefreshRoute,
  marketHistoryRefreshRoute,
  authCatchAllRoute,
  internalEveCharactersRoute,
  internalEveTokenRoute,
  telemetryRoute,
  syncLeaveRoute,
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
