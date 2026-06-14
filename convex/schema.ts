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
  // One doc per (user, character): the synced skill-queue + skill-totals
  // projection, plus this tracker's conditional-request custody. The held
  // ETags live HERE (not in the gate's shared cache — that cache is
  // unauthenticated-only by design, since a shared cache must never hold
  // per-character data).
  characterSync: defineTable({
    userId: v.string(),
    characterId: v.number(),
    // null until the first successful sync — e.g. a character whose very
    // first read errored. ETags and payload travel together: an etag is only
    // ever stored beside the payload a future 304 would confirm.
    data: v.union(
      v.null(),
      v.object({
        entries: v.array(skillQueueEntryValidator),
        totalSp: v.number(),
        unallocatedSp: v.optional(v.number()),
      }),
    ),
    queueEtag: v.union(v.string(), v.null()),
    skillsEtag: v.union(v.string(), v.null()),
    // Last time the data was confirmed current (a 200 or a 304) — the UI's
    // "as of" timestamp. Not bumped by a failed sync.
    lastSyncedAt: v.union(v.number(), v.null()),
    // When this doc's ESI cache window ends, read off the response's Expires
    // header (60s observed for skills — but always read, never assumed).
    // The engine schedules the next run off the per-user minimum.
    expiresAt: v.union(v.number(), v.null()),
    syncError: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // One doc per watched subject (dataset × user): presence plus the run
  // lifecycle the 3.4.9 engine absorbed from the trackers. Replaces the
  // 3.4.7/3.4.8 twin per-tracker state tables — the dataset is part of the
  // row key, so the trackers' lifecycles stay isolated (the recorded clobber
  // rationale) without duplicating the machinery.
  syncSubjects: defineTable({
    // Must enumerate the same datasets as SYNC_DATASETS in
    // src/lib/sync-engine.ts (the engine's registry).
    dataset: v.union(v.literal('skills'), v.literal('industryJobs')),
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
    dataset: v.union(v.literal('skills'), v.literal('industryJobs')),
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

  // One doc per (user, character): the synced industry-jobs projection plus
  // this tracker's conditional-request custody — the characterSync twin for
  // tracker #2 (3.4.8). One ESI endpoint, so one held ETag. Same custody
  // rules: etag only ever stored beside the payload a future 304 would
  // confirm; an errored result clears expiresAt so the next mount/visible
  // heartbeat is never silently swallowed after an error.
  industryJobsSync: defineTable({
    userId: v.string(),
    characterId: v.number(),
    data: v.union(v.null(), v.object({ jobs: v.array(industryJobValidator) })),
    jobsEtag: v.union(v.string(), v.null()),
    lastSyncedAt: v.union(v.number(), v.null()),
    // Cache window read off the response's Expires header (spec says 300s
    // for industry jobs — but always read, never assumed).
    expiresAt: v.union(v.number(), v.null()),
    syncError: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

});
