import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isTombstoned } from '@/data/maps/chain-contract';

export const MAP_CONNECTION_SIGNATURE_SCAN_LIMIT = 128;

export type ConnectionScanOptions = {
  readonly limit?: number;
  readonly errorCode?: string;
  readonly errorDetail?: string;
};

async function readIndexedConnections(
  ctx: QueryCtx,
  index: 'by_map_from' | 'by_map_to',
  mapId: string,
  systemId: number,
  field: 'fromSystemId' | 'toSystemId',
  boundLabel: string,
  options: ConnectionScanOptions,
): Promise<Doc<'mapConnections'>[]> {
  const limit = options.limit ?? MAP_CONNECTION_SIGNATURE_SCAN_LIMIT;
  const rows = await ctx.db
    .query('mapConnections')
    .withIndex(index, (q) => q.eq('mapId', mapId).eq(field, systemId))
    .take(limit + 1);
  if (rows.length > limit) {
    throw new ConvexError({
      code: options.errorCode ?? 'MAP_CONNECTION_SCAN_LIMIT',
      detail: options.errorDetail
        ?? `Map ${mapId} exceeds the ${limit}-connection ${boundLabel} scan bound.`,
    });
  }
  return rows;
}

export async function readOriginConnections(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
  options: ConnectionScanOptions = {},
): Promise<Doc<'mapConnections'>[]> {
  return await readIndexedConnections(
    ctx,
    'by_map_from',
    mapId,
    fromSystemId,
    'fromSystemId',
    'origin',
    options,
  );
}

export async function readInboundConnections(
  ctx: QueryCtx,
  mapId: string,
  toSystemId: number,
  options: ConnectionScanOptions = {},
): Promise<Doc<'mapConnections'>[]> {
  return await readIndexedConnections(
    ctx,
    'by_map_to',
    mapId,
    toSystemId,
    'toSystemId',
    'destination',
    options,
  );
}

export async function readTouchingConnections(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
  options: ConnectionScanOptions = {},
): Promise<Doc<'mapConnections'>[]> {
  const [origin, inbound] = await Promise.all([
    readOriginConnections(ctx, mapId, systemId, options),
    readInboundConnections(ctx, mapId, systemId, options),
  ]);
  return [...origin, ...inbound];
}

export async function hasTouchingConnection(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<boolean> {
  const origin = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_from', (q) => q.eq('mapId', mapId).eq('fromSystemId', systemId))
    .first();
  if (origin !== null) return true;
  const inbound = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_to', (q) => q.eq('mapId', mapId).eq('toSystemId', systemId))
    .first();
  return inbound !== null;
}

export function connectionOwnsLocalSignature(
  row: Doc<'mapConnections'>,
  systemId: number,
  signatureId: string,
): boolean {
  return (
    (row.fromSystemId === systemId && row.from.signatureId === signatureId)
    || (row.toSystemId === systemId && row.to.signatureId === signatureId)
  );
}

function preferLiveConnection(
  rows: readonly Doc<'mapConnections'>[],
): Doc<'mapConnections'> | undefined {
  return rows.find((row) => !isTombstoned(row)) ?? rows[0];
}

export function findConnectionForSignature(
  rows: readonly Doc<'mapConnections'>[],
  signatureId: string,
): Doc<'mapConnections'> | undefined {
  return rows.find((row) => row.from.signatureId === signatureId);
}

export function findLocalSignatureConnection(
  rows: readonly Doc<'mapConnections'>[],
  systemId: number,
  signatureId: string,
): Doc<'mapConnections'> | undefined {
  return preferLiveConnection(
    rows.filter((row) => connectionOwnsLocalSignature(row, systemId, signatureId)),
  );
}

export function findPasteConnection(
  rows: readonly Doc<'mapConnections'>[],
  systemId: number,
  signatureId: string,
): Doc<'mapConnections'> | undefined {
  const matches = rows.filter((row) =>
    connectionOwnsLocalSignature(row, systemId, signatureId),
  );
  const live = matches.filter((row) => !isTombstoned(row));
  const resolved = live.find((row) => row.toSystemId !== null);
  if (resolved !== undefined) return resolved;
  if (live[0] !== undefined) return live[0];
  return matches.find((row) => row.toSystemId === null);
}

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
