import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { tryMapAccessForUser } from './lib/mapAccess';
import { findSystem } from './lib/mapSystemLookup';
import { isTombstoned } from '@/data/maps/chain-contract';
import { storedDoorTypes } from '@/data/maps/connection-door-types';
import {
  emissionFacts,
  type EmissionFacts,
  readConnectionsFrom,
  readTrackedLocation,
  unresolvedCandidatesOf,
} from './mapJumpReads';

function scannedTypeCodes(rows: readonly Doc<'mapConnections'>[]): string[] {
  return rows.flatMap((row) => {
    if (isTombstoned(row)) return [];
    const originType = storedDoorTypes(row).from;
    return originType === null ? [] : [originType];
  });
}

export const jumpEvidence = internalQuery({
  args: {
    userId: v.string(),
    mapId: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, { userId, mapId, characterId }) => {
    const principal = await tryMapAccessForUser(ctx, mapId, userId, 'edit');
    if (principal === null) {
      return {
        canEdit: false as const,
        tracked: false as const,
        transition: null,
        lastProcessedTransitionAt: null,
        originLive: false,
        scannedTypeCodes: [],
        candidates: [],
      };
    }

    const tracked = await readTrackedLocation(ctx, mapId, characterId);
    if (tracked === null) {
      return {
        canEdit: true as const,
        tracked: false as const,
        transition: null,
        lastProcessedTransitionAt: null,
        originLive: false,
        scannedTypeCodes: [],
        candidates: [],
      };
    }
    const { location } = tracked;
    if (location.transitionObservedAt === undefined) {
      return {
        canEdit: true as const,
        tracked: true as const,
        transition: null,
        lastProcessedTransitionAt: null,
        originLive: false,
        scannedTypeCodes: [],
        candidates: [],
      };
    }
    const stamp = await ctx.db
      .query('mapJumpBookkeeping')
      .withIndex('by_map_character', (q) =>
        q.eq('mapId', mapId).eq('characterId', characterId),
      )
      .unique();
    const fromSolarSystemId = location.prevSolarSystemId;
    const origin = fromSolarSystemId === null
      ? null
      : await findSystem(ctx, mapId, fromSolarSystemId);
    const originLive = origin !== null && !isTombstoned(origin);
    const originRows = originLive && fromSolarSystemId !== null
      ? await readConnectionsFrom(ctx, mapId, fromSolarSystemId, 'candidate')
      : [];
    const candidates = unresolvedCandidatesOf(originRows);

    return {
      canEdit: true as const,
      tracked: true as const,
      transition: {
        fromSolarSystemId: location.prevSolarSystemId,
        toSolarSystemId: location.solarSystemId,
        shipTypeId: location.shipTypeId,
        prevFresh: location.prevFresh,
        transitionObservedAt: location.transitionObservedAt,
      },
      lastProcessedTransitionAt: stamp?.lastProcessedTransitionAt ?? null,
      originLive,
      scannedTypeCodes: scannedTypeCodes(originRows),
      candidates: candidates.map((candidate) => ({
        id: candidate._id,
        wormholeTypeCode: candidate.wormholeTypeCode,
        destinationHint: candidate.fromDestinationHint,
        sizeClass: candidate.shipSize,
      })),
    };
  },
});

export const connectionEvidence = internalQuery({
  args: {
    userId: v.string(),
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
  },
  handler: async (ctx, { userId, mapId, connectionId }) => {
    const principal = await tryMapAccessForUser(ctx, mapId, userId, 'edit');
    if (principal === null) {
      return { canEdit: false as const, connection: null };
    }
    const connection = await ctx.db.get(connectionId);
    if (
      connection === null
      || connection.mapId !== mapId
      || connection.toSystemId === null
      || isTombstoned(connection)
    ) {
      return { canEdit: true as const, connection: null };
    }
    const [fromSystem, toSystem] = await Promise.all([
      findSystem(ctx, mapId, connection.fromSystemId),
      findSystem(ctx, mapId, connection.toSystemId),
    ]);
    if (
      fromSystem === null
      || toSystem === null
      || isTombstoned(fromSystem)
      || isTombstoned(toSystem)
    ) {
      return { canEdit: true as const, connection: null };
    }
    const facts: EmissionFacts = emissionFacts(connection);
    return { canEdit: true as const, connection: facts };
  },
});
