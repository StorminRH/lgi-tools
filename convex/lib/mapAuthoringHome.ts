import { ConvexError } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { requireMapAccess } from './mapAccess';
import { beginSystemEdit, findSystem, requireSystemId } from './mapSystemLookup';

const HOME_SYSTEM_SCAN_CAP = 128;

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

export async function insertHomeSystem(
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

  return await ctx.db.insert('mapSystems', {
    mapId,
    systemId,
    deletedAt: null,
    purgeAfter: null,
  });
}

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

export async function upsertLiveDestination(
  ctx: MutationCtx,
  mapId: string,
  toSystemId: number,
): Promise<Id<'mapSystems'>> {
  const destination = await findSystem(ctx, mapId, toSystemId);
  if (destination !== null) {
    if (isTombstoned(destination)) {
      await ctx.db.patch(destination._id, { deletedAt: null, purgeAfter: null });
    }
    return destination._id;
  }
  return await ctx.db.insert('mapSystems', {
    mapId,
    systemId: toSystemId,
    deletedAt: null,
    purgeAfter: null,
  });
}

export async function addFromNode(
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
    fromWormholeTypeCode: null,
    toWormholeTypeCode: null,
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
