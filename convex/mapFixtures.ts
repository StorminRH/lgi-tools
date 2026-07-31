import { v } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import {
  connectionMassStateValidator,
  isPositiveSafeInteger,
  mergeSignatureKnowledge,
  normalizeSignatureKnowledge,
  noteTargetKindValidator,
  nullableWormholeSizeValidator,
  validateConnectionInput,
} from './lib/mapEntityContracts';
import { requireMapAccess } from './lib/mapAccess';
import { purgeExpiredSignatureTombstones as purgeExpired } from './lib/mapSignatureCleanup';

/** Fixed target page size for one collection-scoped fixture read. */
export const MAP_FIXTURE_PAGE_SIZE = 32;

/** Minimum elapsed server time before signature activity is patched. */
export const MAP_SIGNATURE_ACTIVITY_STALE_MS = 60_000;

const collectionValidator = v.union(
  v.literal('systems'),
  v.literal('connections'),
  v.literal('signatures'),
  v.literal('notes'),
);
const nullableString = v.union(v.string(), v.null());
const signatureKnowledgeValidator = v.object({
  group: nullableString,
  typeName: nullableString,
  wormholeTypeCode: nullableString,
});

/**
 * Reads exactly one independently paginated map collection after authorization.
 * The collection discriminator keeps every execution to one indexed paginate.
 */
export const readMapCollection = query({
  args: {
    mapId: v.string(),
    collection: collectionValidator,
    cursor: nullableString,
  },
  handler: async (ctx, args) => {
    await requireMapAccess(ctx, args.mapId, 'view');
    const pagination = {
      cursor: args.cursor,
      numItems: MAP_FIXTURE_PAGE_SIZE,
    };
    switch (args.collection) {
      case 'systems':
        return ctx.db
          .query('mapSystems')
          .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
          .paginate(pagination);
      case 'connections':
        return ctx.db
          .query('mapConnections')
          .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
          .paginate(pagination);
      case 'signatures':
        return ctx.db
          .query('mapSignatures')
          .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
          .paginate(pagination);
      case 'notes':
        return ctx.db
          .query('mapNotes')
          .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
          .paginate(pagination);
    }
  },
});

/** Atomically inserts one map/system identity or returns its existing document. */
export const upsertSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, args) => {
    await requireMapAccess(ctx, args.mapId, 'edit');
    if (!isPositiveSafeInteger(args.systemId)) {
      throw new Error('System ID must be a positive safe integer.');
    }
    const existing = await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) =>
        q.eq('mapId', args.mapId).eq('systemId', args.systemId),
      )
      .unique();
    if (existing !== null) return existing._id;
    return ctx.db.insert('mapSystems', args);
  },
});

/** Inserts a validated same-map connection for fixture-backed contract proof. */
export const insertConnectionFixture = internalMutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
    wormholeTypeCode: nullableString,
    massState: connectionMassStateValidator,
    shipSize: nullableWormholeSizeValidator,
    eolAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    validateConnectionInput(args);
    const [from, to] = await Promise.all([
      findSystem(ctx, args.mapId, args.fromSystemId),
      findSystem(ctx, args.mapId, args.toSystemId),
    ]);
    if (from === null || to === null) {
      throw new Error('Connection endpoints must exist in the same map.');
    }
    return ctx.db.insert('mapConnections', args);
  },
});

/** Inserts a note only when its typed target belongs to the same map. */
export const insertNoteFixture = internalMutation({
  args: {
    mapId: v.string(),
    targetKind: noteTargetKindValidator,
    targetId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.body.trim().length === 0) throw new Error('Note body is required.');
    await requireSameMapNoteTarget(ctx, args);
    return ctx.db.insert('mapNotes', args);
  },
});

/**
 * Inserts or monotonically enriches one observed signature and separately
 * stale-gates its activity. Omitted signatures are never enumerated or changed.
 */
export const upsertSignatureObservation = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    knowledge: signatureKnowledgeValidator,
  },
  handler: async (ctx, args) => {
    if (!isPositiveSafeInteger(args.systemId)) {
      throw new Error('System ID must be a positive safe integer.');
    }
    if ((await findSystem(ctx, args.mapId, args.systemId)) === null) {
      throw new Error('Signature system must exist in the same map.');
    }
    const signatureId = normalizeSignatureId(args.signatureId);
    const knowledge = normalizeSignatureKnowledge(args.knowledge);
    const existing = await findSignature(
      ctx,
      args.mapId,
      args.systemId,
      signatureId,
    );
    if (existing === null) {
      const signatureDocId = await ctx.db.insert('mapSignatures', {
        mapId: args.mapId,
        systemId: args.systemId,
        signatureId,
        ...knowledge,
        deletedAt: null,
        purgeAfter: null,
      });
      await recordActivity(ctx, args.mapId, args.systemId, signatureId, Date.now());
      return { status: 'inserted' as const, signatureDocId };
    }
    if (existing.deletedAt !== null) {
      return { status: 'tombstoned' as const, signatureDocId: existing._id };
    }
    const merge = mergeSignatureKnowledge(existing, knowledge);
    if (merge.status === 'enriched') {
      await ctx.db.patch(existing._id, merge.knowledge);
    }
    await recordActivity(ctx, args.mapId, args.systemId, signatureId, Date.now());
    return { status: merge.status, signatureDocId: existing._id };
  },
});

/** Sets or clears a reversible signature tombstone without copying its payload. */
export const setSignatureTombstone = internalMutation({
  args: {
    signatureDocId: v.id('mapSignatures'),
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    validateTombstone(args.deletedAt, args.purgeAfter);
    const signature = await ctx.db.get(args.signatureDocId);
    if (signature === null) throw new Error('Signature does not exist.');
    await ctx.db.patch(signature._id, {
      deletedAt: args.deletedAt,
      purgeAfter: args.purgeAfter,
    });
    if (args.deletedAt !== null) {
      const activity = await findActivity(
        ctx,
        signature.mapId,
        signature.systemId,
        signature.signatureId,
      );
      if (activity !== null) await ctx.db.delete(activity._id);
    }
    return signature._id;
  },
});

/** Stale-gates last-seen bookkeeping without writing the signature payload. */
export const recordSignatureSeen = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
  },
  handler: async (ctx, args) => {
    const signatureId = normalizeSignatureId(args.signatureId);
    const signature = await findSignature(
      ctx,
      args.mapId,
      args.systemId,
      signatureId,
    );
    if (signature === null || signature.deletedAt !== null) {
      return { status: 'ignored' as const };
    }
    return recordActivity(
      ctx,
      args.mapId,
      args.systemId,
      signatureId,
      Date.now(),
    );
  },
});

/** Runs one bounded expiry-only signature tombstone cleanup batch. */
export const purgeExpiredSignatureTombstones = internalMutation({
  args: { now: v.number() },
  handler: (ctx, { now }) => {
    if (!Number.isFinite(now)) throw new Error('Cleanup time must be finite.');
    return purgeExpired(ctx, now);
  },
});

async function findSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
) {
  return ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) =>
      q.eq('mapId', mapId).eq('systemId', systemId),
    )
    .unique();
}

async function findSignature(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureId: string,
) {
  return ctx.db
    .query('mapSignatures')
    .withIndex('by_map_signature', (q) =>
      q
        .eq('mapId', mapId)
        .eq('systemId', systemId)
        .eq('signatureId', signatureId),
    )
    .unique();
}

async function findActivity(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureId: string,
) {
  return ctx.db
    .query('mapSignatureActivity')
    .withIndex('by_map_signature', (q) =>
      q
        .eq('mapId', mapId)
        .eq('systemId', systemId)
        .eq('signatureId', signatureId),
    )
    .unique();
}

async function recordActivity(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureId: string,
  observedAt: number,
) {
  const activity = await findActivity(ctx, mapId, systemId, signatureId);
  if (activity === null) {
    await ctx.db.insert('mapSignatureActivity', {
      mapId,
      systemId,
      signatureId,
      lastSeenAt: observedAt,
    });
    return { status: 'inserted' as const };
  }
  if (
    observedAt - activity.lastSeenAt <
    MAP_SIGNATURE_ACTIVITY_STALE_MS
  ) {
    return { status: 'unchanged' as const };
  }
  await ctx.db.patch(activity._id, { lastSeenAt: observedAt });
  return { status: 'updated' as const };
}

function normalizeSignatureId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) throw new Error('Signature ID is required.');
  return normalized;
}

function validateTombstone(
  deletedAt: number | null,
  purgeAfter: number | null,
): void {
  if ((deletedAt === null) !== (purgeAfter === null)) {
    throw new Error('Tombstone timestamps must both be null or both be set.');
  }
  if (deletedAt === null || purgeAfter === null) return;
  if (
    !Number.isFinite(deletedAt) ||
    !Number.isFinite(purgeAfter) ||
    purgeAfter <= deletedAt
  ) {
    throw new Error('Tombstone expiry must be finite and after deletion.');
  }
}

async function requireSameMapNoteTarget(
  ctx: MutationCtx,
  args: {
    mapId: string;
    targetKind: 'map' | 'system' | 'signature';
    targetId: string;
  },
): Promise<void> {
  if (args.targetKind === 'map') {
    if (args.targetId !== args.mapId) {
      throw new Error('Map note target must equal its map ID.');
    }
    return;
  }
  const table =
    args.targetKind === 'system' ? 'mapSystems' : 'mapSignatures';
  const targetId = ctx.db.normalizeId(table, args.targetId);
  const target = targetId === null ? null : await ctx.db.get(targetId);
  if (target === null || target.mapId !== args.mapId) {
    throw new Error('Note target must exist in the same map.');
  }
}
