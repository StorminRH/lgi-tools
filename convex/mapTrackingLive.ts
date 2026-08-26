// Live tracking overlay reads. Rows live only on mapTracking; viewers join
// through forMap to characterLocation by the row's own (userId, characterId).
// Coverage is a sibling query so a flip cannot invalidate the location overlay.
import { ConvexError, v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { uniqueByUserCharacter } from './lib/indexedQuery';
import { tryMapAccess } from './lib/mapAccess';
import { findCoverage } from './lib/locationCoverage';

// forMap's registry read bound: cap × a generous member count. With the
// per-(map, user) cap enforced at every insert, a legitimate map cannot reach
// this; hitting it truncates the overlay rather than blowing the transaction
// read budget on a hot reactive query.
const TRACKING_MAP_SCAN_CAP = 256;

function trackedLocationPayload(location: Doc<'characterLocation'>) {
  return {
    solarSystemId: location.solarSystemId,
    stationId: location.stationId,
    structureId: location.structureId,
    shipTypeId: location.shipTypeId,
    prevSolarSystemId: location.prevSolarSystemId,
    prevFresh: location.prevFresh,
    transitionObservedAt: location.transitionObservedAt ?? null,
    observedAt: location.observedAt,
  };
}

function findCharacterLocation(
  ctx: QueryCtx,
  userId: string,
  characterId: number,
): Promise<Doc<'characterLocation'> | null> {
  return uniqueByUserCharacter(ctx, 'characterLocation', userId, characterId);
}

async function readTrackedLocations(
  ctx: QueryCtx,
  rows: readonly Doc<'mapTracking'>[],
) {
  const tracked = [];
  for (const row of rows) {
    const location = await findCharacterLocation(ctx, row.userId, row.characterId);
    tracked.push({
      userId: row.userId,
      characterId: row.characterId,
      location: location === null ? null : trackedLocationPayload(location),
    });
  }
  return tracked;
}

/**
 * Tracking rows for one map, joined to location by each row's own
 * (userId, characterId). Access is answered as a value: missing/revoked claim
 * returns an empty list (4.0.2.3.1 subscription doctrine). A forged row that
 * names another user's character joins to no document and discloses nothing.
 * observedAt is LAST-CHANGE time (the 304 zero-write path never touches it),
 * so this read set changes only on real location/tracking/claim writes — the
 * doorbell's retry sizing and the map's push rate both rest on that.
 * Present+online coverage lives on the sibling `coverage` query, which reads
 * the flip-only `characterLocationCovered` rows so this one never has to.
 */
export const forMap = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) {
      return { tracked: [] as const, ownTrackedCharacterIds: [] as number[] };
    }

    const rows = await ctx.db
      .query('mapTracking')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .take(TRACKING_MAP_SCAN_CAP);

    const tracked = await readTrackedLocations(ctx, rows);
    return {
      tracked,
      ownTrackedCharacterIds: rows
        .filter((row) => row.userId === principal.userId)
        .map((row) => row.characterId)
        .sort((left, right) => left - right),
    };
  },
});

interface CoverageRow {
  userId: string;
  characterId: number;
  covered: boolean;
}

/** Stable wire order without adding another decision to the reactive query. */
function compareCoverageRows(left: CoverageRow, right: CoverageRow): number {
  return (
    left.userId.localeCompare(right.userId)
    || left.characterId - right.characterId
  );
}

/**
 * Per-owner-character present+online coverage for one map's tracked pilots.
 * Split from `forMap` so a coverage flip cannot invalidate the location
 * overlay. Reads only flip-only `characterLocationCovered` rows — never
 * syncSubjects or the online-probe expiry table. Output is sorted by owner
 * then character id.
 */
export const coverage = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) {
      return {
        coverage: [] as {
          userId: string;
          characterId: number;
          covered: boolean;
        }[],
      };
    }

    const rows = await ctx.db
      .query('mapTracking')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .take(TRACKING_MAP_SCAN_CAP);

    const coverageRows: CoverageRow[] = [];
    for (const row of rows) {
      const held = await findCoverage(ctx, row.userId, row.characterId);
      coverageRows.push({
        userId: row.userId,
        characterId: row.characterId,
        covered: held !== null,
      });
    }

    return {
      coverage: coverageRows.sort(compareCoverageRows),
    };
  },
});

export async function readTrackedPilotSystemIds(
  ctx: QueryCtx,
  mapId: string,
): Promise<ReadonlySet<number>> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(TRACKING_MAP_SCAN_CAP + 1);
  if (rows.length > TRACKING_MAP_SCAN_CAP) {
    throw new ConvexError({
      code: 'TRACKING_SCAN_LIMIT',
      detail: `Map ${mapId} exceeds the ${TRACKING_MAP_SCAN_CAP}-row tracked-presence bound.`,
    });
  }
  const systemIds = new Set<number>();
  for (const row of rows) {
    const location = await findCharacterLocation(ctx, row.userId, row.characterId);
    if (location !== null) systemIds.add(location.solarSystemId);
  }
  return systemIds;
}
