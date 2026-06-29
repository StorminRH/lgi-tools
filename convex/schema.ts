import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Convex is a regenerable projection of live ESI data keyed by the Neon
// identities (userId + characterId) — never the system of record, never a
// home for SDE/domain data. Wiping these tables and re-syncing must
// reproduce the same state from Neon + ESI.

// One skill-queue entry, verbatim ESI field names (see
// src/features/skill-queue/esi-projection.ts for the boundary parse). The
// dates and SP fields are all absent when the queue is paused.
export const skillQueueEntryValidator = v.object({
  skill_id: v.number(),
  queue_position: v.number(),
  finished_level: v.number(),
  start_date: v.optional(v.string()),
  finish_date: v.optional(v.string()),
  level_start_sp: v.optional(v.number()),
  level_end_sp: v.optional(v.number()),
  training_start_sp: v.optional(v.number()),
});

// One industry job, verbatim ESI field names (see
// src/features/industry-jobs/esi-projection.ts for the boundary parse) —
// with ONE deliberate deviation: `status` is a DERIVED projection, not raw
// ESI truth. ESI computes job status lazily (a fresh read can still say
// 'active' after end_date has passed), so applySyncResults rewrites
// active-with-past-end to 'ready' at write time and the scheduled
// markJobReady flip patches it at end_date. The derivation is a pure
// function of (payload, now), so the regenerable-projection invariant above
// still holds: wipe + resync reproduces the same state.
export const industryJobValidator = v.object({
  job_id: v.number(),
  // The installer character (who's running the job). Optional only to keep
  // pre-3.7.3.4 stored docs valid until their next resync repopulates it (the
  // projection now always parses it); the merged active-jobs board reads it for
  // per-job runner attribution.
  installer_id: v.optional(v.number()),
  activity_id: v.number(),
  blueprint_type_id: v.number(),
  // Absent on copying/research jobs — the blueprint is the headline there.
  product_type_id: v.optional(v.number()),
  runs: v.number(),
  status: v.union(
    v.literal('active'),
    v.literal('paused'),
    v.literal('ready'),
    v.literal('delivered'),
    v.literal('cancelled'),
    v.literal('reverted'),
  ),
  start_date: v.string(),
  end_date: v.string(),
  // Present while the installing facility is offline; freezes progress.
  pause_date: v.optional(v.string()),
});

export default defineSchema({
  // DORMANT since MIGRATE.B.1 — skills moved to a Neon stale-gated on-view read; this
  // table is no longer written (its syncer was removed) but kept declared so existing
  // rows stay schema-valid until the session-D wipe + declaration removal.
  // One doc per (user, character): the HOT sync metadata for the skill-queue
  // tracker — conditional-request custody plus freshness/error state. The held
  // ETags live HERE (not in the gate's shared cache — that cache is
  // unauthenticated-only by design, since a shared cache must never hold
  // per-character data). The heavy skill payload lives in characterSyncData
  // (the COLD table); the two are written together by the apply but kept on
  // SEPARATE docs so this row — which the run-state view subscribes to and which
  // the apply bumps on every 304 (lastSyncedAt/expiresAt) — never re-reads the
  // blob through Convex's document-granular reactivity (SA.5; the subscription
  // split prescribed in docs/CONVEX.md "Reactivity is read-set–precise").
  // Generalises the 3.5.e1 presence-split one layer deeper.
  characterSync: defineTable({
    userId: v.string(),
    characterId: v.number(),
    // ETags and payload travel together: an etag is only ever stored (HERE)
    // beside the payload (in characterSyncData) a future 304 would confirm.
    queueEtag: v.union(v.string(), v.null()),
    skillsEtag: v.union(v.string(), v.null()),
    // Last time the data was confirmed current (a 200 or a 304) — the UI's
    // "as of" timestamp. Not bumped by a failed sync. Bumped on every 304,
    // which is exactly why the heavy payload must NOT share this row.
    lastSyncedAt: v.union(v.number(), v.null()),
    // When this doc's ESI cache window ends, read off the response's Expires
    // header (60s observed for skills — but always read, never assumed).
    // The engine schedules the next run off the per-user minimum.
    expiresAt: v.union(v.number(), v.null()),
    syncError: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // DORMANT since MIGRATE.B.1 (see characterSync above) — no longer written; kept
  // declared until the session-D wipe.
  // One doc per (user, character): the COLD skill payload — the heavy half split
  // off characterSync in SA.5 so the payload view (skills.forViewer) re-reads it
  // ONLY on a genuine data change, never on a per-cycle 304/dispatch/completion.
  // The apply writes this doc only when a fresh ESI body arrives (a pure 304
  // leaves it untouched, which is the whole point), so the doc EXISTS iff the
  // character has been synced at least once — data is the non-null payload, never
  // a null placeholder (an unfetched/errored-first/needs-reconnect character has
  // a HOT doc but no cold doc, and the merge surfaces it as "no data yet").
  // Regenerable like every row here.
  characterSyncData: defineTable({
    userId: v.string(),
    characterId: v.number(),
    data: v.object({
      entries: v.array(skillQueueEntryValidator),
      totalSp: v.number(),
      unallocatedSp: v.optional(v.number()),
    }),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // One doc per watched subject (dataset × user): presence plus the run
  // lifecycle the 3.4.9 engine absorbed from the trackers. Replaces the
  // 3.4.7/3.4.8 twin per-tracker state tables — the dataset is part of the
  // row key, so the trackers' lifecycles stay isolated (the recorded clobber
  // rationale) without duplicating the machinery.
  syncSubjects: defineTable({
    // A SUPERSET of the active SYNC_DATASETS in src/lib/sync-engine.ts. It retains
    // 'skills' (MIGRATE.B.1) and 'industryJobs' (MIGRATE.B.2) as dormant literals after
    // each moved to Neon, so existing subject rows stay schema-valid until the session-D
    // wipe — removing a literal while those rows exist would halt the schema push. No
    // syncer is registered for them; the engine retires an orphaned subject
    // (isRegisteredDataset).
    dataset: v.union(
      v.literal('skills'),
      v.literal('industryJobs'),
      v.literal('corpIndustryJobs'),
      v.literal('onlineStatus'),
    ),
    userId: v.string(),
    status: v.union(v.literal('idle'), v.literal('running')),
    // Doubles as the run's generation token (shipped name kept): a late
    // applySyncResults from a taken-over run no-ops unless it matches.
    lastRequestedAt: v.number(),
    // The workpool item currently owning this subject — onSyncComplete
    // matches on it, so a superseded run's completion can't clear a newer
    // run's status.
    workId: v.union(v.string(), v.null()),
    // When the scan should next dispatch this subject; null retires it from
    // the scan set (cold, or nothing to sync) until a heartbeat revives it.
    nextDueAt: v.union(v.number(), v.null()),
    // min(expiresAt) across the user's synced docs after the last run — the
    // cache-window input to the next due time. null = stale now (first
    // sync, or an errored character cleared its window — the #95 meaning).
    minExpiresAt: v.union(v.number(), v.null()),
    // The characters the last run enumerated, so a heartbeat's hint can
    // detect a newly linked character without a per-dataset table read.
    syncedCharacterIds: v.array(v.number()),
    lastFinishedAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    .index('by_next_due', ['nextDueAt']),

  // One ephemeral presence doc per watched subject (dataset × user): the
  // liveness heartbeat, split off the syncSubjects row in 3.5.e1. forViewer
  // reads syncSubjects but NEVER this table, so an interval beat's lastSeenAt
  // write (3×/min per visible tab) can no longer invalidate the heavy tracker
  // payload through Convex's document-granular reactivity. Pure ephemeral
  // liveness — like every row here it is regenerable: a returning tab's first
  // heartbeat recreates it, and the engine sweep reaps it alongside a
  // long-abandoned subject.
  syncPresence: defineTable({
    dataset: v.union(
      v.literal('skills'),
      v.literal('industryJobs'),
      v.literal('corpIndustryJobs'),
      v.literal('onlineStatus'),
    ),
    userId: v.string(),
    // Last heartbeat from a visible tab. The scan and sweep treat a presence
    // doc older than COLD_AFTER_MS — or a missing one — as cold.
    lastSeenAt: v.number(),
  })
    .index('by_user_dataset', ['userId', 'dataset'])
    // The sweep's two presence-driven passes range over this: hot rows
    // (lastSeenAt >= now - COLD_AFTER_MS, the dropped-timer reconcile) and
    // past-retention rows (lastSeenAt < now - RETENTION_MS, the abandoned-row
    // GC). Ascending order makes the GC pass oldest-first, so a capped catch-up
    // run drains the backlog deterministically.
    .index('by_last_seen', ['lastSeenAt']),

  // DORMANT since MIGRATE.B.2 (like characterSync above) — no longer written; kept
  // declared until the session-D wipe so leftover rows stay schema-valid.
  // One doc per (user, character): the HOT sync metadata for the industry-jobs
  // tracker — the characterSync twin for tracker #2 (3.4.8). One ESI endpoint, so
  // one held ETag. Same custody rules: etag only ever stored beside the payload
  // (in industryJobsSyncData) a future 304 would confirm; an errored result
  // clears expiresAt so the next mount/visible heartbeat is never silently
  // swallowed after an error. The heavy jobs payload lives in the COLD table
  // (SA.5 — see characterSync/characterSyncData for the reactivity rationale).
  industryJobsSync: defineTable({
    userId: v.string(),
    characterId: v.number(),
    jobsEtag: v.union(v.string(), v.null()),
    lastSyncedAt: v.union(v.number(), v.null()),
    // Cache window read off the response's Expires header (spec says 300s
    // for industry jobs — but always read, never assumed).
    expiresAt: v.union(v.number(), v.null()),
    syncError: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // DORMANT since MIGRATE.B.2 (like characterSyncData above) — no longer written; kept
  // declared until the session-D wipe.
  // One doc per (user, character): the COLD industry-jobs payload — the heavy
  // half split off industryJobsSync in SA.5 (the characterSyncData twin). While live it
  // was written only on a fresh body (a 304 left it untouched) and patched in place by
  // the markJobReady completion flip (removed in B.2 — the Neon read now stores raw ESI
  // status and the client derives "ready" from each job's absolute end_date). Existed iff
  // the character had synced its board at least once. Regenerable.
  industryJobsSyncData: defineTable({
    userId: v.string(),
    characterId: v.number(),
    data: v.object({ jobs: v.array(industryJobValidator) }),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // DORMANT since MIGRATE.B.3 (like characterSync / industryJobsSync above) — corp
  // jobs moved to a Neon stale-gated on-view read; no longer written (its syncer +
  // markJobReady were removed) but kept declared until the session-D wipe so leftover
  // rows stay schema-valid.
  // One doc per (user, corporation): the HOT sync metadata for the CORP
  // industry-jobs tracker — the industryJobsSync twin keyed by corp instead of
  // character (3.7.3.1, the first corp feature). A corp board is per-corp, fanned
  // in from the user's role-holding characters: a run resolves the user's
  // characters to the corps they can read, dedups to one subject per corp, and
  // reads each corp's board ONCE. The job sub-shape is identical to the character
  // endpoint (a superset on the wire; Zod strips the corp-only extras), so
  // industryJobValidator is reused verbatim in the COLD table. One ESI endpoint
  // per corp → ONE held ETag, same custody rules as industryJobsSync (etag only
  // stored beside the payload — in corpIndustryJobsSyncData — a 304 would confirm;
  // an errored/needs_role result clears expiresAt so the next heartbeat re-syncs).
  // A corporation whose vending character lacks the in-game Factory_Manager role
  // is a PRESENT hot doc with syncError:'needs_role' and NO cold doc — a distinct,
  // graceful state (not a scope/AccessGate prompt, and not absent), surfaced by
  // the merge as "needs role, no data". Corp data is per-user and private here (no
  // cross-user sharing — that's a later policy call). Heavy payload split off in
  // SA.5 (see characterSync/characterSyncData for the reactivity rationale).
  corpIndustryJobsSync: defineTable({
    userId: v.string(),
    corporationId: v.number(),
    jobsEtag: v.union(v.string(), v.null()),
    lastSyncedAt: v.union(v.number(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    syncError: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_corp', ['userId', 'corporationId']),

  // DORMANT since MIGRATE.B.3 (like characterSyncData / industryJobsSyncData above) —
  // no longer written; kept declared until the session-D wipe.
  // One doc per (user, corporation): the COLD corp industry-jobs payload — the
  // heavy half split off corpIndustryJobsSync in SA.5 (the industryJobsSyncData
  // twin). While live it was written only on a fresh body (a 304 or a needs_role
  // result left it untouched) and patched in place by the markJobReady completion flip
  // (removed in B.3 — the Neon read now stores raw ESI status and the client derives
  // "ready" from each job's absolute end_date); existed iff the corp board had synced at
  // least once. Regenerable.
  corpIndustryJobsSyncData: defineTable({
    userId: v.string(),
    corporationId: v.number(),
    data: v.object({ jobs: v.array(industryJobValidator) }),
  })
    .index('by_user', ['userId'])
    .index('by_user_corp', ['userId', 'corporationId']),

  // One doc per (user, character): the live online/offline state (MIGRATE.A — the
  // online-status canary, the engine's keeper consumer through the placement
  // migration). DELIBERATELY NOT split hot/cold like the trackers above. This row
  // carries NO per-cycle bookkeeping field — no lastSyncedAt, no expiresAt (the
  // cache window is stamped only onto the syncSubjects row), and no syncError —
  // so onlineStatus.forViewer subscribes to it directly. `etag` is the only
  // custody field, and for THIS endpoint it rotates only on a genuine flip:
  // GET /characters/{id}/online's body (online + last_login/last_logout/logins)
  // changes solely at a login/logout, which always flips `online`, so a steady
  // character only ever 304s and this row is written ONLY on a real online↔offline
  // change. The SA.5 hot/cold split exists to stop a per-cycle bookkeeping write
  // re-reading a HEAVY payload through document-granular reactivity; here the
  // payload is one bool and there is no per-cycle write, so neither reason applies
  // — the apply's no-op-write guard (write only when online/etag changed) is the
  // discipline instead. Regenerable like every row here.
  characterOnline: defineTable({
    userId: v.string(),
    characterId: v.number(),
    online: v.boolean(),
    // Held for the conditional read; only ever stored beside the `online` value a
    // 304 would confirm. ESI's 304 never repeats the ETag, so the action echoes
    // the held one across an unchanged read.
    etag: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),
});
