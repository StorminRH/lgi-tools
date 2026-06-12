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
import { minCacheWindow } from '@/lib/sync-engine';
import { internalMutation, internalQuery, query } from './_generated/server';
import { getSyncSubject } from './lib/subjects';
import { skillQueueEntryValidator } from './schema';

// The calling user's synced characters + run state, grouped client-side by
// character. ETags and userId are custody/keying details — not on the wire.
export const forViewer = query({
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
        data: doc.data,
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
    return docs.map((doc) => ({
      characterId: doc.characterId,
      queueEtag: doc.data !== null ? doc.queueEtag : null,
      skillsEtag: doc.data !== null ? doc.skillsEtag : null,
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
    const now = Date.now();

    // Orphan cleanup: a character no longer linked to this user (unlinked, or
    // reassigned to another pilot) must not keep serving its old snapshot.
    const enumerated = new Set(args.enumeratedCharacterIds);
    for (const doc of docs) {
      if (!enumerated.has(doc.characterId)) {
        await ctx.db.delete(doc._id);
      }
    }

    for (const result of args.results) {
      if (!enumerated.has(result.characterId)) continue;
      const existing = byCharacter.get(result.characterId);
      const data = mergeData(existing?.data ?? null, result);
      const refreshed = result.error === null;
      const fields = {
        data,
        queueEtag: result.queueEtag,
        skillsEtag: result.skillsEtag,
        lastSyncedAt: refreshed ? now : (existing?.lastSyncedAt ?? null),
        // An errored character must stay immediately re-syncable: carrying
        // the old cache window past an error would make the freshness gate
        // silently swallow "Sync now" until the stale window expired.
        // Successful results always carry a window (the action falls back to
        // now + 60s when ESI sends no Expires).
        expiresAt: refreshed ? result.expiresAt : null,
        syncError: result.error,
      };
      if (existing !== undefined) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert('characterSync', {
          userId: args.userId,
          characterId: result.characterId,
          ...fields,
        });
      }
    }

    // Stamp the run's results onto the engine's subject row: the cache
    // window the next due time is computed from, the enumeration the
    // heartbeat hint checks against, and the rl* observability.
    const after = await ctx.db
      .query('characterSync')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    await ctx.db.patch(subject._id, {
      minExpiresAt: minCacheWindow(after.map((doc) => doc.expiresAt)),
      syncedCharacterIds: args.enumeratedCharacterIds,
      lastFinishedAt: now,
      lastError: args.lastError,
      rlGroup: args.rlGroup,
      rlLimit: args.rlLimit,
      rlRemaining: args.rlRemaining,
      rlUsed: args.rlUsed,
    });
    // status stays 'running' here — the workpool's onComplete owns the
    // lifecycle and clears it exactly once.
  },
});

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
