import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import { FIXTURE_CONNECTION_SCAN_LIMIT } from './lib/mapConnectionLookup';
import { findSystem } from './lib/mapSystemLookup';

async function findReferencingConnection(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
) {
  const connections = await ctx.db
    .query('mapConnections')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(FIXTURE_CONNECTION_SCAN_LIMIT + 1);

  if (connections.length > FIXTURE_CONNECTION_SCAN_LIMIT) {
    throw new ConvexError({
      code: 'FIXTURE_MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${FIXTURE_CONNECTION_SCAN_LIMIT}-connection fixture removal bound.`,
    });
  }

  return (
    connections.find(
      (connection) =>
        connection.fromSystemId === systemId || connection.toSystemId === systemId,
    ) ?? null
  );
}

export const removeSystemFixture = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }): Promise<'removed' | 'unchanged'> => {
    const existing = await findSystem(ctx, mapId, systemId);
    if (existing === null) return 'unchanged';

    const referencing = await findReferencingConnection(ctx, mapId, systemId);
    if (referencing !== null) {
      throw new ConvexError({
        code: 'SYSTEM_IN_USE',
        detail: `System ${systemId} still has a connection on map ${mapId}.`,
      });
    }

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

    const referencing = await findReferencingConnection(ctx, mapId, systemId);
    if (referencing !== null) {
      throw new ConvexError({
        code: 'SYSTEM_IN_USE',
        detail: `System ${systemId} still has a connection on map ${mapId}.`,
      });
    }

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
