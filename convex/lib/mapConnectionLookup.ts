// Shared ungated connection lookup for already-authorized Convex mutations.
import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isTombstoned } from '@/data/maps/chain-contract';

/** Maximum origin-side connections one scan transaction may inspect. */
export const MAP_CONNECTION_SIGNATURE_SCAN_LIMIT = 128;

/** Reads one mapped system's bounded origin-side connection set. */
export async function readOriginConnections(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
  options: {
    readonly limit?: number;
    readonly errorCode?: string;
    readonly errorDetail?: string;
  } = {},
): Promise<Doc<'mapConnections'>[]> {
  const limit = options.limit ?? MAP_CONNECTION_SIGNATURE_SCAN_LIMIT;
  const rows = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_from', (q) => q.eq('mapId', mapId).eq('fromSystemId', fromSystemId))
    .take(limit + 1);
  if (rows.length > limit) {
    throw new ConvexError({
      code: options.errorCode ?? 'MAP_CONNECTION_SCAN_LIMIT',
      detail: options.errorDetail
        ?? `Map ${mapId} exceeds the ${limit}-connection origin scan bound.`,
    });
  }
  return rows;
}

/** Finds the durable connection carrying one origin-side signature identity. */
export function findConnectionForSignature(
  rows: readonly Doc<'mapConnections'>[],
  signatureId: string,
): Doc<'mapConnections'> | undefined {
  return rows.find((row) => row.fromSignatureId === signatureId);
}

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
