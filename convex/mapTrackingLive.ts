import { ConvexError, v } from 'convex/values';
import { groupBy } from '@/lib/array';
import { query, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { uniqueByUserCharacter } from './lib/indexedQuery';
import { tryMapAccess } from './lib/mapAccess';
import { findCoverage } from './lib/locationCoverage';

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

// Older clients group by userId; a constant keeps them working without identifying an account.
const LEGACY_TRACKER_KEY = '';

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
): Promise<{ userId: string; characterId: number; location: TrackedLocation | null }[]> {
  const locations = await Promise.all(rows.map(async (row) => {
    const location = await findCharacterLocation(ctx, row.userId, row.characterId);
    return {
      characterId: row.characterId,
      location: location === null ? null : trackedLocationPayload(location),
    };
  }));
  const byCharacter = new Map<number, TrackedLocation | null>();
  for (const { characterId, location } of locations) {
    byCharacter.set(characterId, fresher(byCharacter.get(characterId) ?? null, location));
  }
  return [...byCharacter]
    .sort(([left], [right]) => left - right)
    .map(([characterId, location]) => ({ userId: LEGACY_TRACKER_KEY, characterId, location }));
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
async function characterCovered(ctx: QueryCtx, rows: readonly Doc<'mapTracking'>[]): Promise<boolean> {
  for (const row of rows) {
    if (await findCoverage(ctx, row.userId, row.characterId) !== null) return true;
  }
  return false;
}

export const coverage = query({
  args: {
    mapId: v.string(),
    characterIds: v.optional(v.array(v.number())),
    identities: v.optional(v.array(v.object({ userId: v.optional(v.string()), characterId: v.number() }))),
  },
  handler: async (ctx, args) => {
    const { mapId } = args;
    const characterIds = args.characterIds ?? args.identities?.map(({ characterId }) => characterId);
    if (characterIds === undefined || (args.characterIds !== undefined && args.identities !== undefined)) {
      throw new ConvexError({
        code: 'INVALID_COVERAGE_ARGS',
        detail: 'Provide exactly one of characterIds or identities.',
      });
    }
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
    const requested = new Set(unique);
    const trackedByCharacter = groupBy(
      (await readMapTracking(ctx, mapId)).filter((row) => requested.has(row.characterId)),
      (row) => row.characterId,
    );
    const coverageRows = await Promise.all(unique.map(async (characterId) => ({
      characterId,
      covered: await characterCovered(ctx, trackedByCharacter.get(characterId) ?? []),
    })));
    return {
      coverage: args.characterIds !== undefined
        ? coverageRows
        : coverageRows.map((row) => ({ userId: LEGACY_TRACKER_KEY, ...row })),
    };
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
