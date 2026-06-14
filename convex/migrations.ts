// One-shot 3.5.e3 close-out migration: retire the syncSubjects.lastSeenAt
// tombstone (unread and unwritten since 3.5.e1, when presence moved to its own
// syncPresence table) and reap the pre-e1 no-presence orphans the 3.5.e2 sweep
// deliberately stopped deleting. Two coordinated steps, run in order:
//
//   1. stripAndReap (below) — strip lastSeenAt from every carrier and delete
//      every subject with no syncPresence doc. Drains across runs.
//   2. a SEPARATE deploy then drops the lastSeenAt field declaration from
//      schema.ts (Convex refuses to drop a field while live docs carry it).
//
// verifyTombstoneDrain is the authoritative "done" gate — require {0,0} before
// the field-drop deploy. ONE-SHOT: delete this file in a follow-up once prod has
// verified clean. The "no presence doc ⇒ orphan" rule is only sound for the fixed
// pre-e1 population: post-e1 a subject and its presence row are created together
// (heartbeat) and deleted together (sweep), so a future presence-less row would
// be a LIVE subject this migration would wrongly delete.
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { getPresence } from './lib/subjects';

// Process at most this many subjects per run, mirroring the engine sweep's
// SWEEP_DELETE_BATCH: ~1 paginate + 512 presence point-reads ≈ 513 index ranges,
// well under the ~4,096 db.get/query per-mutation budget (3.5.e2's binding limit).
// A capped run reschedules itself for the next page until the table is drained.
const BATCH = 512;

// lastSeenAt leaves the schema in this migration's companion field-drop, so the
// generated Doc type loses it; read it through this local shape so the one-shot
// keeps compiling on both sides of the drop.
function tombstone(subject: Doc<'syncSubjects'>): number | undefined {
  return (subject as Doc<'syncSubjects'> & { lastSeenAt?: number }).lastSeenAt;
}

export const stripAndReap = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query('syncSubjects')
      .paginate({ numItems: BATCH, cursor: cursor ?? null });

    let deleted = 0;
    let stripped = 0;
    for (const subject of page) {
      // Orphan iff no presence doc — keyed on presence absence, NOT nextDueAt (a
      // pre-e1 orphan can carry a future nextDueAt). getPresence reads the
      // by_user_dataset index, so a heartbeat concurrently creating presence for
      // this subject invalidates this read and the mutation retries, re-reading
      // presence as non-null and stripping instead of deleting: safe while live.
      const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
      if (presence === null) {
        await ctx.db.delete(subject._id);
        deleted += 1;
      } else if (tombstone(subject) !== undefined) {
        // Patching a field to undefined removes it (Convex shallow-merge). Typed
        // through the legacy shape so this compiles after lastSeenAt is dropped.
        const clear: Partial<Doc<'syncSubjects'>> & { lastSeenAt?: number } = {
          lastSeenAt: undefined,
        };
        await ctx.db.patch(subject._id, clear);
        stripped += 1;
      }
    }

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.stripAndReap, {
        cursor: continueCursor,
      });
    }
    return { processed: page.length, deleted, stripped, isDone };
  },
});

// Authoritative drain gate: count remaining tombstone carriers and no-presence
// orphans across the whole table. Two small collects (no per-row index reads) so
// it stays well within budget. Require { carriers: 0, orphans: 0 } before the
// field-declaration drop deploys.
export const verifyTombstoneDrain = internalQuery({
  args: {},
  handler: async (ctx) => {
    const subjects = await ctx.db.query('syncSubjects').collect();
    const presence = await ctx.db.query('syncPresence').collect();
    const present = new Set(presence.map((doc) => `${doc.userId}:${doc.dataset}`));
    let carriers = 0;
    let orphans = 0;
    for (const subject of subjects) {
      if (tombstone(subject) !== undefined) carriers += 1;
      if (!present.has(`${subject.userId}:${subject.dataset}`)) orphans += 1;
    }
    return { carriers, orphans, total: subjects.length };
  },
});
