import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import {
  massStateValidator,
  shipSizeValidator,
  validateConnectionInput,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';

export const placeSystemFixture = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }) => {
    requireSystemId(systemId);

    const existing = await findSystem(ctx, mapId, systemId);
    if (existing !== null) return existing._id;
    return await ctx.db.insert('mapSystems', { mapId, systemId });
  },
});

const connectionArgs = {
  mapId: v.string(),
  fromSystemId: v.number(),
  toSystemId: v.number(),
  wormholeTypeCode: wormholeTypeCodeValidator,
  massState: massStateValidator,
  shipSize: shipSizeValidator,
  eolAt: v.union(v.number(), v.null()),
};

export const insertConnectionFixture = internalMutation({
  args: connectionArgs,
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

export const placeJumpFixture = internalMutation({
  args: connectionArgs,
  handler: async (ctx, args) => {
    validateConnectionInput(args);

    const endpoints = [args.fromSystemId, args.toSystemId];
    const existing = await Promise.all(
      endpoints.map((systemId) => findSystem(ctx, args.mapId, systemId)),
    );
    if (existing.every((row) => row === null)) {
      throw new ConvexError({
        code: 'NO_ORIGIN',
        detail: 'A jump needs one endpoint already on the map.',
      });
    }
    for (const [index, systemId] of endpoints.entries()) {
      if (existing[index] === null) {
        await ctx.db.insert('mapSystems', { mapId: args.mapId, systemId });
      }
    }

    return await ctx.db.insert('mapConnections', args);
  },
});
