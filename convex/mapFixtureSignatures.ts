import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import {
  mergeSignatureKnowledge,
  normalizeSignatureKnowledge,
  scannedKindValidator,
  validateSignatureKnowledge,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';
import {
  applySignatureTombstone,
  findMapSignature,
  touchSignatureActivity,
} from './lib/mapSignatures';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';

export const upsertSignatureObservation = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    group: v.union(v.string(), v.null()),
    typeName: v.union(v.string(), v.null()),
    wormholeTypeCode: wormholeTypeCodeValidator,
    kind: v.optional(scannedKindValidator),
    signalPct: v.optional(v.union(v.number(), v.null())),
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
    const existing = await findMapSignature(ctx, key);

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

    if (existing.deletedAt !== null) return { outcome: 'tombstoned' as const };

    const merged = mergeSignatureKnowledge(existing, knowledge);
    if (merged.outcome === 'enriched') await ctx.db.patch(existing._id, merged.patch);
    await touchSignatureActivity(ctx, key);
    return merged;
  },
});

export const recordSignatureSeen = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
  },
  handler: async (ctx, args) => {
    const key = { ...args, signatureId: args.signatureId.trim() };
    const signature = await findMapSignature(ctx, key);
    if (signature === null || signature.deletedAt !== null) return 'unchanged' as const;
    return await touchSignatureActivity(ctx, key);
  },
});

export const setSignatureTombstone = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { deletedAt, purgeAfter, ...key }) => {
    const result = await applySignatureTombstone(ctx, key, deletedAt, purgeAfter);
    return { tombstoned: result.tombstoned };
  },
});
