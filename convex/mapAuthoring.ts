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
  isPositiveId,
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

/** Rejects a system ID that is not a positive safe integer. */
function requireSystemId(systemId: number): void {
  if (!isPositiveId(systemId)) {
    throw new ConvexError({
      code: 'INVALID_SYSTEM_ID',
      detail: 'A system ID must be a positive safe integer.',
    });
  }
}

/** The one indexed map/system lookup shared by every authoring write. */
function findSystem(ctx: MutationCtx, mapId: string, systemId: number) {
  return ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) => q.eq('mapId', mapId).eq('systemId', systemId))
    .unique();
}

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

/**
 * Sets the map's first (home) system. Refuses when any live system already
 * exists so one root holds by construction.
 */
export const setHomeSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    requireSystemId(systemId);

    // Any live row means the map already has a root — refuse rather than
    // inventing a second disconnected system. Tombstoned rows do not count.
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
  },
});

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
  handler: async (ctx, { mapId, fromSystemId, toSystemId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    requireSystemId(fromSystemId);
    requireSystemId(toSystemId);

    if (fromSystemId === toSystemId) {
      throw new ConvexError({
        code: 'SELF_LOOP',
        detail: 'A connection must join two distinct systems.',
      });
    }

    const origin = await findSystem(ctx, mapId, fromSystemId);
    if (origin === null || isTombstoned(origin)) {
      throw new ConvexError({
        code: 'UNKNOWN_ORIGIN',
        detail: `Origin system ${fromSystemId} is not a live system on map ${mapId}.`,
      });
    }

    const destination = await findSystem(ctx, mapId, toSystemId);
    if (destination !== null && isTombstoned(destination)) {
      throw new ConvexError({
        code: 'DESTINATION_TOMBSTONED',
        detail: `Destination system ${toSystemId} is tombstoned on map ${mapId}; restore it instead.`,
      });
    }

    const systemId =
      destination?._id
      ?? (await ctx.db.insert('mapSystems', {
        mapId,
        systemId: toSystemId,
        deletedAt: null,
        purgeAfter: null,
      }));

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
  },
});

/** Field-scoped setter: wormhole type code (null = unidentified). */
export const setConnectionWormholeType = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: wormholeTypeCodeValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    if (value !== null && !isWormholeTypeCode(value)) {
      throw new ConvexError({
        code: 'INVALID_WORMHOLE_CODE',
        detail: `Unknown wormhole code "${value}".`,
      });
    }

    const connection = await requireConnectionOnMap(ctx, mapId, connectionId);
    if (isTombstoned(connection)) {
      throw new ConvexError({
        code: 'CONNECTION_TOMBSTONED',
        detail: `Connection ${connectionId} is tombstoned.`,
      });
    }
    if (connection.wormholeTypeCode === value) return { changed: false as const };

    await ctx.db.patch(connectionId, { wormholeTypeCode: value });
    return { changed: true as const };
  },
});

/** Field-scoped setter: ship size class (null = unknown). */
export const setConnectionShipSize = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: shipSizeValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    const connection = await requireConnectionOnMap(ctx, mapId, connectionId);
    if (isTombstoned(connection)) {
      throw new ConvexError({
        code: 'CONNECTION_TOMBSTONED',
        detail: `Connection ${connectionId} is tombstoned.`,
      });
    }
    if (connection.shipSize === value) return { changed: false as const };

    await ctx.db.patch(connectionId, { shipSize: value satisfies WormholeSizeClass | null });
    return { changed: true as const };
  },
});

/** Field-scoped setter: observed mass state (null = unobserved). */
export const setConnectionMassState = mutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    value: massStateValidator,
  },
  handler: async (ctx, { mapId, connectionId, value }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    const connection = await requireConnectionOnMap(ctx, mapId, connectionId);
    if (isTombstoned(connection)) {
      throw new ConvexError({
        code: 'CONNECTION_TOMBSTONED',
        detail: `Connection ${connectionId} is tombstoned.`,
      });
    }
    if (connection.massState === value) return { changed: false as const };

    await ctx.db.patch(connectionId, {
      massState: value satisfies ConnectionMassState | null,
    });
    return { changed: true as const };
  },
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
    await requireMapAccess(ctx, mapId, 'edit');
    const connection = await requireConnectionOnMap(ctx, mapId, connectionId);
    if (isTombstoned(connection)) {
      throw new ConvexError({
        code: 'CONNECTION_TOMBSTONED',
        detail: `Connection ${connectionId} is tombstoned.`,
      });
    }
    const current = connection.lifeStage ?? null;
    if (current === value) return { changed: false as const };

    await ctx.db.patch(connectionId, {
      lifeStage: value satisfies WormholeLifeStage | null,
      lifeStageObservedAt: value === null ? null : Date.now(),
    });
    return { changed: true as const };
  },
});

/**
 * Tombstones one live system. Refuses while any live connection still
 * references it. Idempotent: an already-tombstoned row writes nothing.
 */
export const tombstoneSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    requireSystemId(systemId);

    const system = await findSystem(ctx, mapId, systemId);
    if (system === null) {
      throw new ConvexError({
        code: 'UNKNOWN_SYSTEM',
        detail: `System ${systemId} is not on map ${mapId}.`,
      });
    }
    if (isTombstoned(system)) return { tombstoned: true as const };

    if (await hasLiveReferencingConnection(ctx, mapId, systemId)) {
      throw new ConvexError({
        code: 'SYSTEM_IN_USE',
        detail: `System ${systemId} still has a live connection on map ${mapId}.`,
      });
    }

    await ctx.db.patch(system._id, chainTombstoneStamps(Date.now()));
    return { tombstoned: true as const };
  },
});

/**
 * Tombstones one live connection. Idempotent for an already-tombstoned row.
 */
export const tombstoneConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    const connection = await requireConnectionOnMap(ctx, mapId, connectionId);
    if (isTombstoned(connection)) return { tombstoned: true as const };

    await ctx.db.patch(connectionId, chainTombstoneStamps(Date.now()));
    return { tombstoned: true as const };
  },
});

/**
 * Restores one tombstoned system on the same document, preserving `_id` and
 * `_creationTime`. Idempotent for an already-active row.
 */
export const restoreSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    requireSystemId(systemId);

    const system = await findSystem(ctx, mapId, systemId);
    if (system === null) {
      throw new ConvexError({
        code: 'UNKNOWN_SYSTEM',
        detail: `System ${systemId} is not on map ${mapId}.`,
      });
    }
    if (!isTombstoned(system)) return { restored: true as const };

    await ctx.db.patch(system._id, { deletedAt: null, purgeAfter: null });
    return { restored: true as const };
  },
});

/**
 * Restores one tombstoned connection. Refuses when either endpoint system is
 * still tombstoned.
 */
export const restoreConnection = mutation({
  args: { mapId: v.string(), connectionId: v.id('mapConnections') },
  handler: async (ctx, { mapId, connectionId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    const connection = await requireConnectionOnMap(ctx, mapId, connectionId);
    if (!isTombstoned(connection)) return { restored: true as const };

    for (const endpointId of [connection.fromSystemId, connection.toSystemId]) {
      const endpoint = await findSystem(ctx, mapId, endpointId);
      if (endpoint === null || isTombstoned(endpoint)) {
        throw new ConvexError({
          code: 'ENDPOINT_TOMBSTONED',
          detail: `Endpoint system ${endpointId} is missing or tombstoned on map ${mapId}.`,
        });
      }
    }

    await ctx.db.patch(connectionId, { deletedAt: null, purgeAfter: null });
    return { restored: true as const };
  },
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
