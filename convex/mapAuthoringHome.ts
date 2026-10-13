import { ConvexError, v } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import { blankHallway } from '@/data/maps/connection-hallway';
import type { Id } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import { takeIndexedOrThrow } from './lib/indexedQuery';
import { requireMapAccess } from './lib/mapAccess';
import {
  beginSystemEdit,
  findSystem,
  requireLiveSystem,
  requireSystemId,
} from './lib/mapSystemLookup';
import { ensureStaticPlaceholders } from './mapStatics';

const HOME_SYSTEM_SCAN_CAP = 128;

async function assertMapEmptyOfLiveSystems(
  ctx: MutationCtx,
  mapId: string,
): Promise<void> {
  const existing = await takeIndexedOrThrow(
    ctx.db.query('mapSystems').withIndex('by_map', (q) => q.eq('mapId', mapId)),
    HOME_SYSTEM_SCAN_CAP,
    {
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${HOME_SYSTEM_SCAN_CAP}-system empty-map proof bound.`,
    },
  );
  if (existing.some((row) => !isTombstoned(row))) {
    throw new ConvexError({
      code: 'MAP_NOT_EMPTY',
      detail: `Map ${mapId} already has a live system.`,
    });
  }
}

async function insertHomeSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Id<'mapSystems'>> {
  await beginSystemEdit(ctx, mapId, systemId);
  await assertMapEmptyOfLiveSystems(ctx, mapId);

  const prior = await findSystem(ctx, mapId, systemId);
  if (prior !== null) {
    if (isTombstoned(prior)) {
      throw new ConvexError({
        code: 'DESTINATION_TOMBSTONED',
        detail: `System ${systemId} is tombstoned on map ${mapId}; restore it instead.`,
      });
    }
    return prior._id;
  }

  return insertLiveSystem(ctx, mapId, systemId);
}

export async function upsertLiveDestination(
  ctx: MutationCtx,
  mapId: string,
  toSystemId: number,
): Promise<Id<'mapSystems'>> {
  const destination = await findSystem(ctx, mapId, toSystemId);
  if (destination !== null) {
    if (isTombstoned(destination)) {
      await ctx.db.patch(destination._id, { deletedAt: null, purgeAfter: null });
      await ensureStaticPlaceholders(ctx, mapId, toSystemId);
    }
    return destination._id;
  }
  return insertLiveSystem(ctx, mapId, toSystemId);
}

async function insertLiveSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<Id<'mapSystems'>> {
  const inserted = await ctx.db.insert('mapSystems', {
    mapId,
    systemId,
    deletedAt: null,
    purgeAfter: null,
  });
  await ensureStaticPlaceholders(ctx, mapId, systemId);
  return inserted;
}

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
  await requireLiveSystem(ctx, mapId, fromSystemId, {
    code: 'UNKNOWN_ORIGIN',
    detail: `Origin system ${fromSystemId} is not a live system on map ${mapId}.`,
  });
  const systemId = await upsertLiveDestination(ctx, mapId, toSystemId);
  const connectionId = await ctx.db.insert('mapConnections', {
    ...blankHallway({ mapId, fromSystemId, toSystemId }),
  });
  return { systemId, connectionId };
}

export const setHomeSystem = mutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: (ctx, { mapId, systemId }) => insertHomeSystem(ctx, mapId, systemId),
});

export const addSystemFromNode = mutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.number(),
  },
  handler: (ctx, { mapId, fromSystemId, toSystemId }) =>
    addFromNode(ctx, mapId, fromSystemId, toSystemId),
});
