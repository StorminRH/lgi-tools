import { ConvexError, v } from 'convex/values';
import {
  chainTombstoneStamps,
  connectionRemovedTombstone,
  isTombstoned,
} from '@/data/maps/chain-contract';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, type MutationCtx } from './_generated/server';
import { takeIndexedOrThrow } from './lib/indexedQuery';
import { requireMapAccess } from './lib/mapAccess';
import { requireConnectionOnMap } from './lib/mapConnectionLookup';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';
import { deleteUnclaimedRespawn } from './lib/mapStaticClaim';
import { eventActor, writeMapEvent } from './mapAuthoringEvents';
import { ensureStaticPlaceholders } from './mapStatics';

const LIVE_CONNECTION_SCAN_CAP = 32;

async function gatedConnection(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  await requireMapAccess(ctx, mapId, 'edit');
  return requireConnectionOnMap(ctx, mapId, connectionId);
}

async function gatedSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapSystems'>> {
  await requireMapAccess(ctx, mapId, 'edit');
  requireSystemId(systemId);
  const system = await findSystem(ctx, mapId, systemId);
  if (system === null) {
    throw new ConvexError({
      code: 'UNKNOWN_SYSTEM',
      detail: `System ${systemId} is not on map ${mapId}.`,
    });
  }
  return system;
}

async function readIncidentConnections(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapConnections'>[]> {
  const incidentBound = {
    code: 'MAP_TOO_LARGE',
    detail: `Map ${mapId} exceeds the ${LIVE_CONNECTION_SCAN_CAP}-connection liveness proof bound for system ${systemId}.`,
  };
  const takeIncident = (
    index: 'by_map_from' | 'by_map_to',
    field: 'fromSystemId' | 'toSystemId',
  ) =>
    takeIndexedOrThrow(
      ctx.db
        .query('mapConnections')
        .withIndex(index, (q) => q.eq('mapId', mapId).eq(field, systemId)),
      LIVE_CONNECTION_SCAN_CAP,
      incidentBound,
    );
  const fromRows = await takeIncident('by_map_from', 'fromSystemId');
  const toRows = await takeIncident('by_map_to', 'toSystemId');
  return [...new Map([...fromRows, ...toRows].map((row) => [row._id, row])).values()];
}

async function stampSystemTombstone(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<{ tombstoned: true }> {
  const system = await gatedSystem(ctx, mapId, systemId);
  if (isTombstoned(system)) return { tombstoned: true };
  const incidentConnections = await readIncidentConnections(ctx, mapId, systemId);
  if (incidentConnections.some((connection) => !isTombstoned(connection))) {
    throw new ConvexError({
      code: 'SYSTEM_IN_USE',
      detail: `System ${systemId} still has a live connection on map ${mapId}.`,
    });
  }
  const stamps = chainTombstoneStamps(Date.now());
  await ctx.db.patch(system._id, stamps);
  for (const connection of incidentConnections) {
    if (
      connection.tombstone.kind === 'removed'
      && connection.tombstone.purgeAfter !== stamps.purgeAfter
    ) {
      await ctx.db.patch(connection._id, {
        tombstone: { ...connection.tombstone, purgeAfter: stamps.purgeAfter },
      });
    }
  }
  return { tombstoned: true };
}

async function stampConnectionTombstone(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<{ tombstoned: true }> {
  const connection = await gatedConnection(ctx, mapId, connectionId);
  if (isTombstoned(connection)) return { tombstoned: true };
  await ctx.db.patch(connectionId, connectionRemovedTombstone(Date.now()));
  return { tombstoned: true };
}

async function clearSystemTombstone(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<{ restored: true }> {
  const system = await gatedSystem(ctx, mapId, systemId);
  if (!isTombstoned(system)) return { restored: true };
  await ctx.db.patch(system._id, { deletedAt: null, purgeAfter: null });
  await ensureStaticPlaceholders(ctx, mapId, systemId);
  return { restored: true };
}

async function requireLiveEndpoint(
  ctx: MutationCtx,
  mapId: string,
  endpointId: number,
): Promise<void> {
  const endpoint = await findSystem(ctx, mapId, endpointId);
  if (endpoint === null || isTombstoned(endpoint)) {
    throw new ConvexError({
      code: 'ENDPOINT_TOMBSTONED',
      detail: `Endpoint system ${endpointId} is missing or tombstoned on map ${mapId}.`,
    });
  }
}

async function clearConnectionTombstone(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<{ restored: true; changed: boolean }> {
  const connection = await gatedConnection(ctx, mapId, connectionId);
  if (!isTombstoned(connection)) return { restored: true, changed: false };
  await requireLiveEndpoint(ctx, mapId, connection.fromSystemId);
  if (connection.toSystemId !== null) {
    await requireLiveEndpoint(ctx, mapId, connection.toSystemId);
  }
  await deleteUnclaimedRespawn(ctx, connection);
  await ctx.db.patch(connectionId, { tombstone: { kind: 'live' } });
  return { restored: true, changed: true };
}

async function restoreLiveConnection(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
  actor: string,
): Promise<{ restored: true }> {
  const result = await clearConnectionTombstone(ctx, mapId, connectionId);
  if (result.changed) {
    await writeMapEvent(ctx, {
      mapId,
      at: Date.now(),
      kind: 'connection_restored',
      actor,
      payload: { connectionId: String(connectionId) },
    });
  }
  return { restored: true as const };
}

export const tombstoneSystem = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    stampSystemTombstone(ctx, mapId, systemId),
});

export const tombstoneConnection = internalMutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: (ctx, { mapId, connectionId }) =>
    stampConnectionTombstone(ctx, mapId, connectionId),
});

export const restoreSystem = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    clearSystemTombstone(ctx, mapId, systemId),
});

export const restoreConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    return restoreLiveConnection(ctx, mapId, connectionId, await eventActor(ctx));
  },
});
