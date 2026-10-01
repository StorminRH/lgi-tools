import { ConvexError, v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { uniqueByUserCharacter } from './lib/indexedQuery';
import { tryMapAccess } from './lib/mapAccess';
import { findCoverage } from './lib/locationCoverage';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';

import { readMapTracking, TRACKED_CHARACTERS_PER_MAP_CAP } from './lib/mapTrackingCapacity';

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

type TrackedLocation = ReturnType<typeof trackedLocationPayload>;

function movedAt(location: TrackedLocation): number {
  return location.transitionObservedAt ?? location.observedAt;
}

function fresher(held: TrackedLocation | null, next: TrackedLocation | null): TrackedLocation | null {
  if (held === null || next === null) return held ?? next;
  return movedAt(next) > movedAt(held) ? next : held;
}

/** One entry per character: the freshest location among the accounts tracking it, never who tracks it. */
async function readTrackedLocations(
  ctx: QueryCtx,
  rows: readonly Doc<'mapTracking'>[],
): Promise<{ characterId: number; location: TrackedLocation | null }[]> {
  const byCharacter = new Map<number, TrackedLocation | null>();
  for (const row of rows) {
    const location = await findCharacterLocation(ctx, row.userId, row.characterId);
    const payload = location === null ? null : trackedLocationPayload(location);
    byCharacter.set(row.characterId, fresher(byCharacter.get(row.characterId) ?? null, payload));
  }
  return [...byCharacter]
    .sort(([left], [right]) => left - right)
    .map(([characterId, location]) => ({ characterId, location }));
}

export const forMap = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) {
      return { tracked: [] as const, ownTrackedCharacterIds: [] as number[] };
    }

    const rows = await readMapTracking(ctx, mapId);

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

/** Covered when any account tracking the character on this map holds coverage for it. */
async function characterCovered(ctx: QueryCtx, mapId: string, characterId: number): Promise<boolean> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_character', (q) => q.eq('mapId', mapId).eq('characterId', characterId))
    .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP);
  for (const row of rows) {
    if (await findCoverage(ctx, row.userId, characterId) !== null) return true;
  }
  return false;
}

export const coverage = query({
  args: {
    mapId: v.string(),
    characterIds: v.array(v.number()),
  },
  handler: async (ctx, { mapId, characterIds }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) {
      return { coverage: [] as { characterId: number; covered: boolean }[] };
    }
    if (characterIds.length > TRACKED_CHARACTERS_PER_MAP_CAP) {
      throw new ConvexError({
        code: 'TRACKING_SCAN_LIMIT',
        detail: `Coverage characters exceed the ${TRACKED_CHARACTERS_PER_MAP_CAP}-row tracked-presence bound.`,
      });
    }

    const unique = [...new Set(characterIds)].sort((left, right) => left - right);
    const coverageRows = await Promise.all(unique.map(async (characterId) => ({
      characterId,
      covered: await characterCovered(ctx, mapId, characterId),
    })));
    return { coverage: coverageRows };
  },
});

export async function readTrackedPilotSystemIds(
  ctx: QueryCtx,
  mapId: string,
): Promise<ReadonlySet<number>> {
  const rows = await readMapTracking(ctx, mapId);
  const locations = await Promise.all(
    rows.map((row) => findCharacterLocation(ctx, row.userId, row.characterId)),
  );
  const systemIds = new Set<number>();
  for (const location of locations) {
    if (location !== null) systemIds.add(location.solarSystemId);
  }
  return systemIds;
}
