// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { COLLAPSE_MAP_SCAN_CAP } from './mapAuthoringCollapse';
import {
  MAP_CHAIN_UNDO_WINDOW_MS,
  isTombstoned,
  tombstoneDeletedAt,
} from '@/data/maps/chain-contract';
import { MAP_EVENT_RETENTION_MS } from '@/data/maps/chain-events';
import schema from './schema';

import { connectionInsert } from './__tests__/connection-doc.setup';
import { modules } from './__tests__/modules.setup';
import {
  EDITOR,
  JITA,
  MAP_A,
  NOW,
  WH_A,
  WH_B,
  WH_C,
  WH_ROOT,
  asUser,
  expectConvexError,
  readConnection,
  readEvents,
  readSystem,
  seedEmpty,
  seedTopology,
  installAuthoringTimers,
  restoreAuthoringTimers,
} from './__tests__/mapAuthoring.setup';

beforeEach(() => {
  installAuthoringTimers();
});

afterEach(() => {
  restoreAuthoringTimers();
});

describe('map authoring', () => {
  describe('collapse and ledger mutations', () => {
    it('retains a loop, captures the actor, and records direct connection restore', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A],
        [
          { key: 'cut', fromSystemId: WH_ROOT, toSystemId: WH_A },
          { key: 'other', fromSystemId: WH_ROOT, toSystemId: WH_A },
        ],
      );
      const cut = ids.cut!;

      await expect(
        asUser(t, EDITOR, 'Scout One').mutation(api.mapAuthoringCollapse.severConnection, {
          mapId: MAP_A,
          connectionId: cut,
        }),
      ).resolves.toEqual({ outcome: 'retained' });
      expect(await readConnection(t, cut)).toMatchObject({
        tombstone: {
          kind: 'removed',
          deletedAt: NOW,
          purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
        },
      });
      expect(tombstoneDeletedAt(await readConnection(t, ids.other!))).toBeNull();
      expect(await readEvents(t)).toEqual([
        expect.objectContaining({
          mapId: MAP_A,
          at: NOW,
          kind: 'connection_severed_retained',
          actor: 'Scout One',
          payload: { connectionId: String(cut) },
          purgeAfter: NOW + MAP_EVENT_RETENTION_MS,
        }),
      ]);

      vi.setSystemTime(NOW + 1_000);
      await asUser(t, EDITOR, 'Scout Two').mutation(
        api.mapAuthoringTombstone.restoreConnection,
        { mapId: MAP_A, connectionId: cut },
      );
      expect(await readConnection(t, cut)).toMatchObject({
        tombstone: { kind: 'live' },
      });
      expect((await readEvents(t)).map((event) => [event.kind, event.actor])).toEqual([
        ['connection_severed_retained', 'Scout One'],
        ['connection_restored', 'Scout Two'],
      ]);
    });

    it('removes a severed component even when it contains a known-space exit', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A, JITA],
        [
          { key: 'root-a', fromSystemId: WH_ROOT, toSystemId: WH_A },
          { key: 'cut', fromSystemId: WH_A, toSystemId: JITA },
        ],
      );

      await expect(
        asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
          mapId: MAP_A,
          connectionId: ids.cut!,
        }),
      ).resolves.toEqual({ outcome: 'removed', systemIds: [JITA] });
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: NOW });
    });

    it('removes a dead branch with incident connections and round-trips every identity', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A, WH_B, WH_C],
        [
          { key: 'root-a', fromSystemId: WH_ROOT, toSystemId: WH_A },
          { key: 'cut', fromSystemId: WH_A, toSystemId: WH_B },
          { key: 'b-c', fromSystemId: WH_B, toSystemId: WH_C },
        ],
      );
      const cut = ids.cut!;
      const beforeSystems = await Promise.all([
        readSystem(t, WH_B),
        readSystem(t, WH_C),
      ]);
      const beforeConnections = await Promise.all([
        readConnection(t, cut),
        readConnection(t, ids['b-c']!),
      ]);

      await expect(
        asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
          mapId: MAP_A,
          connectionId: cut,
        }),
      ).resolves.toEqual({ outcome: 'removed', systemIds: [WH_B, WH_C] });
      const tombstonedRows = await Promise.all([
        readSystem(t, WH_B),
        readSystem(t, WH_C),
        readConnection(t, cut),
        readConnection(t, ids['b-c']!),
      ]);
      expect(new Set(tombstonedRows.map((row) => (
        row == null ? null : tombstoneDeletedAt(row)
      )))).toEqual(
        new Set([NOW]),
      );
      expect(tombstoneDeletedAt(await readConnection(t, ids['root-a']!))).toBeNull();
      expect((await readEvents(t))[0]).toMatchObject({
        kind: 'branch_removed',
        payload: { connectionId: String(cut), systemIds: [WH_B, WH_C] },
      });

      vi.setSystemTime(NOW + 1_000);
      await asUser(t).mutation(api.mapAuthoringCollapse.restoreSeveredBranch, {
        mapId: MAP_A,
        connectionId: cut,
      });
      expect(await readSystem(t, WH_B)).toEqual({
        ...beforeSystems[0]!,
        deletedAt: null,
        purgeAfter: null,
      });
      expect(await readSystem(t, WH_C)).toEqual({
        ...beforeSystems[1]!,
        deletedAt: null,
        purgeAfter: null,
      });
      expect(await readConnection(t, cut)).toEqual({
        ...beforeConnections[0]!,
        tombstone: { kind: 'live' },
      });
      expect(await readConnection(t, ids['b-c']!)).toEqual({
        ...beforeConnections[1]!,
        tombstone: { kind: 'live' },
      });
      expect((await readEvents(t)).at(-1)).toMatchObject({
        kind: 'branch_restored',
        payload: { connectionId: String(cut), systemIds: [WH_B, WH_C] },
      });
    });

    it('stamps, restores, and keeps replaced-anchor stubs out of the candidate feed', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A, WH_B],
        [
          { key: 'cut', fromSystemId: WH_ROOT, toSystemId: WH_A },
          { key: 'a-b', fromSystemId: WH_A, toSystemId: WH_B },
        ],
      );
      const stub = await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
        mapId: MAP_A,
        fromSystemId: WH_B,
        fromSignatureId: 'ABC-123',
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
          mapId: MAP_A,
          connectionId: ids.cut!,
        }),
      ).resolves.toEqual({ outcome: 'removed', systemIds: [WH_A, WH_B] });
      expect(await readConnection(t, stub.connectionId)).toMatchObject({
        toSystemId: null,
        tombstone: {
          kind: 'removed',
          deletedAt: NOW,
          purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
        },
      });

      await asUser(t).mutation(api.mapAuthoringCollapse.restoreSeveredBranch, {
        mapId: MAP_A,
        connectionId: ids.cut!,
      });
      expect(await readConnection(t, stub.connectionId)).toMatchObject({
        tombstone: { kind: 'live' },
      });

      await asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
        mapId: MAP_A,
        connectionId: ids.cut!,
      });
      await t.run(async (ctx) => {
        const oldAnchor = await ctx.db
          .query('mapSystems')
          .withIndex('by_map_system', (q) =>
            q.eq('mapId', MAP_A).eq('systemId', WH_B),
          )
          .unique();
        if (oldAnchor === null) throw new Error('expected tombstoned anchor fixture');
        await ctx.db.delete(oldAnchor._id);
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: WH_B,
          deletedAt: null,
          purgeAfter: null,
        });
      });

      const candidates = await asUser(t).query(api.mapChainConnections.watchUnresolvedHoles, {
        mapId: MAP_A,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      expect(candidates.page.filter((row) => !isTombstoned(row))).toEqual([]);
      expect(tombstoneDeletedAt(await readConnection(t, stub.connectionId))).toBe(NOW);
    });

    it('removes a known-space exit and its wormhole-only children together', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A, JITA, WH_B],
        [
          { key: 'root-a', fromSystemId: WH_ROOT, toSystemId: WH_A },
          { key: 'island-cut', fromSystemId: WH_A, toSystemId: JITA },
          { key: 'interior', fromSystemId: JITA, toSystemId: WH_B },
        ],
      );

      await expect(
        asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
          mapId: MAP_A,
          connectionId: ids['island-cut']!,
        }),
      ).resolves.toEqual({ outcome: 'removed', systemIds: [JITA, WH_B] });
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: NOW });
      expect(await readSystem(t, WH_B)).toMatchObject({ deletedAt: NOW });
      expect(tombstoneDeletedAt(await readConnection(t, ids['island-cut']!))).toBe(NOW);
      expect(tombstoneDeletedAt(await readConnection(t, ids.interior!))).toBe(NOW);
    });

    it('uses unique stamps so restores cannot cross two same-millisecond severs', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A, WH_B],
        [
          { key: 'cut-a', fromSystemId: WH_ROOT, toSystemId: WH_A },
          { key: 'cut-b', fromSystemId: WH_ROOT, toSystemId: WH_B },
        ],
      );
      const cutA = ids['cut-a']!;
      const cutB = ids['cut-b']!;
      await asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
        mapId: MAP_A,
        connectionId: cutA,
      });
      await asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
        mapId: MAP_A,
        connectionId: cutB,
      });
      expect(tombstoneDeletedAt(await readConnection(t, cutA))).toBe(NOW);
      expect(tombstoneDeletedAt(await readConnection(t, cutB))).toBe(NOW + 1);

      await expect(
        asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
          mapId: MAP_A,
          connectionId: cutA,
        }),
      ).resolves.toEqual({ outcome: 'already_applied' });
      expect(tombstoneDeletedAt(await readConnection(t, cutA))).toBe(NOW);
      expect(await readEvents(t)).toHaveLength(2);

      await asUser(t).mutation(api.mapAuthoringCollapse.restoreSeveredBranch, {
        mapId: MAP_A,
        connectionId: cutA,
      });
      expect(await readSystem(t, WH_A)).toMatchObject({ deletedAt: null });
      expect(tombstoneDeletedAt(await readConnection(t, cutA))).toBe(null);
      expect(await readSystem(t, WH_B)).toMatchObject({ deletedAt: NOW + 1 });
      expect(tombstoneDeletedAt(await readConnection(t, cutB))).toBe(NOW + 1);

      await asUser(t).mutation(api.mapAuthoringCollapse.restoreSeveredBranch, {
        mapId: MAP_A,
        connectionId: cutA,
      });
      expect(await readEvents(t)).toHaveLength(3);
    });

    it('refuses a branch restore whose cut endpoint was tombstoned by a later sever', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A, WH_B],
        [
          { key: 'root-a', fromSystemId: WH_ROOT, toSystemId: WH_A },
          { key: 'cut', fromSystemId: WH_A, toSystemId: WH_B },
        ],
      );
      const cut = ids.cut!;
      await asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
        mapId: MAP_A,
        connectionId: cut,
      });
      await asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
        mapId: MAP_A,
        connectionId: ids['root-a']!,
      });
      expect(await readSystem(t, WH_A)).toMatchObject({ deletedAt: NOW + 1 });

      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringCollapse.restoreSeveredBranch, {
          mapId: MAP_A,
          connectionId: cut,
        }),
        'ENDPOINT_TOMBSTONED',
      );
      expect(await readSystem(t, WH_B)).toMatchObject({ deletedAt: NOW });
      expect(tombstoneDeletedAt(await readConnection(t, cut))).toBe(NOW);
    });

    it('fails closed before mutation or ledger write when the map exceeds the bound', async () => {
      const t = convexTest(schema, modules);
      await seedEmpty(t);
      const connectionId = await t.run(async (ctx) => {
        for (let index = 0; index <= COLLAPSE_MAP_SCAN_CAP; index += 1) {
          await ctx.db.insert('mapSystems', {
            mapId: MAP_A,
            systemId: WH_ROOT + index,
            deletedAt: null,
            purgeAfter: null,
          });
        }
        return await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP_A,
          fromSystemId: WH_ROOT,
          toSystemId: WH_A,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deletedAt: null,
          purgeAfter: null,
        }));
      });

      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
          mapId: MAP_A,
          connectionId,
        }),
        'MAP_TOO_LARGE',
      );
      expect(tombstoneDeletedAt(await readConnection(t, connectionId))).toBe(null);
      expect(await readEvents(t)).toEqual([]);
    });

    it('re-arms an incident skeleton when its live endpoint is removed', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [WH_ROOT, WH_A, WH_B],
        [{ key: 'cut', fromSystemId: WH_ROOT, toSystemId: WH_A }],
      );
      const skeletonId = await t.run(async (ctx) =>
        await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP_A,
          fromSystemId: WH_A,
          toSystemId: WH_B,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          lifeStage: null,
          lifeStageObservedAt: null,
          deletedAt: NOW - MAP_CHAIN_UNDO_WINDOW_MS,
          purgeAfter: null,
        })),
      );

      await asUser(t).mutation(api.mapAuthoringCollapse.severConnection, {
        mapId: MAP_A,
        connectionId: ids.cut!,
      });
      expect(await readConnection(t, skeletonId)).toMatchObject({
        tombstone: {
          kind: 'removed',
          deletedAt: NOW - MAP_CHAIN_UNDO_WINDOW_MS,
          purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
        },
      });
    });
  });
});
