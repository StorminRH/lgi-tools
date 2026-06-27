// Corp owned-blueprints tracker (3.7.5.1) — the per-corp twin of
// convex/characterBlueprints.ts, and the corpIndustryJobs.ts sibling. Run
// lifecycle is the engine's (convex/engine.ts); the corp resolution + dedup +
// corp-keyed apply skeleton are the reusable corp machinery
// (convex/lib/corpSync.ts). Unlike corp industry jobs there is NO time-based
// completion flip (a blueprint has no end_date), so no scheduled markReady.
//
// Canonical shape: client heartbeat (engine, presence + on-view dispatch) →
// engine scan on the dataset's cadence while watched → Workpool →
// corpBlueprintsSync.syncUser (action: resolves the user's characters to the
// corps they can read, dedups by corp, reads each corp's blueprints ONCE) →
// applySyncResults (ONE batched, generation-guarded mutation) → forViewer
// (reactive query).
import { v, type Infer } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, query } from './_generated/server';
import { applyCorpDataset } from './lib/corpSync';
import { sameBlueprints } from './lib/ownedBlueprints';
import { getSyncSubject } from './lib/subjects';
import { ownedBlueprintValidator } from './schema';

// The COLD half of the viewer split: the calling user's owned corp blueprints,
// keyed by corporation. Reads corpBlueprintsSyncData alone, so it re-fires only
// on a genuine payload change. A needs_role corp has a hot row but no cold doc,
// so it isn't here — the merge surfaces it via its hot row.
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('corpBlueprintsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      corporations: docs.map((doc) => ({ corporationId: doc.corporationId, data: doc.data })),
    };
  },
});

// The HOT half of the viewer split: per-corp freshness/error plus the run
// lifecycle. Reads only the small hot meta docs and the subject row, so it
// re-fires every cycle cheaply.
export const runStateForViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('corpBlueprintsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const state = await getSyncSubject(ctx.db, 'corpBlueprints', userId);
    return {
      corporations: docs.map((doc) => ({
        corporationId: doc.corporationId,
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

// The action's read seam: which per-page ETags to replay per corp. Offered only
// when the cold doc holds the payload a 304 would confirm.
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const docs = await ctx.db
      .query('corpBlueprintsSync')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const coldDocs = await ctx.db
      .query('corpBlueprintsSyncData')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const hasData = new Set(coldDocs.map((doc) => doc.corporationId));
    return docs.map((doc) => ({
      corporationId: doc.corporationId,
      etags: hasData.has(doc.corporationId) ? doc.etags : [],
    }));
  },
});

// Per-corp outcome the action hands back. blueprints is null on a 304 (keep the
// doc's copy), an error, or a 'needs_role' corp; etags are the RESOLVED per-page
// values to store (echoed across a 304/error).
const corpResultValidator = v.object({
  corporationId: v.number(),
  blueprints: v.union(v.null(), v.array(ownedBlueprintValidator)),
  etags: v.array(v.string()),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});
type CorpResult = Infer<typeof corpResultValidator>;

// The run's single batched write, delegating the corp-keyed skeleton (generation
// guard → orphan cleanup → upsert → stamp) to applyCorpDataset. `complete` gates
// orphan cleanup — false when the run was cut short before the full corp set was
// known, so nothing is deleted on incomplete information.
export const applySyncResults = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    enumeratedCharacterIds: v.array(v.number()),
    complete: v.boolean(),
    resolvedCorpIds: v.array(v.number()),
    results: v.array(corpResultValidator),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const resultByCorp = new Map(args.results.map((r) => [r.corporationId, r]));
    const existingByCorp = new Map<number, Doc<'corpBlueprintsSync'>>();
    const existingColdByCorp = new Map<number, Doc<'corpBlueprintsSyncData'>>();
    const now = Date.now();

    await applyCorpDataset<Doc<'corpBlueprintsSync'>>(ctx, {
      dataset: 'corpBlueprints',
      userId: args.userId,
      generation: args.generation,
      keepCorpIds: args.complete ? new Set(args.resolvedCorpIds) : null,
      upsertCorpIds: args.results.map((r) => r.corporationId),
      stamp: {
        enumeratedCharacterIds: args.enumeratedCharacterIds,
        lastError: args.lastError,
        rlGroup: args.rlGroup,
        rlLimit: args.rlLimit,
        rlRemaining: args.rlRemaining,
        rlUsed: args.rlUsed,
      },
      now,
      loadExisting: async () => {
        const docs = await ctx.db
          .query('corpBlueprintsSync')
          .withIndex('by_user', (q) => q.eq('userId', args.userId))
          .collect();
        for (const doc of docs) existingByCorp.set(doc.corporationId, doc);
        const coldDocs = await ctx.db
          .query('corpBlueprintsSyncData')
          .withIndex('by_user', (q) => q.eq('userId', args.userId))
          .collect();
        for (const doc of coldDocs) existingColdByCorp.set(doc.corporationId, doc);
        return docs;
      },
      corpIdOf: (doc) => doc.corporationId,
      expiresAtOf: (doc) => doc.expiresAt,
      deleteDoc: async (doc) => {
        await ctx.db.delete(doc._id);
        const cold = existingColdByCorp.get(doc.corporationId);
        if (cold !== undefined) await ctx.db.delete(cold._id);
      },
      upsertOne: (corporationId) => {
        const result = resultByCorp.get(corporationId);
        // upsertCorpIds is derived from results, so a result always exists here.
        if (result === undefined) return Promise.resolve(null);
        return upsertCorpBlueprints(
          ctx,
          args.userId,
          result,
          existingByCorp.get(corporationId),
          existingColdByCorp.get(corporationId),
          now,
        );
      },
    });
  },
});

// Upsert one corp's blueprints across the hot meta doc and the cold payload doc.
// The hot doc is ALWAYS written (etags/freshness/error). The cold payload is
// written ONLY when a fresh body arrived AND differs from the stored set — a
// 304/error keeps it untouched, and an identical fresh body is skipped, so the
// payload view never re-fires for an unchanged collection. A 'needs_role' result
// is the exception: the vending character has lost in-game access, so the cold
// board is DROPPED rather than retained (the merge then shows the needs_role
// state with no stale board behind it). A non-refresh result clears the cache
// window so the next heartbeat re-syncs immediately.
async function upsertCorpBlueprints(
  ctx: MutationCtx,
  userId: string,
  result: CorpResult,
  existingHot: Doc<'corpBlueprintsSync'> | undefined,
  existingCold: Doc<'corpBlueprintsSyncData'> | undefined,
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
    await ctx.db.insert('corpBlueprintsSync', {
      userId,
      corporationId: result.corporationId,
      ...hotFields,
    });
  }

  if (result.blueprints !== null) {
    const data = { blueprints: result.blueprints };
    if (existingCold === undefined) {
      await ctx.db.insert('corpBlueprintsSyncData', {
        userId,
        corporationId: result.corporationId,
        data,
      });
    } else if (!sameBlueprints(existingCold.data.blueprints, result.blueprints)) {
      await ctx.db.patch(existingCold._id, { data });
    }
  } else if (result.error === 'needs_role' && existingCold !== undefined) {
    await ctx.db.delete(existingCold._id);
  }

  return hotFields.expiresAt;
}
