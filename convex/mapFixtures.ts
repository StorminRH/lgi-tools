import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server';
import { requireMapAccess } from './lib/mapAccess';
import {
  isPositiveSafeInteger,
  mergeSignatureKnowledge,
  normalizeSignatureKnowledge,
  validateConnectionInput,
  validateNoteTargetInput,
  validateTombstoneTimestamps,
} from './lib/mapEntityContracts';
import { purgeExpiredSignatureTombstonesCore } from './lib/mapSignatureCleanup';

/** Fixed page size for every public fixture collection read. */
export const MAP_FIXTURE_PAGE_SIZE = 2;

/** Invisible activity-write threshold; does not schedule UI changes. */
export const SIGNATURE_ACTIVITY_STALE_MS = 60_000;

const cursorValidator = v.union(v.string(), v.null());

const knowledgeValidator = v.object({
  group: v.union(v.string(), v.null()),
  typeName: v.union(v.string(), v.null()),
  wormholeTypeCode: v.union(v.string(), v.null()),
});

async function requireSameMapSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Id<'mapSystems'>> {
  if (!isPositiveSafeInteger(systemId)) {
    throw new Error('systemId must be a positive safe integer');
  }
  const system = await ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) =>
      q.eq('mapId', mapId).eq('systemId', systemId),
    )
    .unique();
  if (system === null) {
    throw new Error('system must exist in the same map');
  }
  return system._id;
}

async function deleteSignatureActivityCompanion(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureId: string,
): Promise<void> {
  const activity = await ctx.db
    .query('mapSignatureActivity')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', mapId).eq('systemId', systemId).eq('signatureId', signatureId),
    )
    .unique();
  if (activity !== null) {
    await ctx.db.delete(activity._id);
  }
}

async function writeSignatureActivity(
  ctx: MutationCtx,
  args: {
    readonly mapId: string;
    readonly systemId: number;
    readonly signatureId: string;
    readonly observedAt: number;
  },
): Promise<'inserted' | 'patched' | 'unchanged'> {
  const existing = await ctx.db
    .query('mapSignatureActivity')
    .withIndex('by_map_signature', (q) =>
      q
        .eq('mapId', args.mapId)
        .eq('systemId', args.systemId)
        .eq('signatureId', args.signatureId),
    )
    .unique();

  if (existing === null) {
    await ctx.db.insert('mapSignatureActivity', {
      mapId: args.mapId,
      systemId: args.systemId,
      signatureId: args.signatureId,
      lastSeenAt: args.observedAt,
    });
    return 'inserted';
  }

  if (args.observedAt - existing.lastSeenAt < SIGNATURE_ACTIVITY_STALE_MS) {
    return 'unchanged';
  }

  await ctx.db.patch(existing._id, { lastSeenAt: args.observedAt });
  return 'patched';
}

/**
 * Gate-first fixture read of one map's chain collections. Each collection uses an
 * independent cursor and the fixed page size; activity rows are never read.
 */
export const readMap = query({
  args: {
    mapId: v.string(),
    cursors: v.object({
      systems: cursorValidator,
      connections: cursorValidator,
      signatures: cursorValidator,
      notes: cursorValidator,
    }),
  },
  handler: async (ctx, args) => {
    await requireMapAccess(ctx, args.mapId, 'view');

    const [systems, connections, signatures, notes] = await Promise.all([
      ctx.db
        .query('mapSystems')
        .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
        .paginate({
          cursor: args.cursors.systems,
          numItems: MAP_FIXTURE_PAGE_SIZE,
        }),
      ctx.db
        .query('mapConnections')
        .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
        .paginate({
          cursor: args.cursors.connections,
          numItems: MAP_FIXTURE_PAGE_SIZE,
        }),
      ctx.db
        .query('mapSignatures')
        .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
        .paginate({
          cursor: args.cursors.signatures,
          numItems: MAP_FIXTURE_PAGE_SIZE,
        }),
      ctx.db
        .query('mapNotes')
        .withIndex('by_map', (q) => q.eq('mapId', args.mapId))
        .paginate({
          cursor: args.cursors.notes,
          numItems: MAP_FIXTURE_PAGE_SIZE,
        }),
    ]);

    return {
      systems: {
        page: systems.page,
        continueCursor: systems.continueCursor,
        isDone: systems.isDone,
      },
      connections: {
        page: connections.page,
        continueCursor: connections.continueCursor,
        isDone: connections.isDone,
      },
      signatures: {
        page: signatures.page,
        continueCursor: signatures.continueCursor,
        isDone: signatures.isDone,
      },
      notes: {
        page: notes.page,
        continueCursor: notes.continueCursor,
        isDone: notes.isDone,
      },
    };
  },
});

/**
 * Gate-first fixture upsert for one map system. Repeated/concurrent calls converge
 * on one indexed document and return its ID without patching an existing row.
 */
export const upsertSystem = mutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
  },
  handler: async (ctx, args) => {
    await requireMapAccess(ctx, args.mapId, 'edit');
    if (!isPositiveSafeInteger(args.systemId)) {
      throw new Error('systemId must be a positive safe integer');
    }

    const existing = await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) =>
        q.eq('mapId', args.mapId).eq('systemId', args.systemId),
      )
      .unique();
    if (existing !== null) return existing._id;

    return await ctx.db.insert('mapSystems', {
      mapId: args.mapId,
      systemId: args.systemId,
    });
  },
});

/** Internal fixture: validated connection insert after same-map endpoint proof. */
export const insertConnectionFixture = internalMutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
    wormholeTypeCode: v.union(v.string(), v.null()),
    massState: v.string(),
    shipSize: v.union(v.string(), v.null()),
    eolAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const validated = validateConnectionInput(args);
    await requireSameMapSystem(ctx, validated.mapId, validated.fromSystemId);
    await requireSameMapSystem(ctx, validated.mapId, validated.toSystemId);
    return await ctx.db.insert('mapConnections', validated);
  },
});

/** Internal fixture: validated note insert after typed same-map target proof. */
export const insertNoteFixture = internalMutation({
  args: {
    mapId: v.string(),
    targetKind: v.string(),
    targetId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const validated = validateNoteTargetInput(args);
    if (validated.targetKind === 'system') {
      const system = await ctx.db.get(validated.targetId as Id<'mapSystems'>);
      if (system === null || system.mapId !== validated.mapId) {
        throw new Error('system note target must belong to the same map');
      }
    }
    if (validated.targetKind === 'signature') {
      const signature = await ctx.db.get(
        validated.targetId as Id<'mapSignatures'>,
      );
      if (signature === null || signature.mapId !== validated.mapId) {
        throw new Error('signature note target must belong to the same map');
      }
    }
    return await ctx.db.insert('mapNotes', validated);
  },
});

/**
 * Internal fixture: keyed signature observation through the pure merge contract.
 * Omitted IDs perform no write; tombstoned rows return without mutation.
 */
export const upsertSignatureObservation = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    knowledge: knowledgeValidator,
  },
  handler: async (ctx, args) => {
    await requireSameMapSystem(ctx, args.mapId, args.systemId);
    const signatureId = args.signatureId.trim();
    if (signatureId === '') {
      throw new Error('signatureId must be a non-empty string');
    }
    const knowledge = normalizeSignatureKnowledge(args.knowledge);
    const existing = await ctx.db
      .query('mapSignatures')
      .withIndex('by_map_signature', (q) =>
        q
          .eq('mapId', args.mapId)
          .eq('systemId', args.systemId)
          .eq('signatureId', signatureId),
      )
      .unique();

    if (existing === null) {
      const id = await ctx.db.insert('mapSignatures', {
        mapId: args.mapId,
        systemId: args.systemId,
        signatureId,
        group: knowledge.group,
        typeName: knowledge.typeName,
        wormholeTypeCode: knowledge.wormholeTypeCode,
        deletedAt: null,
        purgeAfter: null,
      });
      await writeSignatureActivity(ctx, {
        mapId: args.mapId,
        systemId: args.systemId,
        signatureId,
        observedAt: Date.now(),
      });
      return { kind: 'inserted' as const, id };
    }

    if (existing.deletedAt !== null) {
      return { kind: 'tombstoned' as const, id: existing._id };
    }

    const merge = mergeSignatureKnowledge(
      {
        group: existing.group,
        typeName: existing.typeName,
        wormholeTypeCode: existing.wormholeTypeCode,
      },
      knowledge,
    );
    if (merge.kind === 'enriched') {
      await ctx.db.patch(existing._id, merge.next);
      return { kind: 'enriched' as const, id: existing._id };
    }
    return { kind: merge.kind, id: existing._id };
  },
});

/** Internal fixture: set or clear a reversible signature tombstone. */
export const setSignatureTombstone = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    validateTombstoneTimestamps(args.deletedAt, args.purgeAfter);
    const signature = await ctx.db
      .query('mapSignatures')
      .withIndex('by_map_signature', (q) =>
        q
          .eq('mapId', args.mapId)
          .eq('systemId', args.systemId)
          .eq('signatureId', args.signatureId),
      )
      .unique();
    if (signature === null) {
      throw new Error('signature not found');
    }

    await ctx.db.patch(signature._id, {
      deletedAt: args.deletedAt,
      purgeAfter: args.purgeAfter,
    });

    if (args.deletedAt !== null) {
      await deleteSignatureActivityCompanion(
        ctx,
        args.mapId,
        args.systemId,
        args.signatureId,
      );
    }

    return signature._id;
  },
});

/**
 * Internal fixture: stale-gated last-seen bookkeeping. Writes only the activity
 * table and never patches a signature payload document.
 */
export const recordSignatureSeen = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const signature = await ctx.db
      .query('mapSignatures')
      .withIndex('by_map_signature', (q) =>
        q
          .eq('mapId', args.mapId)
          .eq('systemId', args.systemId)
          .eq('signatureId', args.signatureId),
      )
      .unique();
    if (signature === null) {
      throw new Error('signature not found');
    }
    if (signature.deletedAt !== null) {
      return { kind: 'tombstoned' as const };
    }
    const kind = await writeSignatureActivity(ctx, args);
    return { kind };
  },
});

/** Internal fixture: bounded expiry-only signature tombstone cleanup. */
export const purgeExpiredSignatureTombstones = internalMutation({
  args: {
    now: v.number(),
  },
  handler: async (ctx, args) => {
    return await purgeExpiredSignatureTombstonesCore(ctx, args.now);
  },
});
