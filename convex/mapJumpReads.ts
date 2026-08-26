import { ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import {
  connectionDoorTypes,
  legacyTypeSnapshot,
} from '@/data/maps/connection-door-types';
import { isTombstoned } from '@/data/maps/chain-contract';

/** Fail-closed bounds for one map's hot tracking and candidate ranges. */
const JUMP_TRACKING_SCAN_CAP = 256;
export const JUMP_CONNECTION_SCAN_CAP = 64;

export interface TrackedLocation {
  readonly tracking: Doc<'mapTracking'>;
  readonly location: Doc<'characterLocation'>;
}

interface EmissionFacts {
  readonly connectionId: Id<'mapConnections'>;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly wormholeTypeCode: string | null;
  readonly typedSide: 'from' | 'to' | null;
  readonly destinationProvenance:
    | Doc<'mapConnections'>['destinationProvenance']
    | null;
  readonly observationKey: string | null;
}

/** Reads one bounded tracking row and its row-owned location document. */
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
  // Only rows that join to a location document participate: `setTracking`
  // accepts any characterId from any viewer, so a forged row naming someone
  // else's character (which joins to nothing under the forger's userId) must
  // not be able to veto the genuine owner's tracking. More than one JOINABLE
  // row is real ambiguity and stays fail-closed.
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

/** Live unresolved candidate rows within an origin-side read. */
export function unresolvedCandidatesOf(
  rows: readonly Doc<'mapConnections'>[],
): Doc<'mapConnections'>[] {
  return rows.filter((row) => row.toSystemId === null && !isTombstoned(row));
}

export function emissionFacts(connection: Doc<'mapConnections'>): EmissionFacts {
  const snapshot = legacyTypeSnapshot(
    connectionDoorTypes(connection),
    connection.typedSide ?? undefined,
  );
  return {
    connectionId: connection._id,
    fromSystemId: connection.fromSystemId,
    toSystemId: connection.toSystemId,
    wormholeTypeCode: snapshot.wormholeTypeCode,
    typedSide: snapshot.typedSide ?? null,
    destinationProvenance: connection.destinationProvenance ?? null,
    observationKey: connection.observationKey ?? null,
  };
}
