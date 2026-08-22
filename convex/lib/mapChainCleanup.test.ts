// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internal } from '../_generated/api';
import { MAP_EVENT_RETENTION_MS } from '@/data/maps/chain-events';
import schema from '../schema';

import { modules } from '../__tests__/modules.setup';

const NOW = 1_800_000_000_000;
const MAP_ID = 'map-cleanup';
const ROOT = 31_000_001;
const LIVE_ISLAND = 31_000_002;
const DANGLING = 31_000_003;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('map chain cleanup', () => {
  it('clears live-endpoint skeletons and deletes dangling ties and expired events', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', {
        mapId: MAP_ID,
        systemId: ROOT,
        deletedAt: null,
        purgeAfter: null,
      });
      await ctx.db.insert('mapSystems', {
        mapId: MAP_ID,
        systemId: LIVE_ISLAND,
        deletedAt: null,
        purgeAfter: null,
      });
      await ctx.db.insert('mapSystems', {
        mapId: MAP_ID,
        systemId: DANGLING,
        deletedAt: NOW - 2_000,
        purgeAfter: NOW - 1_000,
      });
      const retainedConnection = await ctx.db.insert('mapConnections', {
        mapId: MAP_ID,
        fromSystemId: ROOT,
        toSystemId: LIVE_ISLAND,
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: NOW - 2_000,
        purgeAfter: NOW - 1_000,
      });
      const danglingConnection = await ctx.db.insert('mapConnections', {
        mapId: MAP_ID,
        fromSystemId: ROOT,
        toSystemId: DANGLING,
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: NOW - 2_000,
        purgeAfter: NOW - 1_000,
      });
      const unresolvedConnection = await ctx.db.insert('mapConnections', {
        mapId: MAP_ID,
        fromSystemId: ROOT,
        toSystemId: null,
        fromSignatureId: 'ABC-123',
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: NOW - 2_000,
        purgeAfter: NOW - 1_000,
      });
      const expiredEvent = await ctx.db.insert('mapEvents', {
        mapId: MAP_ID,
        at: NOW - MAP_EVENT_RETENTION_MS - 1,
        kind: 'connection_restored',
        actor: 'Editor',
        payload: { connectionId: String(retainedConnection) },
        purgeAfter: NOW - 1,
      });
      const liveEvent = await ctx.db.insert('mapEvents', {
        mapId: MAP_ID,
        at: NOW,
        kind: 'connection_restored',
        actor: 'Editor',
        payload: { connectionId: String(retainedConnection) },
        purgeAfter: NOW + MAP_EVENT_RETENTION_MS,
      });
      return {
        retainedConnection,
        danglingConnection,
        unresolvedConnection,
        expiredEvent,
        liveEvent,
      };
    });

    const result = await t.mutation(
      internal.mapAuthoring.purgeExpiredChainTombstones,
      {},
    );
    expect(result).toEqual({
      deletedSystems: 1,
      deletedConnections: 2,
      retainedConnections: 1,
      deletedEvents: 1,
      hasMore: false,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(ids.retainedConnection))).toMatchObject({
      deletedAt: NOW - 2_000,
      purgeAfter: null,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(ids.danglingConnection))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(ids.unresolvedConnection))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(ids.expiredEvent))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(ids.liveEvent))).not.toBeNull();
  });

  it('purges connections and events even under a full system-tombstone backlog', async () => {
    const { CHAIN_PURGE_BATCH } = await import('./mapChainCleanup');
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      for (let index = 0; index <= CHAIN_PURGE_BATCH; index += 1) {
        await ctx.db.insert('mapSystems', {
          mapId: MAP_ID,
          systemId: 31_100_000 + index,
          deletedAt: NOW - 2_000,
          purgeAfter: NOW - 1_000,
        });
      }
      const danglingConnection = await ctx.db.insert('mapConnections', {
        mapId: MAP_ID,
        fromSystemId: ROOT,
        toSystemId: DANGLING,
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: NOW - 2_000,
        purgeAfter: NOW - 1_000,
      });
      const expiredEvent = await ctx.db.insert('mapEvents', {
        mapId: MAP_ID,
        at: NOW - MAP_EVENT_RETENTION_MS - 1,
        kind: 'connection_restored',
        actor: 'Editor',
        payload: { connectionId: String(danglingConnection) },
        purgeAfter: NOW - 1,
      });
      return { danglingConnection, expiredEvent };
    });

    const result = await t.mutation(
      internal.mapAuthoring.purgeExpiredChainTombstones,
      {},
    );
    expect(result).toEqual({
      deletedSystems: CHAIN_PURGE_BATCH,
      deletedConnections: 1,
      retainedConnections: 0,
      deletedEvents: 1,
      hasMore: true,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(ids.danglingConnection))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(ids.expiredEvent))).toBeNull();
    // The persisted boundary, not just the counters: exactly the one
    // over-batch system survives the bounded pass.
    const remainingSystems = await t.run(async (ctx) =>
      await ctx.db.query('mapSystems').collect(),
    );
    expect(remainingSystems).toHaveLength(1);
  });

  it('registers the bounded purge on the production Convex cron registry', () => {
    const source = readFileSync('convex/crons.ts', 'utf8');
    expect(source).toContain("'map chain purge'");
    expect(source).toContain('internal.mapAuthoring.purgeExpiredChainTombstones');
  });
});
