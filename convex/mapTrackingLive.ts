import { ConvexError, v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { uniqueByUserCharacter } from './lib/indexedQuery';
import { tryMapAccess } from './lib/mapAccess';
import { findCoverage } from './lib/locationCoverage';

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

function compareCoverageRows(left: CoverageRow, right: CoverageRow): number {
  return (
    left.userId.localeCompare(right.userId)
    || left.characterId - right.characterId
  );
}

export const coverage = query({
  args: {
    mapId: v.string(),
    identities: v.array(
      v.object({
        userId: v.string(),
        characterId: v.number(),
      }),
    ),
  },
  handler: async (ctx, { mapId, identities }) => {
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
    if (identities.length > TRACKING_MAP_SCAN_CAP) {
      throw new ConvexError({
        code: 'TRACKING_SCAN_LIMIT',
        detail: `Coverage identities exceed the ${TRACKING_MAP_SCAN_CAP}-row tracked-presence bound.`,
      });
    }

    const coverageRows: CoverageRow[] = [];
    for (const identity of identities) {
      const held = await findCoverage(ctx, identity.userId, identity.characterId);
      coverageRows.push({
        userId: identity.userId,
        characterId: identity.characterId,
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
