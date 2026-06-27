// Owned-blueprints tracker (character variant) — the Convex half of the 3.7.5.1
// sync flow, run-lifecycle machinery owned by the engine (convex/engine.ts).
// The characterSync/skills.ts twin: cold/hot split, generation-guarded apply,
// reactive views. One paginated ESI endpoint, so a held ETag PER PAGE.
//
// Canonical shape: client heartbeat (engine, presence + on-view dispatch) →
// engine scan on the dataset's cadence while watched → Workpool →
// characterBlueprintsSync.syncUser (action, talks to Neon + ESI) →
// applySyncResults (ONE batched, generation-guarded mutation) → forViewer
// (reactive query). No client-posted character id carries authority — the
// action re-enumerates the user's characters server-side on every run.
import { v, type Infer } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, query } from './_generated/server';
import { stampSyncSubject } from './lib/characterSync';
import { sameBlueprints } from './lib/ownedBlueprints';
import { getSyncSubject } from './lib/subjects';
import { ownedBlueprintValidator } from './schema';

// The COLD half of the viewer split: the calling user's owned blueprints, keyed
// by character. Reads characterBlueprintsSyncData alone, so it re-fires ONLY on
// a genuine payload change — never on a per-cycle 304/dispatch/completion (those
// touch the hot meta + subject rows this query never reads). A character with no
// cold doc yet (unfetched / errored-first / needs-reconnect) isn't here; the
// merge surfaces it via its hot row.
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterBlueprintsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({ characterId: doc.characterId, data: doc.data })),
    };
  },
});

// The HOT half of the viewer split: per-character freshness/error plus the run
// lifecycle. Reads only the small hot meta docs and the subject row — never the
// heavy payload — so it can re-fire cheaply every cycle. ETags stay custody-only.
export const runStateForViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterBlueprintsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const state = await getSyncSubject(ctx.db, 'characterBlueprints', userId);
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

// The action's read seam: which per-page ETags to replay per character. Offered
// only when the cold doc holds the payload a 304 would confirm — so a 304 can
// never arrive without data to keep (an empty array means "fetch fresh").
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const docs = await ctx.db
      .query('characterBlueprintsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const coldDocs = await ctx.db
      .query('characterBlueprintsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const hasData = new Set(coldDocs.map((doc) => doc.characterId));
    return docs.map((doc) => ({
      characterId: doc.characterId,
      etags: hasData.has(doc.characterId) ? doc.etags : [],
    }));
  },
});

// Per-character outcome the action hands back. blueprints is null when a 304
// said "unchanged" (keep the cold doc's copy) or on an error; etags are the
// RESOLVED per-page values to store (the action echoes the held etags across a
// 304/error since ESI's 304 does not repeat them).
const characterResultValidator = v.object({
  characterId: v.number(),
  blueprints: v.union(v.null(), v.array(ownedBlueprintValidator)),
  etags: v.array(v.string()),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});

// The run's single batched write. Idempotent (upserts keyed by
// userId+characterId); the generation guard makes a superseded run's late apply
// a no-op instead of an overwrite.
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
    const subject = await getSyncSubject(ctx.db, 'characterBlueprints', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db
      .query('characterBlueprintsSync')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const byCharacter = new Map(docs.map((doc) => [doc.characterId, doc]));
    const coldDocs = await ctx.db
      .query('characterBlueprintsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const coldByCharacter = new Map(coldDocs.map((doc) => [doc.characterId, doc]));
    const now = Date.now();
    const enumerated = new Set(args.enumeratedCharacterIds);

    const windowsByCharacter = new Map<number, number | null>();
    for (const doc of docs) {
      if (enumerated.has(doc.characterId)) {
        windowsByCharacter.set(doc.characterId, doc.expiresAt);
      } else {
        // Orphan cleanup: a character no longer linked to this user must not keep
        // serving its old snapshot. Delete BOTH halves.
        await ctx.db.delete(doc._id);
        const cold = coldByCharacter.get(doc.characterId);
        if (cold !== undefined) await ctx.db.delete(cold._id);
      }
    }

    for (const result of args.results) {
      if (!enumerated.has(result.characterId)) continue;
      const expiresAt = await applyBlueprintResult(
        ctx,
        args.userId,
        result,
        byCharacter.get(result.characterId),
        coldByCharacter.get(result.characterId),
        now,
      );
      windowsByCharacter.set(result.characterId, expiresAt);
    }

    await stampSyncSubject(ctx, subject._id, [...windowsByCharacter.values()], args, now);
    // status stays 'running' — the workpool's onComplete owns the lifecycle.
  },
});

type CharacterResult = Infer<typeof characterResultValidator>;

// Upsert one character's blueprints result across the hot meta doc and the cold
// payload doc. The hot doc is ALWAYS written (etags/freshness/error). The cold
// payload is written ONLY when a fresh body arrived AND differs from the stored
// set — a 304/error keeps the existing payload untouched, and an identical fresh
// body is skipped, so the payload view's read set never re-fires for an unchanged
// collection (the SA.5 point; here even the multi-page full-refetch stays quiet).
// An errored read keeps the payload but clears the cache window so the next
// heartbeat re-syncs immediately.
async function applyBlueprintResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existingHot: Doc<'characterBlueprintsSync'> | undefined,
  existingCold: Doc<'characterBlueprintsSyncData'> | undefined,
  now: number,
): Promise<number | null> {
  const refreshed = result.error === null;
  const hotFields = {
    etags: result.etags,
    lastSyncedAt: refreshed ? now : (existingHot?.lastSyncedAt ?? null),
    expiresAt: refreshed ? result.expiresAt : null,
    syncError: result.error,
  };
  if (existingHot !== undefined) {
    await ctx.db.patch(existingHot._id, hotFields);
  } else {
    await ctx.db.insert('characterBlueprintsSync', {
      userId,
      characterId: result.characterId,
      ...hotFields,
    });
  }

  if (result.blueprints !== null) {
    const data = { blueprints: result.blueprints };
    if (existingCold === undefined) {
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId,
        characterId: result.characterId,
        data,
      });
    } else if (!sameBlueprints(existingCold.data.blueprints, result.blueprints)) {
      await ctx.db.patch(existingCold._id, { data });
    }
  }

  return hotFields.expiresAt;
}
