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
    // requestSync skips scheduling while every doc is still fresh.
    expiresAt: v.union(v.number(), v.null()),
    syncError: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_character', ['userId', 'characterId']),

  // One doc per user: sync-run lifecycle + the latest observed ESI
  // rate-limit-group numbers (the `char-detail` bucket the 3.4.9 engine will
  // schedule against).
  syncStates: defineTable({
    userId: v.string(),
    status: v.union(v.literal('idle'), v.literal('running')),
    // The Action Retrier run currently owning this user's sync — the
    // onComplete callback matches on it, so a superseded run's completion
    // can't clear a newer run's status.
    runId: v.union(v.string(), v.null()),
    // Doubles as the run's generation token: a late applySyncResults from a
    // taken-over run no-ops unless its generation still matches.
    lastRequestedAt: v.number(),
    lastFinishedAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_run', ['runId']),
});
