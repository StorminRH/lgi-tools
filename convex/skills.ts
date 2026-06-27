// Skill-queue tracker — the Convex half of the 3.4.7 sync flow, run-lifecycle
// machinery absorbed by the 3.4.9 engine (convex/engine.ts).
//
// Canonical shape: client heartbeat (engine, presence + on-view dispatch) →
// engine scan on the dataset's cadence while watched → Workpool →
// skillsSync.syncUser (action, talks to Neon + ESI) → applySyncResults (ONE
// batched mutation, generation-guarded against the engine's subject row) →
// forViewer (reactive query). The client never calls the action directly,
// and no client-posted character id carries authority — the action
// re-enumerates the user's characters server-side on every run.
import { v, type Infer } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, query } from './_generated/server';
import { stampSyncSubject } from './lib/characterSync';
import { getSyncSubject } from './lib/subjects';
import { skillQueueEntryValidator } from './schema';

// The COLD half of the viewer split (SA.5): the calling user's synced skill
// payloads, keyed by character. Its read set is the characterSyncData table
// alone — so it re-fires ONLY when a genuine skill body changes, never on a
// per-cycle 304/dispatch/completion (those touch the hot meta + subject rows,
// which this query never reads). The client joins it with runStateForViewer by
// character id. A character with no cold doc yet (unfetched / errored-first /
// needs-reconnect) simply isn't here — the merge surfaces it via its hot row.
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({ characterId: doc.characterId, data: doc.data })),
    };
  },
});

// The HOT half of the viewer split (SA.5): per-character freshness/error plus
// the run lifecycle. Reads only the small hot meta docs (characterSync) and the
// subject row — never the heavy payload — so it can re-fire every cycle (status
// flips, the 304 lastSyncedAt bump) cheaply. ETags and userId stay custody-only.
export const runStateForViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const state = await getSyncSubject(ctx.db, 'skills', userId);
    return {
      characters: docs.map((doc) => ({
        characterId: doc.characterId,
        lastSyncedAt: doc.lastSyncedAt,
        syncError: doc.syncError,
      })),
      syncState:
        state === null
          ? null
          : {
              status: state.status,
              lastRequestedAt: state.lastRequestedAt,
              lastFinishedAt: state.lastFinishedAt,
              lastError: state.lastError,
            },
    };
  },
});

// The action's read seam: which ETag to replay per character. An ETag is only
// offered when the doc holds the payload a 304 would confirm — so a 304 can
// never arrive without data to keep.
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const docs = await ctx.db
      .query('characterSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    // The payload now lives in the cold table; a cold doc EXISTS iff that
    // character holds data (we never write a null-data cold doc). So cold-doc
    // presence is the data-presence gate the etag-implies-data invariant needs.
    const coldDocs = await ctx.db
      .query('characterSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const hasData = new Set(coldDocs.map((doc) => doc.characterId));
    return docs.map((doc) => ({
      characterId: doc.characterId,
      queueEtag: hasData.has(doc.characterId) ? doc.queueEtag : null,
      skillsEtag: hasData.has(doc.characterId) ? doc.skillsEtag : null,
    }));
  },
});

// Per-character outcome the action hands back. Payload halves are null when
// a 304 said "unchanged" (keep the doc's copy); the etags are the RESOLVED
// values to store — the action echoes the held etag across a 304 because
// ESI's 304 does not repeat the ETag header.
const characterResultValidator = v.object({
  characterId: v.number(),
  queueEntries: v.union(v.null(), v.array(skillQueueEntryValidator)),
  skills: v.union(
    v.null(),
    v.object({ totalSp: v.number(), unallocatedSp: v.optional(v.number()) }),
  ),
  queueEtag: v.union(v.string(), v.null()),
  skillsEtag: v.union(v.string(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});

// The run's single batched write. Idempotent (upserts keyed by
// userId+characterId), so a Workpool retry that re-runs the action cannot
// double-write; the generation guard (against the engine's subject row)
// makes a superseded run's late apply a no-op instead of an overwrite.
export const applySyncResults = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    enumeratedCharacterIds: v.array(v.number()),
    results: v.array(characterResultValidator),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const subject = await getSyncSubject(ctx.db, 'skills', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db
      .query('characterSync')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const byCharacter = new Map(docs.map((doc) => [doc.characterId, doc]));
    // The cold payload docs, loaded alongside so each result's apply gets its
    // existing payload and orphan cleanup can delete both halves together.
    const coldDocs = await ctx.db
      .query('characterSyncData')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const coldByCharacter = new Map(coldDocs.map((doc) => [doc.characterId, doc]));
    const now = Date.now();
    const enumerated = new Set(args.enumeratedCharacterIds);

    // The post-apply cache window per surviving character, accumulated as we go
    // so we don't re-read the whole characterSync set just to re-derive it for
    // the subject stamp. Seed from the enumerated docs that survive orphan
    // cleanup; each applied result overwrites its character's window below.
    const windowsByCharacter = new Map<number, number | null>();
    for (const doc of docs) {
      if (enumerated.has(doc.characterId)) {
        windowsByCharacter.set(doc.characterId, doc.expiresAt);
      } else {
        // Orphan cleanup: a character no longer linked to this user (unlinked,
        // or reassigned to another pilot) must not keep serving its old snapshot.
        // Delete BOTH the hot meta doc and the cold payload doc.
        await ctx.db.delete(doc._id);
        const cold = coldByCharacter.get(doc.characterId);
        if (cold !== undefined) await ctx.db.delete(cold._id);
      }
    }

    for (const result of args.results) {
      if (!enumerated.has(result.characterId)) continue;
      const expiresAt = await applySkillResult(
        ctx,
        args.userId,
        result,
        byCharacter.get(result.characterId),
        coldByCharacter.get(result.characterId),
        now,
      );
      windowsByCharacter.set(result.characterId, expiresAt);
    }

    // Stamp the run's results onto the engine's subject row: the cache
    // window the next due time is computed from, the enumeration the
    // heartbeat hint checks against, and the rl* observability.
    await stampSyncSubject(ctx, subject._id, [...windowsByCharacter.values()], args, now);
    // status stays 'running' here — the workpool's onComplete owns the
    // lifecycle and clears it exactly once.
  },
});

// Upsert one character's skills result across the hot meta doc and the cold
// payload doc. The hot doc is ALWAYS written (etags/freshness/error). The cold
// payload doc is written ONLY when a fresh ESI half arrived: a pure 304 (both
// halves null) keeps the existing payload AND leaves the cold doc untouched, so
// the payload view's read set never re-fires for an unchanged blob (the SA.5
// point). The "fresh half" test is per-half because skills has two independent
// etags — a mixed 200/304 (queue fresh, skills 304, or vice-versa) IS a data
// change. An errored read keeps the payload but clears the cache window so the
// next mount/visible heartbeat re-syncs immediately. A successful result always
// carries a window (the action falls back to now + 60s when ESI sends no Expires).
async function applySkillResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existingHot: Doc<'characterSync'> | undefined,
  existingCold: Doc<'characterSyncData'> | undefined,
  now: number,
): Promise<number | null> {
  const data = mergeData(existingCold?.data ?? null, result);
  const refreshed = result.error === null;
  const hotFields = {
    queueEtag: result.queueEtag,
    skillsEtag: result.skillsEtag,
    lastSyncedAt: refreshed ? now : (existingHot?.lastSyncedAt ?? null),
    expiresAt: refreshed ? result.expiresAt : null,
    syncError: result.error,
  };
  if (existingHot !== undefined) {
    await ctx.db.patch(existingHot._id, hotFields);
  } else {
    await ctx.db.insert('characterSync', { userId, characterId: result.characterId, ...hotFields });
  }

  // Cold payload: write only when a fresh half is present and merged to a real
  // payload. A pure 304/error never reaches the cold table.
  const freshHalf = result.queueEntries !== null || result.skills !== null;
  if (freshHalf && data !== null) {
    if (existingCold !== undefined) {
      await ctx.db.patch(existingCold._id, { data });
    } else {
      await ctx.db.insert('characterSyncData', { userId, characterId: result.characterId, data });
    }
  }

  // The resulting cache window, returned so the caller can accumulate the
  // post-apply set without re-reading the whole table.
  return hotFields.expiresAt;
}

type SyncedData = {
  entries: Array<Infer<typeof skillQueueEntryValidator>>;
  totalSp: number;
  unallocatedSp?: number;
};
type CharacterResult = Infer<typeof characterResultValidator>;

// Merge a result into the doc's existing payload: fresh halves replace, 304
// halves keep. Returns the existing payload untouched when a half can't be
// resolved (defensive — heldState's etag-implies-data invariant should make
// that impossible).
function mergeData(existing: SyncedData | null, result: CharacterResult): SyncedData | null {
  const entries = result.queueEntries ?? existing?.entries;
  const totalSp = result.skills?.totalSp ?? existing?.totalSp;
  if (entries === undefined || totalSp === undefined) return existing;
  const unallocatedSp =
    result.skills !== null ? result.skills.unallocatedSp : existing?.unallocatedSp;
  return unallocatedSp !== undefined ? { entries, totalSp, unallocatedSp } : { entries, totalSp };
}
