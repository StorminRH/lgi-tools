import { ConvexError, v } from 'convex/values';
import { destinationResolution } from '@/data/maps/connection-hallway';
import { blankDoor } from '@/data/maps/connection-hallway';
import { internalMutation } from './_generated/server';
import { requireMapAccessForUser } from './lib/mapAccess';
import { requireLiveConnectionOnMap } from './lib/mapConnectionLookup';
import { emissionFacts, type EmissionFacts } from './mapJumpReads';

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
    const provenance = connection.resolution.kind === 'open'
      ? null
      : connection.resolution.provenance;
    if (provenance !== 'assumed' && provenance !== 'confirmed') {
      throw new ConvexError({ code: 'INVALID_CONFIRMATION' });
    }
    const confirmed = destinationResolution('confirmed');
    if (
      connection.resolution.kind !== 'destination'
      || connection.resolution.provenance !== 'confirmed'
    ) {
      await ctx.db.patch(connectionId, { resolution: confirmed });
    }
    const facts: EmissionFacts = emissionFacts({
      ...connection,
      resolution: confirmed,
    });
    return facts;
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

    const movedTo = {
      ...target.to,
      signatureId: source.to.signatureId,
      leadsTo: source.to.leadsTo,
    };
    const clearedTo = {
      ...blankDoor(),
      typeCode: source.to.typeCode,
    };
    const moved = {
      toSystemId: source.toSystemId,
      to: movedTo,
      resolution: destinationResolution('human'),
      observedMassKg: source.observedMassKg,
      observedMassAtStateKg: source.observedMassAtStateKg,
      observationKey: source.observationKey,
    };
    await ctx.db.patch(target._id, moved);
    await ctx.db.patch(source._id, {
      toSystemId: null,
      to: clearedTo,
      resolution: { kind: 'open' as const },
      observedMassKg: undefined,
      observedMassAtStateKg: undefined,
      observationKey: undefined,
    });
    const facts: EmissionFacts = emissionFacts({ ...target, ...moved });
    return facts;
  },
});
