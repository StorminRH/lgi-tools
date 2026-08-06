// Shared ungated connection lookup for already-authorized Convex mutations.
import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isTombstoned } from '@/data/maps/chain-contract';

/** Loads one connection owned by the named map after the caller authorizes. */
export async function requireConnectionOnMap(
  ctx: QueryCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  const connection = await ctx.db.get(connectionId);
  if (connection === null || connection.mapId !== mapId) {
    throw new ConvexError({
      code: 'UNKNOWN_CONNECTION',
      detail: `No connection ${connectionId} on map ${mapId}.`,
    });
  }
  return connection;
}

/**
 * Loads one live connection owned by the named map. Callers must authorize
 * before invoking this helper; keeping identity outside makes it reusable by
 * both JWT-gated and service-door-gated mutations without a second access rule.
 */
export async function requireLiveConnectionOnMap(
  ctx: QueryCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  const connection = await requireConnectionOnMap(ctx, mapId, connectionId);
  if (isTombstoned(connection)) {
    throw new ConvexError({
      code: 'CONNECTION_TOMBSTONED',
      detail: `Connection ${connectionId} is tombstoned.`,
    });
  }
  return connection;
}
