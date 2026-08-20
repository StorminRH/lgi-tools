// Per-(map, character) tracking opt-in — the registry half of 4.0.4.2.1 tracked
// location. Live map state, not chain: rows live only here, viewers join through
// forMap to characterLocation by the row's own (userId, characterId), and
// revocation/map teardown cascade-delete inside mapAccessProjection.
//
// Ownership is structural: setTracking always writes under the caller's JWT
// subject, and the sync action polls mapTracking then vends tokens only for
// those tracked ids. A forged tracking row naming someone else's character
// joins to no location document.
import { ConvexError, v } from 'convex/values';
import {
  internalQuery,
  type MutationCtx,
  mutation,
  query,
  type QueryCtx,
} from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { uniqueByUserCharacter } from './lib/indexedQuery';
import { requireMapAccess, tryMapAccess } from './lib/mapAccess';
import { findCoverage } from './lib/locationCoverage';

/**
 * Per-(map, user) tracked-character bound, enforced at opt-in. Bounds every
 * downstream read/sweep of this table (a user's linked roster is far smaller;
 * the cap only stops scripted growth against the public mutation).
 */
export const TRACKED_CHARACTERS_PER_MAP_USER_CAP = 32;

// forMap's registry read bound: cap × a generous member count. With the
// per-(map, user) cap enforced at every insert, a legitimate map cannot reach
// this; hitting it truncates the overlay rather than blowing the transaction
// read budget on a hot reactive query.
const TRACKING_MAP_SCAN_CAP = 256;

interface TrackingIdentity {
  mapId: string;
  userId: string;
  characterId: number;
}

async function enableTracking(
  ctx: MutationCtx,
  identity: TrackingIdentity,
  existing: readonly Doc<'mapTracking'>[],
  match: Doc<'mapTracking'> | undefined,
): Promise<void> {
  if (match !== undefined) return;
  if (existing.length >= TRACKED_CHARACTERS_PER_MAP_USER_CAP) {
    throw new ConvexError({
      code: 'TRACKING_CAP_EXCEEDED',
      detail: `At most ${TRACKED_CHARACTERS_PER_MAP_USER_CAP} tracked characters per map.`,
    });
  }
  await ctx.db.insert('mapTracking', identity);
}

async function disableTracking(
  ctx: MutationCtx,
  match: Doc<'mapTracking'> | undefined,
): Promise<void> {
  if (match === undefined) return;
  await ctx.db.delete(match._id);
}

/**
 * Distinct character ids the user currently tracks on any map — the sync
 * action's poll-set half (intersected with Neon enumeration + eligibility).
 */
export const trackedCharacterIds = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) => q.eq('userId', userId))
      .collect();
    return [...new Set(rows.map((row) => row.characterId))];
  },
});

/**
 * Opt a character into or out of tracking on one map. Requires a view claim;
 * the row's userId is always the caller's JWT subject. tracked=true upserts;
 * tracked=false deletes. Idempotent either way.
 */
export const setTracking = mutation({
  args: {
    mapId: v.string(),
    characterId: v.number(),
    tracked: v.boolean(),
  },
  handler: async (ctx, { mapId, characterId, tracked }) => {
    const principal = await requireMapAccess(ctx, mapId, 'view');
    const existing = await ctx.db
      .query('mapTracking')
      .withIndex('by_map_user', (q) =>
        q.eq('mapId', mapId).eq('userId', principal.userId),
      )
      .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP + 1);
    const match = existing.find((row) => row.characterId === characterId);

    if (tracked) {
      await enableTracking(
        ctx,
        {
          mapId,
          userId: principal.userId,
          characterId,
        },
        existing,
        match,
      );
      return { tracked: true };
    }

    await disableTracking(ctx, match);
    return { tracked: false };
  },
});

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

async function readTrackedLocations(
  ctx: QueryCtx,
  rows: readonly Doc<'mapTracking'>[],
) {
  const tracked = [];
  for (const row of rows) {
    const location = await uniqueByUserCharacter(
      ctx,
      'characterLocation',
      row.userId,
      row.characterId,
    );
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

/**
 * Solar systems currently holding at least one tracked pilot on one map — the
 * presence input the collapse triggers feed the shared collapse core. Joins
 * exactly like `forMap`: each tracking row to its own (userId, characterId)
 * location document, so a forged row still discloses and retains nothing.
 */
export async function readTrackedPilotSystemIds(
  ctx: QueryCtx,
  mapId: string,
): Promise<ReadonlySet<number>> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(TRACKING_MAP_SCAN_CAP + 1);
  // Fail closed rather than truncate: this set feeds the collapse core's
  // pilot-present retention, and a silently dropped pilot could let a sweep
  // collapse a branch that still holds a tracked character.
  if (rows.length > TRACKING_MAP_SCAN_CAP) {
    throw new ConvexError({
      code: 'TRACKING_SCAN_LIMIT',
      detail: `Map ${mapId} exceeds the ${TRACKING_MAP_SCAN_CAP}-row tracked-presence bound.`,
    });
  }
  const systemIds = new Set<number>();
  for (const row of rows) {
    const location = await uniqueByUserCharacter(
      ctx,
      'characterLocation',
      row.userId,
      row.characterId,
    );
    if (location !== null) systemIds.add(location.solarSystemId);
  }
  return systemIds;
}

// ── Teardown helpers — mapAccessProjection (revocation cascade, map teardown,
// account claims door) calls these instead of restating the queries, so the
// map-scoped teardown decision has one home. The bearer purge door
// (characterLocation.purgeForUser) keeps its own per-(user, character) delete:
// its key shape spans both tables at once and does not fit these map-scoped
// helpers.

/** Deletes every mapTracking row for one user on one map (revocation cascade). */
export async function deleteTrackingForUser(
  ctx: MutationCtx,
  mapId: string,
  userId: string,
): Promise<void> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/** Full-map tracking sweep used when claims: [] tears the map down. */
export async function deleteAllTrackingForMap(
  ctx: MutationCtx,
  mapId: string,
): Promise<void> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/**
 * Batch-deletes one user's tracking rows across all maps (account purge).
 * Returns hasMore so a calling door can loop without an unbounded
 * single-transaction scan.
 */
export async function purgeTrackingForUserBatch(
  ctx: MutationCtx,
  userId: string,
  limit: number,
): Promise<{ deleted: number; hasMore: boolean }> {
  const rows = await ctx.db
    .query('mapTracking')
    .withIndex('by_user_character', (q) => q.eq('userId', userId))
    .take(limit + 1);
  const doomed = rows.slice(0, limit);
  for (const row of doomed) {
    await ctx.db.delete(row._id);
  }
  return { deleted: doomed.length, hasMore: rows.length > limit };
}
