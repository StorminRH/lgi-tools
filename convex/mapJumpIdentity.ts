import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { requireMapAccessForUser } from './lib/mapAccess';
import { requireLiveConnectionOnMap } from './lib/mapConnectionLookup';
import { emissionFacts } from './mapJumpReads';

export const confirmJumpIdentity = internalMutation({
  args: {
    userId: v.string(),
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
  },
  handler: async (ctx, { userId, mapId, connectionId }) => {
    await requireMapAccessForUser(ctx, mapId, userId, 'edit');
    const connection = await requireLiveConnectionOnMap(ctx, mapId, connectionId);
    if (connection.toSystemId === null) {
      throw new ConvexError({ code: 'UNRESOLVED_CONNECTION' });
    }
    if (
      connection.destinationProvenance !== 'assumed'
      && connection.destinationProvenance !== 'confirmed'
    ) {
      throw new ConvexError({ code: 'INVALID_CONFIRMATION' });
    }
    if (
      connection.destinationProvenance !== 'confirmed'
      || connection.pendingCandidates !== undefined
      || connection.pendingResolutionCharacterId !== undefined
    ) {
      await ctx.db.patch(connectionId, {
        destinationProvenance: 'confirmed',
        pendingCandidates: undefined,
        pendingResolutionCharacterId: undefined,
      });
    }
    return emissionFacts({
      ...connection,
      destinationProvenance: 'confirmed',
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    });
  },
});

export const reassociateJumpDestination = internalMutation({
  args: {
    userId: v.string(),
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    targetConnectionId: v.id('mapConnections'),
  },
  handler: async (
    ctx,
    { userId, mapId, connectionId, targetConnectionId },
  ) => {
    await requireMapAccessForUser(ctx, mapId, userId, 'edit');
    if (connectionId === targetConnectionId) {
      throw new ConvexError({ code: 'SAME_CONNECTION' });
    }
    const source = await requireLiveConnectionOnMap(ctx, mapId, connectionId);
    const target = await requireLiveConnectionOnMap(ctx, mapId, targetConnectionId);
    if (source.toSystemId === null || target.toSystemId !== null) {
      throw new ConvexError({ code: 'INVALID_REASSOCIATION' });
    }
    if (source.fromSystemId !== target.fromSystemId) {
      throw new ConvexError({ code: 'DIFFERENT_ORIGIN' });
    }
    if (
      target.observedMassKg !== undefined
      || target.observedMassAtStateKg !== undefined
      || target.observationKey !== undefined
    ) {
      throw new ConvexError({ code: 'TARGET_HAS_JUMP_FACTS' });
    }

    const moved = {
      toSystemId: source.toSystemId,
      toSignatureId: source.toSignatureId,
      toDestinationHint: source.toDestinationHint,
      destinationProvenance: 'human' as const,
      observedMassKg: source.observedMassKg,
      observedMassAtStateKg: source.observedMassAtStateKg,
      observationKey: source.observationKey,
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    };
    await ctx.db.patch(target._id, moved);
    await ctx.db.patch(source._id, {
      toSystemId: null,
      toSignatureId: undefined,
      toDestinationHint: undefined,
      destinationProvenance: undefined,
      observedMassKg: undefined,
      observedMassAtStateKg: undefined,
      observationKey: undefined,
      pendingCandidates: undefined,
      pendingResolutionCharacterId: undefined,
    });
    return emissionFacts({ ...target, ...moved });
  },
});
