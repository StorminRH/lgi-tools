import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import { readTouchingConnections } from './lib/mapConnectionLookup';
import { findSystem } from './lib/mapSystemLookup';

async function requireUnusedSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<void> {
  const doors = await readTouchingConnections(ctx, mapId, systemId);
  if (doors.length > 0) {
    throw new ConvexError({
      code: 'SYSTEM_IN_USE',
      detail: `System ${systemId} still has a connection on map ${mapId}.`,
    });
  }
}

export const removeSystemFixture = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }): Promise<'removed' | 'unchanged'> => {
    const existing = await findSystem(ctx, mapId, systemId);
    if (existing === null) return 'unchanged';

    await requireUnusedSystem(ctx, mapId, systemId);
    await ctx.db.delete(existing._id);
    return 'removed';
  },
});

export const collapseJumpFixture = internalMutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    systemId: v.number(),
  },
  handler: async (
    ctx,
    { mapId, connectionId, systemId },
  ): Promise<'removed' | 'unchanged'> => {
    const connection = await ctx.db.get(connectionId);
    if (connection !== null) {
      if (
        connection.mapId !== mapId
        || (connection.fromSystemId !== systemId && connection.toSystemId !== systemId)
      ) {
        throw new ConvexError({
          code: 'WRONG_CONNECTION',
          detail: `Connection ${connectionId} does not join system ${systemId} on map ${mapId}.`,
        });
      }
      await ctx.db.delete(connectionId);
    }

    const system = await findSystem(ctx, mapId, systemId);
    if (system === null) return connection === null ? 'unchanged' : 'removed';

    await requireUnusedSystem(ctx, mapId, systemId);
    await ctx.db.delete(system._id);
    return 'removed';
  },
});

export const removeConnectionFixture = internalMutation({
  args: { connectionId: v.id('mapConnections') },
  handler: async (ctx, { connectionId }): Promise<'removed' | 'unchanged'> => {
    const existing = await ctx.db.get(connectionId);
    if (existing === null) return 'unchanged';

    await ctx.db.delete(connectionId);
    return 'removed';
  },
});
