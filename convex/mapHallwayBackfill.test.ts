import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import { blankHallway } from '@/data/maps/connection-hallway';
import { convexTest } from 'convex-test';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { connectionInsert } from './__tests__/connection-doc.setup';
import { modules } from './__tests__/modules.setup';
import {
  connectionDoorSideValidator,
  connectionDoorValidator,
  connectionIdentityValidator,
  connectionLifetimeValidator,
  connectionProvenanceValidator,
  connectionResolutionValidator,
  connectionTombstoneValidator,
  destinationHintValidator,
  lifeStageValidator,
  massStateValidator,
  optionalTimestampValidator,
  shipSizeValidator,
  wormholeTypeCodeValidator,
} from './lib/mapEntityContracts';
import { HALLWAY_BACKFILL_BATCH } from './mapHallwayBackfill';
import schema from './schema';

const expandedSchema = defineSchema({
  mapConnections: defineTable({
    mapId: v.string(),
    fromSystemId: v.number(),
    toSystemId: v.union(v.number(), v.null()),
    wormholeTypeCode: v.optional(wormholeTypeCodeValidator),
    massState: massStateValidator,
    shipSize: shipSizeValidator,
    eolAt: v.optional(v.union(v.number(), v.null())),
    fromSignatureId: v.optional(v.string()),
    toSignatureId: v.optional(v.string()),
    fromWormholeTypeCode: v.optional(wormholeTypeCodeValidator),
    toWormholeTypeCode: v.optional(wormholeTypeCodeValidator),
    typedSide: v.optional(connectionDoorSideValidator),
    fromDestinationHint: v.optional(destinationHintValidator),
    toDestinationHint: v.optional(destinationHintValidator),
    fromDestinationSystemId: v.optional(v.number()),
    toDestinationSystemId: v.optional(v.number()),
    typeProvenance: v.optional(connectionProvenanceValidator),
    destinationProvenance: v.optional(connectionProvenanceValidator),
    observedMassKg: v.optional(v.number()),
    observedMassAtStateKg: v.optional(v.number()),
    observationKey: v.optional(v.string()),
    pendingCandidates: v.optional(v.array(v.id('mapConnections'))),
    pendingResolutionCharacterId: v.optional(v.number()),
    fromSignalPct: v.optional(v.union(v.number(), v.null())),
    firstSeenAt: v.optional(v.number()),
    lifeStage: v.optional(lifeStageValidator),
    lifeStageObservedAt: optionalTimestampValidator,
    deathEarliestAt: optionalTimestampValidator,
    deathLatestAt: optionalTimestampValidator,
    deletedAt: optionalTimestampValidator,
    purgeAfter: optionalTimestampValidator,
    from: v.optional(connectionDoorValidator),
    to: v.optional(connectionDoorValidator),
    identity: v.optional(connectionIdentityValidator),
    lifetime: v.optional(connectionLifetimeValidator),
    resolution: v.optional(connectionResolutionValidator),
    tombstone: v.optional(connectionTombstoneValidator),
  })
    .index('by_map', ['mapId'])
    .index('by_map_from', ['mapId', 'fromSystemId'])
    .index('by_map_to', ['mapId', 'toSystemId'])
    .index('by_deleted_death_latest', ['deletedAt', 'deathLatestAt'])
    .index('by_purge_after', ['purgeAfter']),
});

const LIVE_FLAT = {
  mapId: 'map-a',
  fromSystemId: 30_000_142,
  toSystemId: 30_000_144,
  wormholeTypeCode: 'C247',
  fromWormholeTypeCode: 'C247',
  toWormholeTypeCode: 'K162',
  eolAt: 1_700_000_000_000,
  massState: 'reduced' as const,
  shipSize: 'M' as const,
  lifeStage: 'under_4_hours' as const,
  deletedAt: null as number | null,
  purgeAfter: null as number | null,
};

describe('backfillHallwayConnections', () => {
  it('rewrites live and tombstoned flat rows and skips nested hallways', async () => {
    const t = convexTest(expandedSchema, modules);
    const deletedAt = 1_800_000_000_000;
    const ids = await t.run(async (ctx) => {
      const liveId = await ctx.db.insert('mapConnections', LIVE_FLAT);
      const tombId = await ctx.db.insert('mapConnections', {
        ...LIVE_FLAT,
        mapId: 'map-b',
        fromSystemId: 31_000_001,
        toSystemId: null,
        deletedAt,
        purgeAfter: deletedAt + 1,
      });
      const nestedId = await ctx.db.insert(
        'mapConnections',
        connectionInsert({
          mapId: 'map-c',
          fromSystemId: 32_000_001,
          toSystemId: 32_000_002,
        }),
      );
      return { liveId, tombId, nestedId };
    });

    await expect(
      t.mutation(internal.mapHallwayBackfill.backfillHallwayConnections, {}),
    ).resolves.toEqual({ rewritten: 2, skipped: 1, hasMore: false });

    const stored = await t.run(async (ctx) => ({
      live: await ctx.db.get(ids.liveId),
      tomb: await ctx.db.get(ids.tombId),
      nested: await ctx.db.get(ids.nestedId),
    }));
    const blankLive = blankHallway({
      mapId: 'map-a',
      fromSystemId: 30_000_142,
      toSystemId: 30_000_144,
    });

    expect(stored.live).toMatchObject({
      mapId: 'map-a',
      fromSystemId: 30_000_142,
      toSystemId: 30_000_144,
      from: blankLive.from,
      to: blankLive.to,
      identity: { kind: 'unknown' },
      lifetime: { kind: 'unknown' },
      resolution: { kind: 'open' },
      tombstone: { kind: 'live' },
      massState: 'reduced',
      shipSize: 'M',
    });
    expect(stored.live).not.toHaveProperty('eolAt');
    expect(stored.live).not.toHaveProperty('fromWormholeTypeCode');
    expect(stored.live).not.toHaveProperty('wormholeTypeCode');
    expect(stored.live).not.toHaveProperty('deletedAt');
    expect(stored.tomb?.tombstone).toEqual({
      kind: 'removed',
      deletedAt,
      purgeAfter: deletedAt + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    expect(stored.nested?.from).toEqual(
      connectionInsert({
        mapId: 'map-c',
        fromSystemId: 32_000_001,
        toSystemId: 32_000_002,
      }).from,
    );

    await expect(
      t.mutation(internal.mapHallwayBackfill.backfillHallwayConnections, {}),
    ).resolves.toEqual({ rewritten: 0, skipped: 3, hasMore: false });
  });

  it('skips contracted hallway rows', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'mapConnections',
        connectionInsert({
          mapId: 'map-nested',
          fromSystemId: 30_000_142,
          toSystemId: 30_000_144,
        }),
      );
    });
    await expect(
      t.mutation(internal.mapHallwayBackfill.backfillHallwayConnections, {}),
    ).resolves.toEqual({ rewritten: 0, skipped: 1, hasMore: false });
    expect(HALLWAY_BACKFILL_BATCH).toBe(32);
  });
});
