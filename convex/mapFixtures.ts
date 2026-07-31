// The gate-first fixture surface for the collaborative chain.
//
// This module exists to make the chain's entity, index and authorization contracts EXECUTABLE
// before any production consumer depends on them. No route, client hook or durable writer imports
// it, and none will until Session 4.0.2.2.2 connects the access projection and the real authoring
// surfaces land. Its value is that every invariant below is proven through a named function with
// real validators, rather than through unrestricted test-harness inserts that would prove only that
// the harness works.
//
// Note that "no importer" is not "unreachable": Convex publishes every function in this directory
// to the deployment, so the two PUBLIC handlers are callable by any signed-in client. That is
// exactly why the gate — not obscurity — is the boundary, and why they stay public here: HC-3 and
// SC-3 are premised on proving that a real client-callable surface rejects unauthorized callers.
// Until the projection writer exists, no production map has a claim row, so both deny in practice.
//
// Two rules hold everywhere here:
//   1. requireMapAccess is the FIRST call in every public handler. There is no second access path.
//   2. Volatile bookkeeping never touches a watched payload document — last-seen lives in
//      mapSignatureActivity, and a sub-threshold observation writes nothing at all.
import { ConvexError, v } from 'convex/values';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { requireMapAccess } from './lib/mapAccess';
import {
  isPositiveId,
  massStateValidator,
  mergeSignatureKnowledge,
  noteTargetKindValidator,
  normalizeSignatureKnowledge,
  shipSizeValidator,
  validateConnectionInput,
  validateSignatureKnowledge,
  wormholeTypeCodeValidator,
  type NoteTargetKind,
} from './lib/mapEntityContracts';
import {
  purgeExpiredSignatures,
  SIGNATURE_PURGE_BATCH,
} from './lib/mapSignatureCleanup';

/**
 * Rows returned by one paginated chain read. Fixed and small: a page is a transaction-bounded unit,
 * so a bigger map costs more calls rather than a bigger, riskier single transaction.
 */
export const MAP_FIXTURE_PAGE_SIZE = 25;

/**
 * How much newer an observation must be before it rewrites a signature's last-seen row. The boundary
 * governs INVISIBLE bookkeeping only — nothing user-visible is delayed or scheduled by it, and every
 * activity write stays outside mapSignatures either way.
 */
export const SIGNATURE_ACTIVITY_STALE_MS = 60_000;

const collectionValidator = v.union(
  v.literal('systems'),
  v.literal('connections'),
  v.literal('signatures'),
  v.literal('notes'),
);

const cursorValidator = v.union(v.string(), v.null());

/**
 * Reads one page of one chain collection for one map.
 *
 * Convex permits exactly one `.paginate()` per function execution, so each collection is paged by
 * its own call and callers iterate each cursor independently until its `isDone`. The result is
 * Convex's real page and continuation state, unwrapped — a map larger than one page is explicitly
 * incomplete until that collection's own cursor finishes, never silently truncated.
 *
 * The gate runs first, and the `by_map` index makes the map ID the leading equality constraint, so
 * another map's rows cannot enter this range at all.
 */
export const readMapCollection = query({
  args: {
    mapId: v.string(),
    collection: collectionValidator,
    cursor: cursorValidator,
  },
  handler: async (ctx, { mapId, collection, cursor }) => {
    await requireMapAccess(ctx, mapId, 'view');

    const paginationOpts = { cursor, numItems: MAP_FIXTURE_PAGE_SIZE };
    const byMap = (table: 'mapSystems' | 'mapConnections' | 'mapSignatures' | 'mapNotes') =>
      ctx.db.query(table).withIndex('by_map', (q) => q.eq('mapId', mapId));

    switch (collection) {
      case 'systems':
        return await byMap('mapSystems').paginate(paginationOpts);
      case 'connections':
        return await byMap('mapConnections').paginate(paginationOpts);
      case 'signatures':
        return await byMap('mapSignatures').paginate(paginationOpts);
      case 'notes':
        return await byMap('mapNotes').paginate(paginationOpts);
    }
  },
});

/**
 * Places one system on one map, returning the document ID either way.
 *
 * Singular by construction: the exact `by_map_system` lookup means a repeated call returns the
 * existing ID and performs NO write, so a re-placement cannot invalidate anything watching the map.
 * Two concurrent first-placements read the same index range one of them then writes, so Convex's
 * OCC retry re-runs the loser against the winner's row and it converges on one document.
 */
export const upsertSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    requireSystemId(systemId);

    const existing = await findSystem(ctx, mapId, systemId);
    if (existing !== null) return existing._id;
    return await ctx.db.insert('mapSystems', { mapId, systemId });
  },
});

/** Rejects a system ID that is not a positive safe integer. */
function requireSystemId(systemId: number): void {
  if (!isPositiveId(systemId)) {
    throw new ConvexError({
      code: 'INVALID_SYSTEM_ID',
      detail: 'A system ID must be a positive safe integer.',
    });
  }
}

/** The one indexed map/system lookup shared by every fixture that must prove system ownership. */
function findSystem(ctx: MutationCtx, mapId: string, systemId: number) {
  return ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) => q.eq('mapId', mapId).eq('systemId', systemId))
    .unique();
}

/**
 * Inserts one validated connection. Beyond the pure boundary rules, both endpoints must already
 * exist on THIS map — a connection to an unplaced or foreign system would be an unresolvable
 * reference the read path could never join.
 */
export const insertConnectionFixture = internalMutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
    wormholeTypeCode: wormholeTypeCodeValidator,
    massState: massStateValidator,
    shipSize: shipSizeValidator,
    eolAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    validateConnectionInput(args);

    for (const systemId of [args.fromSystemId, args.toSystemId]) {
      if ((await findSystem(ctx, args.mapId, systemId)) === null) {
        throw new ConvexError({
          code: 'UNKNOWN_ENDPOINT',
          detail: `System ${systemId} is not on map ${args.mapId}.`,
        });
      }
    }

    return await ctx.db.insert('mapConnections', args);
  },
});

/**
 * Inserts one user-authored note against a validated target.
 *
 * A map note repeats its own map ID as the target; a system or signature note is admitted only after
 * one typed `db.get` proves that document exists AND belongs to this map. Without that check a note
 * could be attached across map boundaries, which the gate alone would never catch.
 */
export const insertNoteFixture = internalMutation({
  args: {
    mapId: v.string(),
    targetKind: noteTargetKindValidator,
    targetId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireNoteTarget(ctx, args.mapId, args.targetKind, args.targetId);
    return await ctx.db.insert('mapNotes', args);
  },
});

/** Proves one note target exists and belongs to the same map, rejecting anything else. */
async function requireNoteTarget(
  ctx: MutationCtx,
  mapId: string,
  targetKind: NoteTargetKind,
  targetId: string,
): Promise<void> {
  if (targetKind === 'map') {
    if (targetId !== mapId) {
      throw new ConvexError({
        code: 'INVALID_NOTE_TARGET',
        detail: 'A map note must target its own map.',
      });
    }
    return;
  }

  const table = targetKind === 'system' ? 'mapSystems' : 'mapSignatures';
  const id = ctx.db.normalizeId(table, targetId);
  const target = id === null ? null : await ctx.db.get(id);
  if (target === null || target.mapId !== mapId) {
    throw new ConvexError({
      code: 'INVALID_NOTE_TARGET',
      detail: `No ${targetKind} ${targetId} on map ${mapId}.`,
    });
  }
}

/**
 * Records one signature observation through the single merge contract.
 *
 * An observation is PARTIAL EVIDENCE, never a complete snapshot of a system: this accepts only the
 * rows actually present, keyed by (mapId, systemId, signatureId), so an omitted ID performs no write
 * and can never be read as a despawn. Absence is not evidence — the EVE client can hide filtered
 * results — so nothing here tombstones anything.
 *
 * Returns the merge outcome so a caller can distinguish a real conflict from a no-op.
 */
export const upsertSignatureObservation = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    group: v.union(v.string(), v.null()),
    typeName: v.union(v.string(), v.null()),
    wormholeTypeCode: wormholeTypeCodeValidator,
  },
  handler: async (ctx, args) => {
    requireSystemId(args.systemId);
    if ((await findSystem(ctx, args.mapId, args.systemId)) === null) {
      throw new ConvexError({
        code: 'UNKNOWN_SYSTEM',
        detail: `System ${args.systemId} is not on map ${args.mapId}.`,
      });
    }

    const signatureId = args.signatureId.trim();
    if (signatureId === '') {
      throw new ConvexError({
        code: 'INVALID_SIGNATURE_ID',
        detail: 'A signature ID must be non-empty.',
      });
    }

    const knowledge = normalizeSignatureKnowledge(args);
    validateSignatureKnowledge(knowledge);

    const key = { mapId: args.mapId, systemId: args.systemId, signatureId };
    const existing = await findSignature(ctx, key);

    if (existing === null) {
      await ctx.db.insert('mapSignatures', {
        ...key,
        ...knowledge,
        deletedAt: null,
        purgeAfter: null,
      });
      await touchSignatureActivity(ctx, key);
      return { outcome: 'inserted' as const };
    }

    // A tombstoned signature is deliberately inert: an ordinary observation must not silently
    // resurrect a row a user chose to remove, and it writes no activity either.
    if (existing.deletedAt !== null) return { outcome: 'tombstoned' as const };

    const merged = mergeSignatureKnowledge(existing, knowledge);
    if (merged.outcome === 'enriched') await ctx.db.patch(existing._id, merged.patch);
    await touchSignatureActivity(ctx, key);
    return merged;
  },
});

/** One signature's stable identity within a map. */
interface SignatureKey {
  readonly mapId: string;
  readonly systemId: number;
  readonly signatureId: string;
}

/** The one exact indexed signature lookup; no path scans for missing IDs. */
function findSignature(ctx: MutationCtx, key: SignatureKey) {
  return ctx.db
    .query('mapSignatures')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', key.mapId).eq('systemId', key.systemId).eq('signatureId', key.signatureId),
    )
    .unique();
}

/** The matching activity lookup. Kept separate from the payload read set on purpose. */
function findSignatureActivity(ctx: MutationCtx, key: SignatureKey) {
  return ctx.db
    .query('mapSignatureActivity')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', key.mapId).eq('systemId', key.systemId).eq('signatureId', key.signatureId),
    )
    .unique();
}

/**
 * Stale-gated last-seen bookkeeping, stamped from SERVER time so no caller can backdate or advance
 * it. A first sighting inserts; a later one patches ONLY once the server clock is at least
 * {@link SIGNATURE_ACTIVITY_STALE_MS} past the stored value. A sub-threshold sighting writes nothing
 * at all — no write means no re-read and no fan-out, which is the whole point of keeping this off
 * the payload document.
 */
async function touchSignatureActivity(
  ctx: MutationCtx,
  key: SignatureKey,
): Promise<'inserted' | 'patched' | 'unchanged'> {
  const observedAt = Date.now();
  const existing = await findSignatureActivity(ctx, key);
  if (existing === null) {
    await ctx.db.insert('mapSignatureActivity', { ...key, lastSeenAt: observedAt });
    return 'inserted';
  }
  if (observedAt - existing.lastSeenAt < SIGNATURE_ACTIVITY_STALE_MS) return 'unchanged';
  await ctx.db.patch(existing._id, { lastSeenAt: observedAt });
  return 'patched';
}

/**
 * Records that a signature was seen again, with no claim about its payload. This is the pure
 * bookkeeping path: it can only ever touch mapSignatureActivity.
 *
 * It normalizes and resolves the key exactly as an observation does, and writes only for a live
 * signature. Without that, a sighting after a tombstone would insert an activity row that nothing
 * can ever reclaim — the cleanup owner deliberately performs no companion lookup, so the companion
 * is only ever deleted at tombstone time.
 */
export const recordSignatureSeen = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
  },
  handler: async (ctx, args) => {
    const key = { ...args, signatureId: args.signatureId.trim() };
    const signature = await findSignature(ctx, key);
    if (signature === null || signature.deletedAt !== null) return 'unchanged' as const;
    return await touchSignatureActivity(ctx, key);
  },
});

/**
 * Applies or reverses one signature tombstone.
 *
 * Reversible by design: the payload never leaves the document, so a restore recovers the row
 * unchanged — including its `_id` and `_creationTime` — instead of rebuilding it from a copy that
 * would become a second owner of the same state. Tombstoning deletes the activity companion once,
 * here, which is exactly what lets the bounded cleanup avoid a per-row companion lookup later.
 *
 * The caller-owned undo duration is deliberately not decided here; Session 4.0.4.3.1 owns it.
 */
export const setSignatureTombstone = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { deletedAt, purgeAfter, ...key }) => {
    requireTombstonePair(deletedAt, purgeAfter);

    const signature = await findSignature(ctx, key);
    if (signature === null) {
      throw new ConvexError({
        code: 'UNKNOWN_SIGNATURE',
        detail: `No signature ${key.signatureId} on map ${key.mapId}.`,
      });
    }

    // Already in the target state: write nothing. mapSignatures is a watched payload table, and
    // Convex re-reads a subscription's whole page on ANY write to it — changed or not — so a
    // repeated tombstone or a restore of an active row would fan a no-op out to every scout.
    if (signature.deletedAt === deletedAt && signature.purgeAfter === purgeAfter) {
      return { tombstoned: deletedAt !== null };
    }

    await ctx.db.patch(signature._id, { deletedAt, purgeAfter });

    if (deletedAt !== null) {
      const activity = await findSignatureActivity(ctx, key);
      if (activity !== null) await ctx.db.delete(activity._id);
    }
    return { tombstoned: deletedAt !== null };
  },
});

/** Both tombstone timestamps are absent together, or present together and correctly ordered. */
function requireTombstonePair(deletedAt: number | null, purgeAfter: number | null): void {
  if (deletedAt === null && purgeAfter === null) return;
  const paired =
    deletedAt !== null
    && purgeAfter !== null
    && Number.isFinite(deletedAt)
    && Number.isFinite(purgeAfter)
    && purgeAfter > deletedAt;
  if (!paired) {
    throw new ConvexError({
      code: 'INVALID_TOMBSTONE',
      detail: 'deletedAt and purgeAfter must both be null, or both finite with purgeAfter later.',
    });
  }
}

/**
 * Drains expired signature tombstones in one bounded batch, reporting whether another call is
 * required. Capped at {@link SIGNATURE_PURGE_BATCH}; the cleanup core owns the index range.
 */
export const purgeExpiredSignatureTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredSignatures(ctx, Date.now()),
});

/** Re-exported so the proof suite pins the same cap the cleanup owner enforces. */
export { SIGNATURE_PURGE_BATCH };
