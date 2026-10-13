// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internal } from '../_generated/api';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import { MAP_EVENT_RETENTION_MS } from '@/data/maps/chain-events';
import schema from '../schema';

import { modules } from '../__tests__/modules.setup';
import { connectionInsert } from '../__tests__/connection-doc.setup';
import { type Chain } from '../__tests__/convexTest.setup';

const NOW = 1_800_000_000_000;
const MAP_ID = 'map-cleanup';
const ROOT = 31_000_001;
const LIVE_ISLAND = 31_000_002;
const DANGLING = 31_000_003;
const LOOP = 31_000_004;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});


function liveSystem(systemId: number) {
  return { mapId: MAP_ID, systemId, deletedAt: null, purgeAfter: null };
}

function connection(
  fromSystemId: number,
  toSystemId: number | null,
  removed: { deletedAt: number; purgeAfter: number | null } | null,
) {
  return connectionInsert({
    mapId: MAP_ID,
    fromSystemId,
    toSystemId,
    ...(toSystemId === null ? { fromSignatureId: 'ABC-123' } : {}),
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    deletedAt: removed?.deletedAt ?? null,
    purgeAfter: removed?.purgeAfter ?? null,
  });
}

const EXPIRED = { deletedAt: NOW - 2_000, purgeAfter: NOW - 1_000 };

function signatureRow(systemId: number, signatureId: string) {
  return {
    mapId: MAP_ID,
    systemId,
    signatureId,
    group: 'wormhole',
    typeName: null,
    wormholeTypeCode: null,
    deletedAt: null,
    purgeAfter: null,
  };
}

function purge(t: Chain) {
  return t.mutation(internal.mapChainCleanup.purgeExpiredChainTombstones, {});
}

function get<T extends 'mapSystems' | 'mapConnections'>(t: Chain, id: import('../_generated/dataModel').Id<T>) {
  return t.run(async (ctx) => await ctx.db.get(id));
}

describe('map chain cleanup', () => {
  it('removes a cut-off branch, drops dangling ties and expired events', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', liveSystem(ROOT));
      const island = await ctx.db.insert('mapSystems', liveSystem(LIVE_ISLAND));
      await ctx.db.insert('mapSystems', { ...liveSystem(DANGLING), ...EXPIRED });
      const cut = await ctx.db.insert('mapConnections', connection(ROOT, LIVE_ISLAND, EXPIRED));
      const dangling = await ctx.db.insert('mapConnections', connection(ROOT, DANGLING, EXPIRED));
      const unresolved = await ctx.db.insert('mapConnections', connection(ROOT, null, EXPIRED));
      const expiredEvent = await ctx.db.insert('mapEvents', {
        mapId: MAP_ID,
        at: NOW - MAP_EVENT_RETENTION_MS - 1,
        kind: 'connection_restored',
        actor: 'Editor',
        payload: { connectionId: String(cut) },
        purgeAfter: NOW - 1,
      });
      const liveEvent = await ctx.db.insert('mapEvents', {
        mapId: MAP_ID,
        at: NOW,
        kind: 'connection_restored',
        actor: 'Editor',
        payload: { connectionId: String(cut) },
        purgeAfter: NOW + MAP_EVENT_RETENTION_MS,
      });
      return { island, cut, dangling, unresolved, expiredEvent, liveEvent };
    });

    await expect(purge(t)).resolves.toEqual({
      deletedSystems: 1,
      deletedSystemChildren: 0,
      deletedConnections: 2,
      removedBranches: 1,
      heldConnections: 0,
      retryConnections: 0,
      deletedEvents: 1,
      hasMore: false,
    });
    // The cut-off island is removed like a sever, with its own undo window.
    expect(await get(t, ids.island)).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    expect(await get(t, ids.cut)).toMatchObject({
      tombstone: { kind: 'removed', deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
    });
    expect(await get(t, ids.dangling)).toBeNull();
    expect(await get(t, ids.unresolved)).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(ids.expiredEvent))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(ids.liveEvent))).not.toBeNull();
    const events = await t.run(async (ctx) => await ctx.db.query('mapEvents').collect());
    expect(events.map((event) => event.kind)).toContain('branch_removed');
  });

  it('keeps an expired sibling rearmed by an earlier settlement until the new undo window ends', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', liveSystem(ROOT));
      const island = await ctx.db.insert('mapSystems', liveSystem(LIVE_ISLAND));
      const cut = await ctx.db.insert('mapConnections', connection(ROOT, LIVE_ISLAND, EXPIRED));
      const sibling = await ctx.db.insert('mapConnections', connection(ROOT, LIVE_ISLAND, EXPIRED));
      return { island, cut, sibling };
    });

    await expect(purge(t)).resolves.toMatchObject({
      deletedConnections: 0,
      removedBranches: 1,
      hasMore: false,
    });
    expect(await get(t, ids.island)).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    expect(await get(t, ids.cut)).toMatchObject({
      tombstone: { kind: 'removed', deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
    });
    expect(await get(t, ids.sibling)).toMatchObject({
      tombstone: {
        kind: 'removed',
        deletedAt: EXPIRED.deletedAt,
        purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
      },
    });
    await expect(purge(t)).resolves.toMatchObject({
      deletedConnections: 0,
      removedBranches: 0,
      hasMore: false,
    });

    vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS + 1);
    await expect(purge(t)).resolves.toMatchObject({
      deletedSystems: 1,
      deletedConnections: 2,
      removedBranches: 0,
      hasMore: false,
    });
    expect(await get(t, ids.island)).toBeNull();
    expect(await get(t, ids.cut)).toBeNull();
    expect(await get(t, ids.sibling)).toBeNull();
  });

  it('deletes a removed connection whose systems are still linked another way', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      for (const systemId of [ROOT, LIVE_ISLAND, LOOP]) await ctx.db.insert('mapSystems', liveSystem(systemId));
      await ctx.db.insert('mapConnections', connection(ROOT, LOOP, null));
      await ctx.db.insert('mapConnections', connection(LOOP, LIVE_ISLAND, null));
      const loopEdge = await ctx.db.insert('mapConnections', connection(ROOT, LIVE_ISLAND, EXPIRED));
      return { loopEdge };
    });

    await expect(purge(t)).resolves.toMatchObject({ deletedConnections: 1, removedBranches: 0 });
    expect(await get(t, ids.loopEdge)).toBeNull();
    const systems = await t.run(async (ctx) => await ctx.db.query('mapSystems').collect());
    expect(systems.every((system) => system.deletedAt === null)).toBe(true);
  });

  it('holds a branch with a tracked pilot inside and checks again the next day', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', liveSystem(ROOT));
      const island = await ctx.db.insert('mapSystems', liveSystem(LIVE_ISLAND));
      const cut = await ctx.db.insert('mapConnections', connection(ROOT, LIVE_ISLAND, EXPIRED));
      await ctx.db.insert('mapTracking', { mapId: MAP_ID, userId: 'pilot-user', characterId: 90_000_001 });
      await ctx.db.insert('characterLocation', {
        userId: 'pilot-user',
        characterId: 90_000_001,
        solarSystemId: LIVE_ISLAND,
        stationId: null,
        structureId: null,
        shipTypeId: null,
        prevSolarSystemId: null,
        prevFresh: false,
        observedAt: NOW - 60_000,
        etagLocation: null,
        etagShip: null,
      });
      return { island, cut };
    });

    await expect(purge(t)).resolves.toMatchObject({ heldConnections: 1, removedBranches: 0 });
    expect(await get(t, ids.island)).toMatchObject({ deletedAt: null });
    expect(await get(t, ids.cut)).toMatchObject({
      tombstone: { kind: 'removed', deletedAt: EXPIRED.deletedAt, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
    });

    // The pilot leaves; the next day's purge removes the branch.
    await t.run(async (ctx) => {
      const tracking = await ctx.db.query('mapTracking').collect();
      for (const row of tracking) await ctx.db.delete(row._id);
    });
    vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS + 1);
    await expect(purge(t)).resolves.toMatchObject({ removedBranches: 1 });
    expect(await get(t, ids.island)).toMatchObject({ deletedAt: NOW + MAP_CHAIN_UNDO_WINDOW_MS + 1 });
  });

  it('preserves a failed settlement for a later daily attempt instead of abandoning its live branch', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', liveSystem(ROOT));
      const island = await ctx.db.insert('mapSystems', liveSystem(LIVE_ISLAND));
      const fillers = [];
      for (let index = 0; index < 127; index += 1) {
        fillers.push(await ctx.db.insert('mapSystems', liveSystem(31_100_000 + index)));
      }
      const cut = await ctx.db.insert('mapConnections', connection(ROOT, LIVE_ISLAND, EXPIRED));
      return { island, cut, fillers };
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(purge(t)).resolves.toMatchObject({
        deletedConnections: 0, removedBranches: 0, heldConnections: 0, retryConnections: 1, hasMore: false,
      });
      expect(error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('MAP_TOO_LARGE'));
      expect(await get(t, ids.cut)).toMatchObject({
        tombstone: { kind: 'removed', deletedAt: EXPIRED.deletedAt, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
      });
      expect(await get(t, ids.island)).toMatchObject({ deletedAt: null, purgeAfter: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(error).toHaveBeenCalledOnce();

      await t.run(async (ctx) => {
        for (const id of ids.fillers) await ctx.db.delete(id);
      });
      vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS + 1);
      await expect(purge(t)).resolves.toMatchObject({ removedBranches: 1, hasMore: false });
      expect(await get(t, ids.island)).toMatchObject({ deletedAt: NOW + MAP_CHAIN_UNDO_WINDOW_MS + 1 });
      expect(await get(t, ids.cut)).toMatchObject({
        tombstone: { kind: 'removed', purgeAfter: NOW + 2 * MAP_CHAIN_UNDO_WINDOW_MS + 1 },
      });
    } finally {
      error.mockRestore();
    }
  });

  it('continues past sixteen failed oldest settlements to settle a healthy map in the same daily run', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', liveSystem(ROOT));
      await ctx.db.insert('mapSystems', liveSystem(LIVE_ISLAND));
      for (let index = 0; index < 127; index += 1) {
        await ctx.db.insert('mapSystems', liveSystem(31_100_000 + index));
      }
      const failedCuts = [];
      for (let index = 0; index < 16; index += 1) {
        failedCuts.push(await ctx.db.insert('mapConnections', connection(ROOT, LIVE_ISLAND, EXPIRED)));
      }
      const healthyMap = 'healthy-map';
      await ctx.db.insert('mapSystems', { ...liveSystem(ROOT), mapId: healthyMap });
      const island = await ctx.db.insert('mapSystems', { ...liveSystem(LIVE_ISLAND), mapId: healthyMap });
      const cut = await ctx.db.insert('mapConnections', { ...connection(ROOT, LIVE_ISLAND, EXPIRED), mapId: healthyMap });
      return { failedCuts, island, cut };
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(purge(t)).resolves.toMatchObject({ deletedConnections: 0, removedBranches: 0, retryConnections: 16, hasMore: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(error).toHaveBeenCalledTimes(16);
      expect(await get(t, ids.cut)).toMatchObject({ tombstone: { purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS } });
      expect(await get(t, ids.island)).toMatchObject({ deletedAt: NOW });
      for (const id of ids.failedCuts) {
        expect(await get(t, id)).toMatchObject({
          tombstone: { kind: 'removed', deletedAt: EXPIRED.deletedAt, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
        });
      }
    } finally {
      error.mockRestore();
    }
  });

  it('deletes a purged system\'s signatures and activity with it', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { ...liveSystem(DANGLING), ...EXPIRED });
      await ctx.db.insert('mapSystems', liveSystem(ROOT));
      for (const systemId of [DANGLING, ROOT]) {
        await ctx.db.insert('mapSignatures', signatureRow(systemId, 'ABC-123'));
        await ctx.db.insert('mapSignatureActivity', {
          mapId: MAP_ID,
          systemId,
          signatureId: 'ABC-123',
          lastSeenAt: NOW - 5_000,
        });
      }
    });

    await expect(purge(t)).resolves.toMatchObject({ deletedSystems: 1, deletedSystemChildren: 2 });
    const left = await t.run(async (ctx) => ({
      signatures: (await ctx.db.query('mapSignatures').collect()).map((row) => row.systemId),
      activity: (await ctx.db.query('mapSignatureActivity').collect()).map((row) => row.systemId),
    }));
    expect(left).toEqual({ signatures: [ROOT], activity: [ROOT] });
  });

  it('purges connections and events even under a full system-tombstone backlog', async () => {
    const { CHAIN_PURGE_BATCH } = await import('../mapChainCleanup');
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      for (let index = 0; index <= CHAIN_PURGE_BATCH; index += 1) {
        await ctx.db.insert('mapSystems', { ...liveSystem(31_100_000 + index), ...EXPIRED });
      }
      const danglingConnection = await ctx.db.insert('mapConnections', connection(ROOT, DANGLING, EXPIRED));
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

    await expect(purge(t)).resolves.toEqual({
      deletedSystems: CHAIN_PURGE_BATCH,
      deletedSystemChildren: 0,
      deletedConnections: 1,
      removedBranches: 0,
      heldConnections: 0,
      retryConnections: 0,
      deletedEvents: 1,
      hasMore: true,
    });
    expect(await get(t, ids.danglingConnection)).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(ids.expiredEvent))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.query('mapSystems').collect())).toHaveLength(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(async (ctx) => await ctx.db.query('mapSystems').collect())).toEqual([]);
  });

  it('backfills forever-kept connections and orphaned signature rows in one run', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', liveSystem(ROOT));
      await ctx.db.insert('mapSystems', liveSystem(LIVE_ISLAND));
      const kept = await ctx.db.insert(
        'mapConnections',
        connection(ROOT, LIVE_ISLAND, { deletedAt: NOW - 90 * MAP_CHAIN_UNDO_WINDOW_MS, purgeAfter: null }),
      );
      for (const systemId of [ROOT, DANGLING]) {
        await ctx.db.insert('mapSignatures', signatureRow(systemId, 'XYZ-789'));
        await ctx.db.insert('mapSignatureActivity', {
          mapId: MAP_ID,
          systemId,
          signatureId: 'XYZ-789',
          lastSeenAt: NOW - 5_000,
        });
      }
      return { kept };
    });

    await t.mutation(internal.mapChainCleanup.backfillChainRetention, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await get(t, ids.kept)).toMatchObject({ tombstone: { kind: 'removed', purgeAfter: NOW } });
    const left = await t.run(async (ctx) => ({
      signatures: (await ctx.db.query('mapSignatures').collect()).map((row) => row.systemId),
      activity: (await ctx.db.query('mapSignatureActivity').collect()).map((row) => row.systemId),
    }));
    expect(left).toEqual({ signatures: [ROOT], activity: [ROOT] });

    // The next daily purge settles the formerly kept connection.
    vi.setSystemTime(NOW + 1);
    await expect(purge(t)).resolves.toMatchObject({ removedBranches: 1 });
  });
});
