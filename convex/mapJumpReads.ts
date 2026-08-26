import { ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import {
  isEntranceType,
  type ConnectionDoor,
} from '@/data/maps/connection-door-types';
import { isTombstoned } from '@/data/maps/chain-contract';
import { destinationProvenanceOf, hallwayDoorTypes } from '@/data/maps/connection-hallway';
import type { ConnectionProvenance } from './lib/mapEntityContracts';
import { readOriginConnections } from './lib/mapConnectionLookup';

const JUMP_TRACKING_SCAN_CAP = 256;
export const JUMP_CONNECTION_SCAN_CAP = 64;

export interface EmissionFacts {
  readonly connectionId: Id<'mapConnections'>;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoor | null;
  readonly destinationProvenance: ConnectionProvenance | null;
  readonly observationKey: string | null;
}

export interface TrackedLocation {
  readonly tracking: Doc<'mapTracking'>;
  readonly location: Doc<'characterLocation'>;
}

export async function readTrackedLocation(
  ctx: QueryCtx,
  mapId: string,
  characterId: number,
): Promise<TrackedLocation | null> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(JUMP_TRACKING_SCAN_CAP + 1);
  if (rows.length > JUMP_TRACKING_SCAN_CAP) {
    throw new ConvexError({
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the jump-tracking read bound.`,
    });
  }
  const matches = rows.filter((row) => row.characterId === characterId);
  const joined: TrackedLocation[] = [];
  for (const tracking of matches) {
    const location = await ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', tracking.userId).eq('characterId', characterId),
      )
      .unique();
    if (location !== null) joined.push({ tracking, location });
  }
  if (joined.length !== 1) return null;
  return joined[0]!;
}

export function unresolvedCandidatesOf(
  rows: readonly Doc<'mapConnections'>[],
): Doc<'mapConnections'>[] {
  return rows.filter((row) => row.toSystemId === null && !isTombstoned(row));
}

export async function readConnectionsFrom(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
  purpose: 'candidate' | 'pair',
): Promise<Doc<'mapConnections'>[]> {
  return await readOriginConnections(ctx, mapId, fromSystemId, {
    limit: JUMP_CONNECTION_SCAN_CAP,
    errorCode: 'MAP_TOO_LARGE',
    errorDetail: `Map ${mapId} exceeds the jump-${purpose} read bound.`,
  });
}

function emissionTypeSnapshot(connection: Doc<'mapConnections'>): {
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoor | null;
} {
  const doors = hallwayDoorTypes(connection);
  if (isEntranceType(doors.from)) {
    return { wormholeTypeCode: doors.from, typedSide: 'from' };
  }
  if (isEntranceType(doors.to)) {
    return { wormholeTypeCode: doors.to, typedSide: 'to' };
  }
  if (doors.from !== null) return { wormholeTypeCode: doors.from, typedSide: 'from' };
  if (doors.to !== null) return { wormholeTypeCode: doors.to, typedSide: 'to' };
  return { wormholeTypeCode: null, typedSide: null };
}

export function emissionFacts(connection: Doc<'mapConnections'>): EmissionFacts {
  const snapshot = emissionTypeSnapshot(connection);
  return {
    connectionId: connection._id,
    fromSystemId: connection.fromSystemId,
    toSystemId: connection.toSystemId,
    wormholeTypeCode: snapshot.wormholeTypeCode,
    typedSide: snapshot.typedSide,
    destinationProvenance: destinationProvenanceOf(connection.resolution),
    observationKey: connection.observationKey ?? null,
  };
}
