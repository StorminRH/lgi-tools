import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { namedDoorType } from '@/data/maps/connection-door-types';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  destinationProvenanceOf,
  hallwayDoorTypes,
  isStaticPlaceholder,
  type ConnectionDoorSide,
} from '@/data/maps/connection-hallway';
import type { ConnectionProvenance } from './lib/mapEntityContracts';
import { takeIndexedOrThrow, uniqueByUserCharacter } from './lib/indexedQuery';
import { readOriginConnections } from './lib/mapConnectionLookup';
import { findLiveSystem } from './lib/mapSystemLookup';

const JUMP_TRACKING_SCAN_CAP = 256;
export const JUMP_CONNECTION_SCAN_CAP = 64;

export interface EmissionFacts {
  readonly connectionId: Id<'mapConnections'>;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoorSide | null;
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
  const rows = await takeIndexedOrThrow(
    ctx.db
      .query('mapTracking')
      .withIndex('by_map_character', (q) =>
        q.eq('mapId', mapId).eq('characterId', characterId),
      ),
    JUMP_TRACKING_SCAN_CAP,
    {
      code: 'MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the jump-tracking read bound.`,
    },
  );
  const joined: TrackedLocation[] = [];
  for (const tracking of rows) {
    const location = await uniqueByUserCharacter(ctx, 'characterLocation', tracking.userId, characterId);
    if (location !== null) joined.push({ tracking, location });
  }
  if (joined.length !== 1) return null;
  return joined[0]!;
}

export function unresolvedCandidatesOf(
  rows: readonly Doc<'mapConnections'>[],
): Doc<'mapConnections'>[] {
  return rows.filter((row) =>
    row.toSystemId === null
    && row.resolution.kind !== 'awaiting-signature'
    && !isTombstoned(row)
    && !isStaticPlaceholder(row)
  );
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

export async function hasAwaitingReturn(
  ctx: QueryCtx,
  mapId: string,
  fromSystemId: number,
  toSystemId: number,
): Promise<boolean> {
  if ((await findLiveSystem(ctx, mapId, toSystemId)) === null) return false;
  const rows = await readConnectionsFrom(ctx, mapId, toSystemId, 'pair');
  return rows.some((row) =>
    !isTombstoned(row)
    && row.toSystemId === null
    && row.resolution.kind === 'awaiting-signature'
    && row.resolution.destinationSystemId === fromSystemId,
  );
}

function emissionTypeSnapshot(connection: Doc<'mapConnections'>): {
  readonly wormholeTypeCode: string | null;
  readonly typedSide: ConnectionDoorSide | null;
} {
  const named = namedDoorType(hallwayDoorTypes(connection));
  return { wormholeTypeCode: named.typeCode, typedSide: named.side };
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
