import { ConvexError, v } from 'convex/values';
import {
  blankDoor,
  destinationProvenanceOf,
  destinationResolution,
} from '@/data/maps/connection-hallway';
import { isTombstoned } from '@/data/maps/chain-contract';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { requireMapAccessForUser } from './lib/mapAccess';
import { requireLiveConnectionOnMap } from './lib/mapConnectionLookup';
import { emissionFacts, readConnectionsFrom, type EmissionFacts } from './mapJumpReads';
import { upsertLiveDestination } from './mapAuthoringHome';
import { supersedeDyingPairsForEndpoints } from './mapJumpAuthoring';
import { findSystem } from './lib/mapSystemLookup';

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
    const provenance = destinationProvenanceOf(connection.resolution);
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

async function answerAwaitingSignature(
  ctx: MutationCtx,
  source: Doc<'mapConnections'>,
  target: Doc<'mapConnections'>,
): Promise<EmissionFacts> {
  if (source.resolution.kind !== 'awaiting-signature') {
    throw new ConvexError({ code: 'INVALID_REASSOCIATION' });
  }
  const { destinationSystemId, candidates } = source.resolution;
  const offered = candidates.some((candidate) =>
    candidate.connectionId === target._id
    || (candidate.signatureId !== null && candidate.signatureId === target.from.signatureId),
  );
  if (!offered) throw new ConvexError({ code: 'INVALID_SIGNATURE_CHOICE' });
  const origin = await findSystem(ctx, source.mapId, source.fromSystemId);
  if (origin === null || isTombstoned(origin)) {
    throw new ConvexError({ code: 'UNKNOWN_ORIGIN' });
  }
  const [forward, reverse] = await Promise.all([
    readConnectionsFrom(ctx, source.mapId, source.fromSystemId, 'pair'),
    readConnectionsFrom(ctx, source.mapId, destinationSystemId, 'pair'),
  ]);
  if ([...forward, ...reverse].some((row) =>
    !isTombstoned(row)
    && ((row.fromSystemId === source.fromSystemId && row.toSystemId === destinationSystemId)
      || (row.fromSystemId === destinationSystemId && row.toSystemId === source.fromSystemId)),
  )) {
    throw new ConvexError({ code: 'DESTINATION_ALREADY_CONNECTED' });
  }
  await upsertLiveDestination(ctx, source.mapId, destinationSystemId);
  const moved = {
    toSystemId: destinationSystemId,
    resolution: destinationResolution('human'),
    observedMassKg: source.observedMassKg,
    observationKey: target.observationKey ?? source.observationKey,
  };
  await ctx.db.patch(target._id, moved);
  await ctx.db.delete(source._id);
  await supersedeDyingPairsForEndpoints(
    ctx,
    source.mapId,
    source.fromSystemId,
    destinationSystemId,
    target._id,
    Date.now(),
  );
  return emissionFacts({ ...target, ...moved });
}

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
    if (
      (source.toSystemId === null && source.resolution.kind !== 'awaiting-signature')
      || target.toSystemId !== null
      || target.resolution.kind === 'awaiting-signature'
    ) {
      throw new ConvexError({ code: 'INVALID_REASSOCIATION' });
    }
    if (source.fromSystemId !== target.fromSystemId) {
      throw new ConvexError({ code: 'DIFFERENT_ORIGIN' });
    }
    if (
      target.observedMassKg !== undefined
      || target.observedMassAtStateKg !== undefined
    ) {
      throw new ConvexError({ code: 'TARGET_HAS_JUMP_FACTS' });
    }

    if (source.resolution.kind === 'awaiting-signature') {
      return await answerAwaitingSignature(ctx, source, target);
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
      observationKey: target.observationKey ?? source.observationKey,
    };
    await ctx.db.patch(target._id, moved);
    await ctx.db.patch(source._id, {
      toSystemId: null,
      to: clearedTo,
      resolution: { kind: 'open' as const },
      observedMassKg: undefined,
      observedMassAtStateKg: undefined,
      observationKey: target.observationKey === undefined ? undefined : source.observationKey,
    });
    const facts: EmissionFacts = emissionFacts({ ...target, ...moved });
    return facts;
  },
});
