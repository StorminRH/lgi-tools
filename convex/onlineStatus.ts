// Online-status tracker — the Convex half of the MIGRATE.A canary, the engine's
// keeper consumer through the placement migration.
//
// Canonical shape (mirrors the other trackers): client heartbeat (engine,
// presence + on-view dispatch) → engine scan on the 60s cadence while watched →
// Workpool → onlineStatusSync.syncUser (action, talks to Neon + ESI) →
// applySyncResults (ONE batched mutation, generation-guarded against the engine's
// subject row) → forViewer (reactive query). The client never calls the action
// directly, and no client-posted character id carries authority — the action
// re-enumerates the user's characters server-side on every run.
//
// SINGLE table, no SA.5 hot/cold split (see characterOnline in schema.ts): the
// row carries no per-cycle bookkeeping field, so forViewer subscribes to it
// directly and the apply's no-op-write guard keeps it written only on a real flip.
import { type Infer, v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, query } from './_generated/server';
import { stampSyncSubject } from './lib/characterSync';
import { getSyncSubject } from './lib/subjects';

// The COLD-equivalent viewer wire: the calling user's per-character online flag,
// keyed by character. Its read set is the characterOnline table alone, and the
// apply writes that table ONLY on a genuine online↔offline change, so this query
// re-fires only when a character's online state actually flips — never on a
// per-cycle 304/dispatch/completion (those touch the subject row, which this
// query never reads). A character with no doc yet (unfetched / errored-first /
// not relinked) is simply absent — the portrait shows no dot.
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({ characterId: doc.characterId, online: doc.online })),
    };
  },
});

// The action's read seam: which ETag to replay per character. The row exists iff
// the character holds online data (a fresh 200 wrote it), so the etag-implies-data
// invariant holds by construction — no separate data-presence gate needed (unlike
// skills, whose etag lives on a hot doc split from its cold payload).
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const docs = await ctx.db
      .query('characterOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return docs.map((doc) => ({ characterId: doc.characterId, etag: doc.etag }));
  },
});

// Per-character outcome the action hands back. `online` is null when a 304 said
// "unchanged" (keep the doc's value) or a read errored; the etag is the RESOLVED
// value to store (the action echoes the held etag across a 304/error because
// ESI's 304 does not repeat the ETag header).
const characterResultValidator = v.object({
  characterId: v.number(),
  online: v.union(v.boolean(), v.null()),
  etag: v.union(v.string(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});

type CharacterResult = Infer<typeof characterResultValidator>;

// The run's single batched write. Idempotent (upserts keyed by userId+characterId),
// so a Workpool retry that re-runs the action cannot double-write; the generation
// guard (against the engine's subject row) makes a superseded run's late apply a
// no-op instead of an overwrite.
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
    const subject = await getSyncSubject(ctx.db, 'onlineStatus', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db
      .query('characterOnline')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const byCharacter = new Map(docs.map((doc) => [doc.characterId, doc]));
    const now = Date.now();
    const enumerated = new Set(args.enumeratedCharacterIds);

    // Orphan cleanup: a character no longer linked to this user (unlinked, or
    // reassigned to another pilot) must not keep serving its old online state.
    for (const doc of docs) {
      if (!enumerated.has(doc.characterId)) await ctx.db.delete(doc._id);
    }

    // The post-apply cache window per result, fed to the subject stamp so the
    // next due time respects ESI's Expires (an errored character contributes null
    // → minCacheWindow poisons the subject to stale-now, the #95 meaning, so the
    // next heartbeat re-syncs — paced at the cadence floor, never a tight loop).
    const windowsByCharacter = new Map<number, number | null>();
    for (const result of args.results) {
      if (!enumerated.has(result.characterId)) continue;
      const window = await applyOnlineResult(ctx, args.userId, result, byCharacter.get(result.characterId));
      windowsByCharacter.set(result.characterId, window);
    }

    await stampSyncSubject(ctx, subject._id, [...windowsByCharacter.values()], args, now);
    // status stays 'running' here — the workpool's onComplete owns the lifecycle.
  },
});

// Upsert one character's online state. The no-op-write discipline: a 304 or an
// errored read writes NOTHING (keeps the last-known doc), and a fresh body writes
// only when `online`/`etag` actually differ — so the row (which forViewer
// subscribes to) is written ONLY on a genuine online↔offline change. Returns the
// resulting cache window for the subject stamp.
async function applyOnlineResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existing: Doc<'characterOnline'> | undefined,
): Promise<number | null> {
  // Errored read: keep the last-known state and clear the window so the next
  // mount/visible heartbeat re-syncs immediately.
  if (result.error !== null) return null;
  // 304: online unchanged; the held etag is still valid, nothing to write.
  if (result.online === null) return result.expiresAt;
  // Fresh 200: a genuine flip for this endpoint (its body changes only at a
  // login/logout). Insert when absent; otherwise patch only if it actually
  // changed — the guard keeps forViewer quiet if ESI ever re-sends an unchanged
  // body with a rotated etag.
  if (existing === undefined) {
    await ctx.db.insert('characterOnline', {
      userId,
      characterId: result.characterId,
      online: result.online,
      etag: result.etag,
    });
  } else if (existing.online !== result.online || existing.etag !== result.etag) {
    await ctx.db.patch(existing._id, { online: result.online, etag: result.etag });
  }
  return result.expiresAt;
}
