// Production gated authoring mutations for the collaborative chain.
//
// Every public handler's FIRST act is requireMapAccess(..., 'edit'). Field
// setters equality-skip before patching so an unchanged pick writes nothing
// and fans out to nobody. Tombstone/restore are plumbing for the later
// collapse pathway — no UI in this module calls them.
import { ConvexError, v } from 'convex/values';
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireMapAccess } from './lib/mapAccess';
import {
  lifeStageValidator,
  massStateValidator,
  shipSizeValidator,
  wormholeTypeCodeValidator,
  type WormholeLifeStage,
} from './lib/mapEntityContracts';
import {
  CHAIN_PURGE_BATCH,
  purgeExpiredChainTombstones as purgeExpiredChainTombstonesCore,
} from './lib/mapChainCleanup';
import {
  beginSystemEdit,
  findSystem,
  requireSystemId,
} from './lib/mapSystemLookup';
import {
  chainTombstoneStamps,
  isTombstoned,
} from '@/data/maps/chain-contract';
import {
  isWormholeTypeCode,
  type ConnectionMassState,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';

/** Fail-closed cap for the per-system live-connection liveness proof. */
export const LIVE_CONNECTION_SCAN_CAP = 32;

/**
 * Fail-closed bound for the empty-map proof in {@link setHomeSystem}. A map
 * with more systems than this (almost all tombstoned) refuses rather than
 * risking a false empty verdict from a truncated scan.
 */
const HOME_SYSTEM_SCAN_CAP = 128;

/** Loads a connection that must belong to the named map. */
async function requireConnectionOnMap(
  ctx: MutationCtx,
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

/** Gate + load a connection for field/tombstone writers. */
async function gatedConnection(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  await requireMapAccess(ctx, mapId, 'edit');
  return requireConnectionOnMap(ctx, mapId, connectionId);
}

/** Gate + load a live (non-tombstoned) connection for field setters. */
async function requireLiveConnection(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<Doc<'mapConnections'>> {
  const connection = await gatedConnection(ctx, mapId, connectionId);
  if (isTombstoned(connection)) {
    throw new ConvexError({
      code: 'CONNECTION_TOMBSTONED',
      detail: `Connection ${connectionId} is tombstoned.`,
    });
  }
  return connection;
}

/** Gate + load a named system document, or throw UNKNOWN_SYSTEM. */
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

/**
 * Whether any LIVE connection still references one system, proven by two
 * exact indexed lookups with a small fail-closed cap each.
 */
async function hasLiveReferencingConnection(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<boolean> {
  const fromRows = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_from', (q) => q.eq('mapId', mapId).eq('fromSystemId', systemId))
    .take(LIVE_CONNECTION_SCAN_CAP + 1);
  if (fromRows.length > LIVE_CONNECTION_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${LIVE_CONNECTION_SCAN_CAP}-connection liveness proof bound for system ${systemId}.`,
    });
  }
  if (fromRows.some((row) => !isTombstoned(row))) return true;

  const toRows = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_to', (q) => q.eq('mapId', mapId).eq('toSystemId', systemId))
    .take(LIVE_CONNECTION_SCAN_CAP + 1);
  if (toRows.length > LIVE_CONNECTION_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${LIVE_CONNECTION_SCAN_CAP}-connection liveness proof bound for system ${systemId}.`,
    });
  }
  return toRows.some((row) => !isTombstoned(row));
}

async function assertMapEmptyOfLiveSystems(
  ctx: MutationCtx,
  mapId: string,
): Promise<void> {
  const existing = await ctx.db
    .query('mapSystems')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(HOME_SYSTEM_SCAN_CAP + 1);
  if (existing.length > HOME_SYSTEM_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${HOME_SYSTEM_SCAN_CAP}-system empty-map proof bound.`,
    });
  }
  if (existing.some((row) => !isTombstoned(row))) {
    throw new ConvexError({
      code: 'MAP_NOT_EMPTY',
      detail: `Map ${mapId} already has a live system.`,
    });
  }
}

/** Inserts the first live system once the empty-map proof passes. */
async function insertHomeSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Id<'mapSystems'>> {
  await beginSystemEdit(ctx, mapId, systemId);
  await assertMapEmptyOfLiveSystems(ctx, mapId);

  const prior = await findSystem(ctx, mapId, systemId);
  if (prior !== null) {
    // A previously tombstoned home of the same id must be restored, not
    // re-inserted — identity-preserving restore is the sanctioned path.
    if (isTombstoned(prior)) {
      throw new ConvexError({
        code: 'DESTINATION_TOMBSTONED',
        detail: `System ${systemId} is tombstoned on map ${mapId}; restore it instead.`,
      });
    }
    return prior._id;
  }

  return await ctx.db.insert('mapSystems', {
    mapId,
    systemId,
    deletedAt: null,
    purgeAfter: null,
  });
}

/**
 * Sets the map's first (home) system. Refuses when any live system already
 * exists so one root holds by construction.
 */
export const setHomeSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) => insertHomeSystem(ctx, mapId, systemId),
});

async function requireLiveOrigin(
  ctx: MutationCtx,
  mapId: string,
  fromSystemId: number,
): Promise<void> {
  const origin = await findSystem(ctx, mapId, fromSystemId);
  if (origin === null || isTombstoned(origin)) {
    throw new ConvexError({
      code: 'UNKNOWN_ORIGIN',
      detail: `Origin system ${fromSystemId} is not a live system on map ${mapId}.`,
    });
  }
}

async function upsertLiveDestination(
  ctx: MutationCtx,
  mapId: string,
  toSystemId: number,
): Promise<Id<'mapSystems'>> {
  const destination = await findSystem(ctx, mapId, toSystemId);
  if (destination !== null && isTombstoned(destination)) {
    throw new ConvexError({
      code: 'DESTINATION_TOMBSTONED',
      detail: `Destination system ${toSystemId} is tombstoned on map ${mapId}; restore it instead.`,
    });
  }
  if (destination !== null) return destination._id;
  return await ctx.db.insert('mapSystems', {
    mapId,
    systemId: toSystemId,
    deletedAt: null,
    purgeAfter: null,
  });
}

/** One-transaction add: live origin + destination upsert + connection insert. */
async function addFromNode(
  ctx: MutationCtx,
  mapId: string,
  fromSystemId: number,
  toSystemId: number,
): Promise<{ systemId: Id<'mapSystems'>; connectionId: Id<'mapConnections'> }> {
  await requireMapAccess(ctx, mapId, 'edit');
  requireSystemId(fromSystemId);
  requireSystemId(toSystemId);
  if (fromSystemId === toSystemId) {
    throw new ConvexError({
      code: 'SELF_LOOP',
      detail: 'A connection must join two distinct systems.',
    });
  }
  await requireLiveOrigin(ctx, mapId, fromSystemId);
  const systemId = await upsertLiveDestination(ctx, mapId, toSystemId);
  const connectionId = await ctx.db.insert('mapConnections', {
    mapId,
    fromSystemId,
    toSystemId,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    eolAt: null,
    lifeStage: null,
    lifeStageObservedAt: null,
    deletedAt: null,
    purgeAfter: null,
  });
  return { systemId, connectionId };
}

/**
 * Adds a destination from an existing live origin and inserts the connection
 * in one transaction so the reveal is whole on every subscriber.
 */
export const addSystemFromNode = mutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
  },
  handler: (ctx, { mapId, fromSystemId, toSystemId }) =>
    addFromNode(ctx, mapId, fromSystemId, toSystemId),
});

/** Equality-skipping patch helper for one connection field. */
async function patchConnectionField<K extends keyof Doc<'mapConnections'>>(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
  field: K,
  value: Doc<'mapConnections'>[K],
  extra?: Partial<Doc<'mapConnections'>>,
): Promise<{ changed: boolean }> {
  const connection = await requireLiveConnection(ctx, mapId, connectionId);
  if (connection[field] === value) return { changed: false };
  await ctx.db.patch(connectionId, { [field]: value, ...extra });
  return { changed: true };
}

/** Field-scoped setter: wormhole type code (null = unidentified). */
export const setConnectionWormholeType = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: wormholeTypeCodeValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) => {
    // Gate before semantic validation so unauthorized callers never learn
    // whether a code is well-formed (HC-2 / gate-first).
    const connection = await requireLiveConnection(ctx, mapId, connectionId);
    if (value !== null && !isWormholeTypeCode(value)) {
      throw new ConvexError({
        code: 'INVALID_WORMHOLE_CODE',
        detail: `Unknown wormhole code "${value}".`,
      });
    }
    if (connection.wormholeTypeCode === value) return { changed: false };
    await ctx.db.patch(connectionId, { wormholeTypeCode: value });
    return { changed: true };
  },
});

/** Field-scoped setter: ship size class (null = unknown). */
export const setConnectionShipSize = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: shipSizeValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) =>
    await patchConnectionField(
      ctx,
      mapId,
      connectionId,
      'shipSize',
      value satisfies WormholeSizeClass | null,
    ),
});

/** Field-scoped setter: observed mass state (null = unobserved). */
export const setConnectionMassState = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: massStateValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) =>
    await patchConnectionField(
      ctx,
      mapId,
      connectionId,
      'massState',
      value satisfies ConnectionMassState | null,
    ),
});

/**
 * Field-scoped setter: Reliable Lifetime bucket. Stamps
 * `lifeStageObservedAt` from server time on a real change only.
 */
export const setConnectionLifeStage = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: lifeStageValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) => {
    const connection = await requireLiveConnection(ctx, mapId, connectionId);
    const current = connection.lifeStage ?? null;
    if (current === value) return { changed: false as const };
    await ctx.db.patch(connectionId, {
      lifeStage: value satisfies WormholeLifeStage | null,
      lifeStageObservedAt: value === null ? null : Date.now(),
    });
    return { changed: true as const };
  },
});

async function stampSystemTombstone(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<{ tombstoned: true }> {
  const system = await gatedSystem(ctx, mapId, systemId);
  if (isTombstoned(system)) return { tombstoned: true };
  if (await hasLiveReferencingConnection(ctx, mapId, systemId)) {
    throw new ConvexError({
      code: 'SYSTEM_IN_USE',
      detail: `System ${systemId} still has a live connection on map ${mapId}.`,
    });
  }
  await ctx.db.patch(system._id, chainTombstoneStamps(Date.now()));
  return { tombstoned: true };
}

async function stampConnectionTombstone(
  ctx: MutationCtx,
  mapId: string,
  connectionId: Id<'mapConnections'>,
): Promise<{ tombstoned: true }> {
  const connection = await gatedConnection(ctx, mapId, connectionId);
  if (isTombstoned(connection)) return { tombstoned: true };
  await ctx.db.patch(connectionId, chainTombstoneStamps(Date.now()));
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
): Promise<{ restored: true }> {
  const connection = await gatedConnection(ctx, mapId, connectionId);
  if (!isTombstoned(connection)) return { restored: true };
  await requireLiveEndpoint(ctx, mapId, connection.fromSystemId);
  await requireLiveEndpoint(ctx, mapId, connection.toSystemId);
  await ctx.db.patch(connectionId, { deletedAt: null, purgeAfter: null });
  return { restored: true };
}

/**
 * Tombstones one live system. Refuses while any live connection still
 * references it. Idempotent: an already-tombstoned row writes nothing.
 */
export const tombstoneSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    stampSystemTombstone(ctx, mapId, systemId),
});

/**
 * Tombstones one live connection. Idempotent for an already-tombstoned row.
 */
export const tombstoneConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: (ctx, { mapId, connectionId }) =>
    stampConnectionTombstone(ctx, mapId, connectionId),
});

/**
 * Restores one tombstoned system on the same document, preserving `_id` and
 * `_creationTime`. Idempotent for an already-active row.
 */
export const restoreSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) =>
    clearSystemTombstone(ctx, mapId, systemId),
});

/**
 * Restores one tombstoned connection. Refuses when either endpoint system is
 * still tombstoned.
 */
export const restoreConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: (ctx, { mapId, connectionId }) =>
    clearConnectionTombstone(ctx, mapId, connectionId),
});

/**
 * Drains expired system/connection tombstones in one bounded batch.
 * Internal only — the sole hard-delete owner for chain rows.
 */
export const purgeExpiredChainTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredChainTombstonesCore(ctx, Date.now()),
});

/** Re-exported so the proof suite pins the same cap the cleanup owner enforces. */
export { CHAIN_PURGE_BATCH };
