// Internal tracked-location fixtures: seed/advance subscribed location
// evidence and stamp the owner's characterLocation subject freshness.
import { ConvexError, v } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import { internalMutation, type MutationCtx } from './_generated/server';
import { clearCoverageForUser, findCoverage } from './lib/locationCoverage';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';
import { getSyncSubject, newIdleSubject } from './lib/subjects';

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

async function stampSubjectFreshness(
  ctx: MutationCtx,
  userId: string,
  characterId: number,
  lastFinishedAt: number,
): Promise<void> {
  const subject = await getSyncSubject(ctx.db, 'characterLocation', userId);
  if (subject !== null) {
    const covered = subject.coveredCharacterIds ?? [];
    await ctx.db.patch('syncSubjects', subject._id, {
      lastFinishedAt,
      coveredCharacterIds: covered.includes(characterId)
        ? covered
        : [...covered, characterId],
    });
    await stampCoverage(ctx, userId, characterId);
    return;
  }
  await ctx.db.insert('syncSubjects', {
    ...newIdleSubject('characterLocation', userId),
    lastFinishedAt,
    coveredCharacterIds: [characterId],
  });
  await stampCoverage(ctx, userId, characterId);
}

async function stampCoverage(
  ctx: MutationCtx,
  userId: string,
  characterId: number,
): Promise<void> {
  const held = await findCoverage(ctx, userId, characterId);
  if (held === null) {
    await ctx.db.insert('characterLocationCovered', { userId, characterId });
  }
}

export const clearTrackedCoverage = internalMutation({
  args: {
    userId: v.string(),
    characterId: v.optional(v.number()),
  },
  handler: async (ctx, { userId, characterId }) => {
    if (characterId === undefined) {
      await clearCoverageForUser(ctx, userId);
      return;
    }
    const held = await findCoverage(ctx, userId, characterId);
    if (held !== null) await ctx.db.delete(held._id);
  },
});

const trackedLocationFixtureResult = v.object({
  trackingId: v.id('mapTracking'),
  locationId: v.id('characterLocation'),
  fromSolarSystemId: v.union(v.number(), v.null()),
  toSolarSystemId: v.number(),
  transitionObservedAt: v.number(),
});

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
      args.characterId,
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
      args.characterId,
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
