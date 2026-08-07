// Gate-first fixture surface for the collaborative chain: executable entity,
// index, and authorization contracts. Public surface is the gated
// `readMapCollection` query; chain writes are internal fixtures or production
// authoring mutations in `mapAuthoring` (sole write surface).
//
// "No importer" is not "unreachable": Convex publishes every public function in
// this directory, so import-graph reasoning must never declare one dead.
//
// Two rules hold everywhere here:
//   1. requireMapAccess is the FIRST call in every public handler.
//   2. Volatile bookkeeping never touches a watched payload document — last-seen
//      lives in mapSignatureActivity, and a sub-threshold observation writes nothing.
import { ConvexError, v } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import {
  internalMutation,
  query,
  type MutationCtx,
} from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireMapAccess } from './lib/mapAccess';
import {
  destinationHintValidator,
  massStateValidator,
  mergeSignatureKnowledge,
  noteTargetKindValidator,
  normalizeSignatureKnowledge,
  shipSizeValidator,
  validateConnectionInput,
  validateSignatureKnowledge,
  validateUnresolvedHoleInput,
  wormholeTypeCodeValidator,
  type NoteTargetKind,
} from './lib/mapEntityContracts';
import {
  findSystem,
  requireSystemId,
} from './lib/mapSystemLookup';
import {
  purgeExpiredSignatures,
  SIGNATURE_PURGE_BATCH,
} from './lib/mapSignatureCleanup';
import { getSyncSubject, newIdleSubject } from './lib/subjects';

/**
 * Rows returned by one paginated chain read. Fixed and small: a page is a transaction-bounded unit,
 * so a bigger map costs more calls rather than a bigger, riskier single transaction.
 */
export const MAP_FIXTURE_PAGE_SIZE = 25;

/**
 * How much newer an observation must be before it rewrites a signature's last-seen row. The boundary
 * governs INVISIBLE bookkeeping only — nothing user-visible is delayed or scheduled by it, and every
 * activity write stays outside mapSignatures either way.
 */
const SIGNATURE_ACTIVITY_STALE_MS = 60_000;

const collectionValidator = v.union(
  v.literal('systems'),
  v.literal('connections'),
  v.literal('signatures'),
  v.literal('notes'),
);

const cursorValidator = v.union(v.string(), v.null());

/**
 * Reads one page of one chain collection for one map.
 *
 * Convex permits exactly one `.paginate()` per function execution, so each collection is paged by
 * its own call and callers iterate each cursor independently until its `isDone`. The result is
 * Convex's real page and continuation state, unwrapped — a map larger than one page is explicitly
 * incomplete until that collection's own cursor finishes, never silently truncated.
 *
 * The gate runs first, and the `by_map` index makes the map ID the leading equality constraint, so
 * another map's rows cannot enter this range at all.
 */
export const readMapCollection = query({
  args: {
    mapId: v.string(),
    collection: collectionValidator,
    cursor: cursorValidator,
  },
  handler: async (ctx, { mapId, collection, cursor }) => {
    await requireMapAccess(ctx, mapId, 'view');

    const paginationOpts = { cursor, numItems: MAP_FIXTURE_PAGE_SIZE };
    const byMap = (table: 'mapSystems' | 'mapConnections' | 'mapSignatures' | 'mapNotes') =>
      ctx.db.query(table).withIndex('by_map', (q) => q.eq('mapId', mapId));

    switch (collection) {
      case 'systems':
        return await byMap('mapSystems').paginate(paginationOpts);
      case 'connections':
        return await byMap('mapConnections').paginate(paginationOpts);
      case 'signatures':
        return await byMap('mapSignatures').paginate(paginationOpts);
      case 'notes':
        return await byMap('mapNotes').paginate(paginationOpts);
    }
  },
});

/**
 * Internal CLI-callable system placement: id validation and idempotent
 * `by_map_system` upsert, with no access gate. Admin-key `convex run` and
 * tests only — production chain writes go through `mapAuthoring` (HC-1).
 */
export const placeSystemFixture = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }) => {
    requireSystemId(systemId);

    const existing = await findSystem(ctx, mapId, systemId);
    if (existing !== null) return existing._id;
    return await ctx.db.insert('mapSystems', { mapId, systemId });
  },
});

/** The one connection-input arg shape, shared by every fixture that writes a connection row. */
const connectionArgs = {
  mapId: v.string(),
  fromSystemId: v.number(),
  toSystemId: v.number(),
  wormholeTypeCode: wormholeTypeCodeValidator,
  massState: massStateValidator,
  shipSize: shipSizeValidator,
  eolAt: v.union(v.number(), v.null()),
};

/**
 * Inserts one validated connection. Beyond the pure boundary rules, both endpoints must already
 * exist on THIS map — a connection to an unplaced or foreign system would be an unresolvable
 * reference the read path could never join.
 */
export const insertConnectionFixture = internalMutation({
  args: connectionArgs,
  handler: async (ctx, args) => {
    validateConnectionInput(args);

    for (const systemId of [args.fromSystemId, args.toSystemId]) {
      if ((await findSystem(ctx, args.mapId, systemId)) === null) {
        throw new ConvexError({
          code: 'UNKNOWN_ENDPOINT',
          detail: `System ${systemId} is not on map ${args.mapId}.`,
        });
      }
    }

    return await ctx.db.insert('mapConnections', args);
  },
});

/**
 * One jump, atomically: reveals a system together with the connection that
 * discovered it, in a single transaction.
 *
 * This mirrors how mapping actually learns about a system — you are IN a known
 * system and jump, so the connection is known the moment the destination is —
 * and it is what keeps the reveal whole on the read path: both subscriptions
 * update in one consistent Convex transition, so the layout kernel sees the
 * attachment in the same merge that births the node and it surfaces directly
 * on the tree (never "nowhere", then a hop). What binds the production
 * auto-mapper (4.0.4.2) is the TRANSACTION BOUNDARY — system and connection
 * land together — not this fixture's insert semantics: a polled writer must
 * upsert re-observed jumps, where this dev seam may plainly insert.
 *
 * At least one endpoint must already be on the map (a connection cannot be
 * scanned from nowhere); a missing endpoint is upserted, and a repeated call
 * for two placed endpoints degrades to a plain connection insert. Admin-key
 * `convex run` only — matches the existing internal fixture family.
 */
export const placeJumpFixture = internalMutation({
  args: connectionArgs,
  handler: async (ctx, args) => {
    validateConnectionInput(args);

    const endpoints = [args.fromSystemId, args.toSystemId];
    const existing = await Promise.all(
      endpoints.map((systemId) => findSystem(ctx, args.mapId, systemId)),
    );
    if (existing.every((row) => row === null)) {
      throw new ConvexError({
        code: 'NO_ORIGIN',
        detail: 'A jump needs one endpoint already on the map.',
      });
    }
    // Endpoint ids are already validated by `validateConnectionInput` above.
    for (const [index, systemId] of endpoints.entries()) {
      if (existing[index] === null) {
        await ctx.db.insert('mapSystems', { mapId: args.mapId, systemId });
      }
    }

    return await ctx.db.insert('mapConnections', args);
  },
});

interface UnresolvedHoleFixtureArgs {
  readonly mapId: string;
  readonly fromSystemId: number;
  readonly fromSignatureId: string;
  readonly wormholeTypeCode?: Doc<'mapConnections'>['wormholeTypeCode'];
  readonly shipSize?: Doc<'mapConnections'>['shipSize'];
  readonly fromDestinationHint?: Doc<'mapConnections'>['fromDestinationHint'];
}

interface NormalizedUnresolvedHole extends UnresolvedHoleFixtureArgs {
  readonly fromSignatureId: string;
  readonly wormholeTypeCode: Doc<'mapConnections'>['wormholeTypeCode'];
  readonly shipSize: Doc<'mapConnections'>['shipSize'];
}

function normalizeUnresolvedHole(args: UnresolvedHoleFixtureArgs): NormalizedUnresolvedHole {
  const normalized = {
    ...args,
    fromSignatureId: args.fromSignatureId.trim(),
    wormholeTypeCode: args.wormholeTypeCode ?? null,
    shipSize: args.shipSize ?? null,
  };
  validateUnresolvedHoleInput({
    fromSystemId: normalized.fromSystemId,
    toSystemId: null,
    fromSignatureId: normalized.fromSignatureId,
    wormholeTypeCode: normalized.wormholeTypeCode,
    shipSize: normalized.shipSize,
    fromDestinationHint: normalized.fromDestinationHint,
  });
  return normalized;
}

async function requireUnresolvedHoleOrigin(
  ctx: MutationCtx,
  args: NormalizedUnresolvedHole,
): Promise<void> {
  const origin = await findSystem(ctx, args.mapId, args.fromSystemId);
  if (origin === null || isTombstoned(origin)) {
    throw new ConvexError({
      code: 'UNKNOWN_ENDPOINT',
      detail: `Origin system ${args.fromSystemId} is not live on map ${args.mapId}.`,
    });
  }
}

async function findUnresolvedHole(
  ctx: MutationCtx,
  args: NormalizedUnresolvedHole,
): Promise<Doc<'mapConnections'> | undefined> {
  const rows = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_from', (q) =>
      q.eq('mapId', args.mapId).eq('fromSystemId', args.fromSystemId),
    )
    .take(FIXTURE_CONNECTION_SCAN_LIMIT + 1);
  if (rows.length > FIXTURE_CONNECTION_SCAN_LIMIT) {
    throw new ConvexError({
      code: 'FIXTURE_MAP_TOO_LARGE',
      detail: `Map ${args.mapId} exceeds the ${FIXTURE_CONNECTION_SCAN_LIMIT}-connection unresolved-hole bound.`,
    });
  }
  return rows.find(
    (row) => row.toSystemId === null && row.fromSignatureId === args.fromSignatureId,
  );
}

function unresolvedHoleTypePatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  if (input.wormholeTypeCode === undefined) return {};
  if (existing.wormholeTypeCode === normalized.wormholeTypeCode) return {};
  return {
    wormholeTypeCode: normalized.wormholeTypeCode,
    typedSide: normalized.wormholeTypeCode === null ? undefined : 'from',
    typeProvenance: normalized.wormholeTypeCode === null ? undefined : 'human',
  };
}

function unresolvedHoleSizePatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  if (input.shipSize === undefined || existing.shipSize === normalized.shipSize) return {};
  return { shipSize: normalized.shipSize };
}

function unresolvedHoleHintPatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  if (input.fromDestinationHint === undefined) return {};
  if (existing.fromDestinationHint === normalized.fromDestinationHint) return {};
  return { fromDestinationHint: normalized.fromDestinationHint };
}

function unresolvedHolePatch(
  existing: Doc<'mapConnections'>,
  input: UnresolvedHoleFixtureArgs,
  normalized: NormalizedUnresolvedHole,
): Partial<Doc<'mapConnections'>> {
  return {
    ...unresolvedHoleTypePatch(existing, input, normalized),
    ...unresolvedHoleSizePatch(existing, input, normalized),
    ...unresolvedHoleHintPatch(existing, input, normalized),
  };
}

async function insertUnresolvedHole(
  ctx: MutationCtx,
  args: NormalizedUnresolvedHole,
) {
  return await ctx.db.insert('mapConnections', {
    mapId: args.mapId,
    fromSystemId: args.fromSystemId,
    toSystemId: null,
    fromSignatureId: args.fromSignatureId,
    wormholeTypeCode: args.wormholeTypeCode,
    massState: null,
    shipSize: args.shipSize,
    eolAt: null,
    typedSide: args.wormholeTypeCode === null ? undefined : 'from',
    typeProvenance: args.wormholeTypeCode === null ? undefined : 'human',
    fromDestinationHint: args.fromDestinationHint,
    deletedAt: null,
    purgeAfter: null,
  });
}

/**
 * Seeds or enriches one active scanned wormhole slot without inventing a far
 * endpoint. This is the pre-parser proof seam for jump matching.
 */
export const upsertUnresolvedHole = internalMutation({
  args: {
    mapId: v.string(),
    fromSystemId: v.number(),
    fromSignatureId: v.string(),
    wormholeTypeCode: v.optional(wormholeTypeCodeValidator),
    shipSize: v.optional(shipSizeValidator),
    fromDestinationHint: v.optional(destinationHintValidator),
  },
  handler: async (ctx, input) => {
    const args = normalizeUnresolvedHole(input);
    await requireUnresolvedHoleOrigin(ctx, args);
    const existing = await findUnresolvedHole(ctx, args);
    if (existing === undefined) {
      const connectionId = await insertUnresolvedHole(ctx, args);
      return { outcome: 'inserted' as const, connectionId };
    }
    if (isTombstoned(existing)) {
      return { outcome: 'tombstoned' as const, connectionId: existing._id };
    }
    const patch = unresolvedHolePatch(existing, input, args);
    if (Object.keys(patch).length === 0) {
      return { outcome: 'unchanged' as const, connectionId: existing._id };
    }
    await ctx.db.patch(existing._id, patch);
    return { outcome: 'updated' as const, connectionId: existing._id };
  },
});

function requireTrackedFixtureIdentity(
  userId: string,
  characterId: number,
  transitionObservedAt: number,
): void {
  if (userId.trim().length === 0) {
    throw new ConvexError({
      code: 'INVALID_FIXTURE_USER',
      detail: 'A tracked-location fixture needs a non-empty user id.',
    });
  }
  if (!Number.isSafeInteger(characterId) || characterId <= 0) {
    throw new ConvexError({
      code: 'INVALID_CHARACTER_ID',
      detail: 'A tracked-location fixture needs a positive safe character id.',
    });
  }
  if (!Number.isFinite(transitionObservedAt) || transitionObservedAt <= 0) {
    throw new ConvexError({
      code: 'INVALID_TRANSITION_TIME',
      detail: 'A tracked-location fixture needs a positive finite transition time.',
    });
  }
}

/**
 * Stamps the owner's characterLocation sync-subject `lastFinishedAt` — the
 * probe-controlled freshness seam behind `mapTracking.forMap`'s `feedFreshAt`
 * join. Headless probes drive the live/stale presentation states honestly
 * through this stamp: production freshness is written only by the sync
 * engine's apply, and this internal-fixture path is unreachable from
 * production code. Inserts a minimal idle subject when none exists yet.
 */
async function stampSubjectFreshness(
  ctx: MutationCtx,
  userId: string,
  lastFinishedAt: number,
): Promise<void> {
  const subject = await getSyncSubject(ctx.db, 'characterLocation', userId);
  if (subject !== null) {
    await ctx.db.patch('syncSubjects', subject._id, { lastFinishedAt });
    return;
  }
  await ctx.db.insert('syncSubjects', {
    ...newIdleSubject('characterLocation', userId),
    lastFinishedAt,
  });
}

const trackedLocationFixtureResult = v.object({
  trackingId: v.id('mapTracking'),
  locationId: v.id('characterLocation'),
  fromSolarSystemId: v.union(v.number(), v.null()),
  toSolarSystemId: v.number(),
  transitionObservedAt: v.number(),
});

/**
 * Seeds the subscribed origin fact for a CLI-driven tracked-jump demo. This
 * fixture arranges source evidence only; the browser doorbell and production
 * resolver still own classification, authoring, matching, and mass updates.
 * Also stamps the owner's subject freshness (`feedFreshAt` when supplied,
 * else the transition time) so presence probes control the live/stale states.
 */
export const seedTrackedLocationFixture = internalMutation({
  args: {
    mapId: v.string(),
    userId: v.string(),
    characterId: v.number(),
    solarSystemId: v.number(),
    shipTypeId: v.union(v.number(), v.null()),
    transitionObservedAt: v.number(),
    feedFreshAt: v.optional(v.number()),
  },
  returns: trackedLocationFixtureResult,
  handler: async (ctx, args) => {
    requireSystemId(args.solarSystemId);
    requireTrackedFixtureIdentity(
      args.userId,
      args.characterId,
      args.transitionObservedAt,
    );

    const system = await findSystem(ctx, args.mapId, args.solarSystemId);
    if (system === null) {
      await ctx.db.insert('mapSystems', {
        mapId: args.mapId,
        systemId: args.solarSystemId,
      });
    } else if (isTombstoned(system)) {
      throw new ConvexError({
        code: 'FIXTURE_ORIGIN_TOMBSTONED',
        detail: `System ${args.solarSystemId} is tombstoned on map ${args.mapId}.`,
      });
    }

    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_map_user', (q) =>
        q.eq('mapId', args.mapId).eq('userId', args.userId),
      )
      .filter((q) => q.eq(q.field('characterId'), args.characterId))
      .unique();
    const trackingId = tracking?._id ?? await ctx.db.insert('mapTracking', {
      mapId: args.mapId,
      userId: args.userId,
      characterId: args.characterId,
    });

    const location = await ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .unique();
    const source = {
      userId: args.userId,
      characterId: args.characterId,
      solarSystemId: args.solarSystemId,
      stationId: null,
      structureId: null,
      shipTypeId: args.shipTypeId,
      prevSolarSystemId: null,
      prevFresh: false,
      transitionObservedAt: args.transitionObservedAt,
      observedAt: args.transitionObservedAt,
      etagLocation: null,
      etagShip: null,
    };
    const locationId = location?._id
      ?? await ctx.db.insert('characterLocation', source);
    if (location !== null) {
      await ctx.db.patch('characterLocation', location._id, source);
    }
    await stampSubjectFreshness(
      ctx,
      args.userId,
      args.feedFreshAt ?? args.transitionObservedAt,
    );

    return {
      trackingId,
      locationId,
      fromSolarSystemId: null,
      toSolarSystemId: args.solarSystemId,
      transitionObservedAt: args.transitionObservedAt,
    };
  },
});

/**
 * Advances only the subscribed location evidence for a tracked CLI fixture.
 * A fresh transition lets the normal browser observer ring the real resolver;
 * `prevFresh=false` deliberately creates a re-anchor between demo jumps.
 * Re-stamps the owner's subject freshness like the seed fixture does.
 */
export const advanceTrackedLocationFixture = internalMutation({
  args: {
    mapId: v.string(),
    userId: v.string(),
    characterId: v.number(),
    fromSolarSystemId: v.number(),
    toSolarSystemId: v.number(),
    prevFresh: v.boolean(),
    transitionObservedAt: v.number(),
    feedFreshAt: v.optional(v.number()),
  },
  returns: trackedLocationFixtureResult,
  handler: async (ctx, args) => {
    requireSystemId(args.fromSolarSystemId);
    requireSystemId(args.toSolarSystemId);
    requireTrackedFixtureIdentity(
      args.userId,
      args.characterId,
      args.transitionObservedAt,
    );

    const location = await ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .unique();
    if (location === null) {
      throw new ConvexError({
        code: 'FIXTURE_LOCATION_MISSING',
        detail: `Character ${args.characterId} has no seeded location.`,
      });
    }
    if (location.solarSystemId !== args.fromSolarSystemId) {
      throw new ConvexError({
        code: 'FIXTURE_LOCATION_STALE',
        detail: `Character ${args.characterId} is not in ${args.fromSolarSystemId}.`,
      });
    }

    await ctx.db.patch('characterLocation', location._id, {
      solarSystemId: args.toSolarSystemId,
      stationId: null,
      structureId: null,
      prevSolarSystemId: args.fromSolarSystemId,
      prevFresh: args.prevFresh,
      transitionObservedAt: args.transitionObservedAt,
      observedAt: args.transitionObservedAt,
      etagLocation: null,
    });
    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .filter((q) => q.eq(q.field('mapId'), args.mapId))
      .first();
    if (tracking === null) {
      throw new ConvexError({
        code: 'FIXTURE_TRACKING_MISSING',
        detail: `Character ${args.characterId} has no seeded tracking row.`,
      });
    }
    await stampSubjectFreshness(
      ctx,
      args.userId,
      args.feedFreshAt ?? args.transitionObservedAt,
    );

    return {
      trackingId: tracking._id,
      locationId: location._id,
      fromSolarSystemId: args.fromSolarSystemId,
      toSolarSystemId: args.toSolarSystemId,
      transitionObservedAt: args.transitionObservedAt,
    };
  },
});

/**
 * How many of a map's connections {@link removeSystemFixture} will examine before refusing to act.
 *
 * The removal seam has to prove a NEGATIVE — that no connection references the system — and there is
 * no index that answers "connections touching system X" directly. Rather than range the whole map
 * unbounded, it reads one row past this cap and fails closed, so a fixture can never become an
 * unbounded scan on a large map.
 */
export const FIXTURE_CONNECTION_SCAN_LIMIT = 128;

/**
 * The connection (if any) still referencing one system, under the bounded
 * scan. One row past the cap: a full page means the map is too big for this
 * seam to prove the negative, so it refuses instead of silently checking a
 * prefix. Shared by every removal seam that must prove orphanhood.
 */
async function findReferencingConnection(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
) {
  const connections = await ctx.db
    .query('mapConnections')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .take(FIXTURE_CONNECTION_SCAN_LIMIT + 1);

  if (connections.length > FIXTURE_CONNECTION_SCAN_LIMIT) {
    throw new ConvexError({
      code: 'FIXTURE_MAP_TOO_LARGE',
      detail: `Map ${mapId} exceeds the ${FIXTURE_CONNECTION_SCAN_LIMIT}-connection fixture removal bound.`,
    });
  }

  return (
    connections.find(
      (connection) =>
        connection.fromSystemId === systemId || connection.toSystemId === systemId,
    ) ?? null
  );
}

/**
 * Removes one placed system from one map, refusing while any connection still references it.
 *
 * This is a departure seam for tests and the local demo, not an authoring surface: 4.0.4.4 owns real
 * deletion. It refuses rather than cascading because a cascade would make one fixture call emit
 * several unrelated departures, which is precisely the merge behavior the reconciler's tests need to
 * observe separately. The one sanctioned pairing — a collapse removing a severed connection with its
 * now-orphaned system — is {@link collapseJumpFixture}, deliberate and singular.
 *
 * Returns `unchanged` with no write when the system is not on the map, so a repeated removal is
 * idempotent and cannot invalidate anything watching the map.
 */
export const removeSystemFixture = internalMutation({
  args: { mapId: v.string(), systemId: v.number() },
  handler: async (ctx, { mapId, systemId }): Promise<'removed' | 'unchanged'> => {
    const existing = await findSystem(ctx, mapId, systemId);
    if (existing === null) return 'unchanged';

    const referencing = await findReferencingConnection(ctx, mapId, systemId);
    if (referencing !== null) {
      throw new ConvexError({
        code: 'SYSTEM_IN_USE',
        detail: `System ${systemId} still has a connection on map ${mapId}.`,
      });
    }

    await ctx.db.delete(existing._id);
    return 'removed';
  },
});

/**
 * One wormhole collapse, atomically: severs a connection and removes the
 * system it had discovered in a single transaction.
 *
 * The departure mirror of {@link placeJumpFixture}, for the same reason: every
 * system in the game exists forever — only connections change — so when the
 * hole collapses, the far side is unreachable and must leave the map WITH the
 * severed connection. Two separate transactions would let the canvas witness
 * an orphaned system for a merge (re-laid out unattached, then departing). The
 * production auto-mapper must express collapses through this same
 * one-transaction shape.
 *
 * The system must be orphaned once this connection is gone: a remaining
 * reference means the caller is collapsing the wrong hole, and the whole
 * transaction (including the connection delete) rolls back on the thrown
 * error. Both halves are idempotent, so a repeated collapse is `unchanged`.
 */
export const collapseJumpFixture = internalMutation({
  args: {
    mapId: v.string(),
    connectionId: v.id('mapConnections'),
    systemId: v.number(),
  },
  handler: async (
    ctx,
    { mapId, connectionId, systemId },
  ): Promise<'removed' | 'unchanged'> => {
    const connection = await ctx.db.get(connectionId);
    if (connection !== null) {
      // The pairing must be proven, not assumed: the connection has to belong
      // to THIS map and actually join the system being removed, or one call
      // could mutate two maps / two unrelated chain regions in one
      // transaction — exactly the cross-boundary write the module's typed
      // ownership checks exist to prevent.
      if (
        connection.mapId !== mapId
        || (connection.fromSystemId !== systemId && connection.toSystemId !== systemId)
      ) {
        throw new ConvexError({
          code: 'WRONG_CONNECTION',
          detail: `Connection ${connectionId} does not join system ${systemId} on map ${mapId}.`,
        });
      }
      await ctx.db.delete(connectionId);
    }

    const system = await findSystem(ctx, mapId, systemId);
    if (system === null) return connection === null ? 'unchanged' : 'removed';

    const referencing = await findReferencingConnection(ctx, mapId, systemId);
    if (referencing !== null) {
      throw new ConvexError({
        code: 'SYSTEM_IN_USE',
        detail: `System ${systemId} still has a connection on map ${mapId}.`,
      });
    }

    await ctx.db.delete(system._id);
    return 'removed';
  },
});

/**
 * Removes one connection document by ID, leaving both endpoint systems in place.
 *
 * The companion departure seam to {@link insertConnectionFixture}, and the cheaper of the two: a
 * connection owns no dependents, so this is an unconditional delete. Returns `unchanged` with no
 * write when the document is already gone, keeping a repeated removal idempotent.
 */
export const removeConnectionFixture = internalMutation({
  args: { connectionId: v.id('mapConnections') },
  handler: async (ctx, { connectionId }): Promise<'removed' | 'unchanged'> => {
    const existing = await ctx.db.get(connectionId);
    if (existing === null) return 'unchanged';

    await ctx.db.delete(connectionId);
    return 'removed';
  },
});

/**
 * Inserts one user-authored note against a validated target.
 *
 * A map note repeats its own map ID as the target; a system or signature note is admitted only after
 * one typed `db.get` proves that document exists AND belongs to this map. Without that check a note
 * could be attached across map boundaries, which the gate alone would never catch.
 */
export const insertNoteFixture = internalMutation({
  args: {
    mapId: v.string(),
    targetKind: noteTargetKindValidator,
    targetId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireNoteTarget(ctx, args.mapId, args.targetKind, args.targetId);
    return await ctx.db.insert('mapNotes', args);
  },
});

/** Proves one note target exists and belongs to the same map, rejecting anything else. */
async function requireNoteTarget(
  ctx: MutationCtx,
  mapId: string,
  targetKind: NoteTargetKind,
  targetId: string,
): Promise<void> {
  if (targetKind === 'map') {
    if (targetId !== mapId) {
      throw new ConvexError({
        code: 'INVALID_NOTE_TARGET',
        detail: 'A map note must target its own map.',
      });
    }
    return;
  }

  const table = targetKind === 'system' ? 'mapSystems' : 'mapSignatures';
  const id = ctx.db.normalizeId(table, targetId);
  const target = id === null ? null : await ctx.db.get(id);
  if (target === null || target.mapId !== mapId) {
    throw new ConvexError({
      code: 'INVALID_NOTE_TARGET',
      detail: `No ${targetKind} ${targetId} on map ${mapId}.`,
    });
  }
}

/**
 * Records one signature observation through the single merge contract.
 *
 * An observation is PARTIAL EVIDENCE, never a complete snapshot of a system: this accepts only the
 * rows actually present, keyed by (mapId, systemId, signatureId), so an omitted ID performs no write
 * and can never be read as a despawn. Absence is not evidence — the EVE client can hide filtered
 * results — so nothing here tombstones anything.
 *
 * Returns the merge outcome so a caller can distinguish a real conflict from a no-op.
 */
export const upsertSignatureObservation = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    group: v.union(v.string(), v.null()),
    typeName: v.union(v.string(), v.null()),
    wormholeTypeCode: wormholeTypeCodeValidator,
  },
  handler: async (ctx, args) => {
    requireSystemId(args.systemId);
    if ((await findSystem(ctx, args.mapId, args.systemId)) === null) {
      throw new ConvexError({
        code: 'UNKNOWN_SYSTEM',
        detail: `System ${args.systemId} is not on map ${args.mapId}.`,
      });
    }

    const signatureId = args.signatureId.trim();
    if (signatureId === '') {
      throw new ConvexError({
        code: 'INVALID_SIGNATURE_ID',
        detail: 'A signature ID must be non-empty.',
      });
    }

    const knowledge = normalizeSignatureKnowledge(args);
    validateSignatureKnowledge(knowledge);

    const key = { mapId: args.mapId, systemId: args.systemId, signatureId };
    const existing = await findSignature(ctx, key);

    if (existing === null) {
      await ctx.db.insert('mapSignatures', {
        ...key,
        ...knowledge,
        deletedAt: null,
        purgeAfter: null,
      });
      await touchSignatureActivity(ctx, key);
      return { outcome: 'inserted' as const };
    }

    // A tombstoned signature is deliberately inert: an ordinary observation must not silently
    // resurrect a row a user chose to remove, and it writes no activity either.
    if (existing.deletedAt !== null) return { outcome: 'tombstoned' as const };

    const merged = mergeSignatureKnowledge(existing, knowledge);
    if (merged.outcome === 'enriched') await ctx.db.patch(existing._id, merged.patch);
    await touchSignatureActivity(ctx, key);
    return merged;
  },
});

/** One signature's stable identity within a map. */
interface SignatureKey {
  readonly mapId: string;
  readonly systemId: number;
  readonly signatureId: string;
}

/** The one exact indexed signature lookup; no path scans for missing IDs. */
function findSignature(ctx: MutationCtx, key: SignatureKey) {
  return ctx.db
    .query('mapSignatures')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', key.mapId).eq('systemId', key.systemId).eq('signatureId', key.signatureId),
    )
    .unique();
}

/** The matching activity lookup. Kept separate from the payload read set on purpose. */
function findSignatureActivity(ctx: MutationCtx, key: SignatureKey) {
  return ctx.db
    .query('mapSignatureActivity')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', key.mapId).eq('systemId', key.systemId).eq('signatureId', key.signatureId),
    )
    .unique();
}

/**
 * Stale-gated last-seen bookkeeping, stamped from SERVER time so no caller can backdate or advance
 * it. A first sighting inserts; a later one patches ONLY once the server clock is at least
 * {@link SIGNATURE_ACTIVITY_STALE_MS} past the stored value. A sub-threshold sighting writes nothing
 * at all — no write means no re-read and no fan-out, which is the whole point of keeping this off
 * the payload document.
 */
async function touchSignatureActivity(
  ctx: MutationCtx,
  key: SignatureKey,
): Promise<'inserted' | 'patched' | 'unchanged'> {
  const observedAt = Date.now();
  const existing = await findSignatureActivity(ctx, key);
  if (existing === null) {
    await ctx.db.insert('mapSignatureActivity', { ...key, lastSeenAt: observedAt });
    return 'inserted';
  }
  if (observedAt - existing.lastSeenAt < SIGNATURE_ACTIVITY_STALE_MS) return 'unchanged';
  await ctx.db.patch(existing._id, { lastSeenAt: observedAt });
  return 'patched';
}

/**
 * Records that a signature was seen again, with no claim about its payload. This is the pure
 * bookkeeping path: it can only ever touch mapSignatureActivity.
 *
 * It normalizes and resolves the key exactly as an observation does, and writes only for a live
 * signature. Without that, a sighting after a tombstone would insert an activity row that nothing
 * can ever reclaim — the cleanup owner deliberately performs no companion lookup, so the companion
 * is only ever deleted at tombstone time.
 */
export const recordSignatureSeen = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
  },
  handler: async (ctx, args) => {
    const key = { ...args, signatureId: args.signatureId.trim() };
    const signature = await findSignature(ctx, key);
    if (signature === null || signature.deletedAt !== null) return 'unchanged' as const;
    return await touchSignatureActivity(ctx, key);
  },
});

/**
 * Applies or reverses one signature tombstone.
 *
 * Reversible by design: the payload never leaves the document, so a restore recovers the row
 * unchanged — including its `_id` and `_creationTime` — instead of rebuilding it from a copy that
 * would become a second owner of the same state. Tombstoning deletes the activity companion once,
 * here, which is exactly what lets the bounded cleanup avoid a per-row companion lookup later.
 *
 * The caller-owned undo duration is deliberately not decided here; Session 4.0.4.3.1 owns it.
 */
export const setSignatureTombstone = internalMutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    deletedAt: v.union(v.number(), v.null()),
    purgeAfter: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { deletedAt, purgeAfter, ...key }) => {
    requireTombstonePair(deletedAt, purgeAfter);

    const signature = await findSignature(ctx, key);
    if (signature === null) {
      throw new ConvexError({
        code: 'UNKNOWN_SIGNATURE',
        detail: `No signature ${key.signatureId} on map ${key.mapId}.`,
      });
    }

    // Already in the target state: write nothing. mapSignatures is a watched payload table, and
    // Convex re-reads a subscription's whole page on ANY write to it — changed or not — so a
    // repeated tombstone or a restore of an active row would fan a no-op out to every scout.
    if (signature.deletedAt === deletedAt && signature.purgeAfter === purgeAfter) {
      return { tombstoned: deletedAt !== null };
    }

    await ctx.db.patch(signature._id, { deletedAt, purgeAfter });

    if (deletedAt !== null) {
      const activity = await findSignatureActivity(ctx, key);
      if (activity !== null) await ctx.db.delete(activity._id);
    }
    return { tombstoned: deletedAt !== null };
  },
});

/** Both tombstone timestamps are absent together, or present together and correctly ordered. */
function requireTombstonePair(deletedAt: number | null, purgeAfter: number | null): void {
  if (deletedAt === null && purgeAfter === null) return;
  const paired =
    deletedAt !== null
    && purgeAfter !== null
    && Number.isFinite(deletedAt)
    && Number.isFinite(purgeAfter)
    && purgeAfter > deletedAt;
  if (!paired) {
    throw new ConvexError({
      code: 'INVALID_TOMBSTONE',
      detail: 'deletedAt and purgeAfter must both be null, or both finite with purgeAfter later.',
    });
  }
}

/**
 * Drains expired signature tombstones in one bounded batch, reporting whether another call is
 * required. Capped at {@link SIGNATURE_PURGE_BATCH}; the cleanup core owns the index range.
 */
export const purgeExpiredSignatureTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredSignatures(ctx, Date.now()),
});

/** Re-exported so the proof suite pins the same cap the cleanup owner enforces. */
export { SIGNATURE_PURGE_BATCH };
