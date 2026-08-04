// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { CHAIN_PURGE_BATCH, COLLAPSE_MAP_SCAN_CAP } from './mapAuthoring';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import { MAP_EVENT_RETENTION_MS } from '@/data/maps/chain-events';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const MAP_A = 'map-a';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const NOW = 1_800_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;
const DODIXIE = 30_002_659;
const WH_ROOT = 31_000_001;
const WH_A = 31_000_002;
const WH_B = 31_000_003;
const WH_C = 31_000_004;

type Chain = TestConvex<typeof schema>;

function asUser(t: Chain, userId = EDITOR, name = 'Editor Pilot') {
  return t.withIdentity({ subject: userId, name });
}

async function grant(
  t: Chain,
  mapId: string,
  userId: string,
  roles: ('viewer' | 'editor' | 'owner')[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
  });
}

async function expectConvexError(call: Promise<unknown>, code: string): Promise<void> {
  await expect(call).rejects.toThrow(code);
}

/** Empty map with editor + viewer claims. */
async function seedEmpty(t: Chain): Promise<void> {
  await grant(t, MAP_A, EDITOR, ['editor']);
  await grant(t, MAP_A, VIEWER, ['viewer']);
}

/** Map with home system already placed. */
async function seedHome(t: Chain, systemId = JITA): Promise<Id<'mapSystems'>> {
  await seedEmpty(t);
  return await asUser(t).mutation(api.mapAuthoring.setHomeSystem, {
    mapId: MAP_A,
    systemId,
  });
}

/** Home + one add-from-node connection. */
async function seedJump(t: Chain): Promise<{
  systemId: Id<'mapSystems'>;
  connectionId: Id<'mapConnections'>;
}> {
  await seedHome(t);
  return await asUser(t).mutation(api.mapAuthoring.addSystemFromNode, {
    mapId: MAP_A,
    fromSystemId: JITA,
    toSystemId: AMARR,
  });
}

function readSystem(t: Chain, systemId: number) {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) => q.eq('mapId', MAP_A).eq('systemId', systemId))
      .unique(),
  );
}

function readConnection(t: Chain, connectionId: Id<'mapConnections'>) {
  return t.run(async (ctx) => await ctx.db.get(connectionId));
}

function readEvents(t: Chain) {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
      .collect(),
  );
}

async function seedTopology(
  t: Chain,
  systems: readonly number[],
  connections: readonly {
    readonly key: string;
    readonly fromSystemId: number;
    readonly toSystemId: number;
  }[],
): Promise<Record<string, Id<'mapConnections'>>> {
  await seedEmpty(t);
  return await t.run(async (ctx) => {
    for (const systemId of systems) {
      await ctx.db.insert('mapSystems', {
        mapId: MAP_A,
        systemId,
        deletedAt: null,
        purgeAfter: null,
      });
    }
    const ids: Record<string, Id<'mapConnections'>> = {};
    for (const connection of connections) {
      const id = await ctx.db.insert('mapConnections', {
        mapId: MAP_A,
        fromSystemId: connection.fromSystemId,
        toSystemId: connection.toSystemId,
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        lifeStage: null,
        lifeStageObservedAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
      ids[connection.key] = id;
    }
    return ids;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('map authoring', () => {
  // ── SC-3.1 role matrix ────────────────────────────────────────────────────
  describe('gates every public mutation', () => {
    const PUBLIC_MUTATIONS = [
      'setHomeSystem',
      'addSystemFromNode',
      'setConnectionWormholeType',
      'setConnectionShipSize',
      'setConnectionMassState',
      'setConnectionLifeStage',
      'severConnection',
      'restoreSeveredBranch',
      'restoreConnection',
    ] as const;

    async function argsFor(
      t: Chain,
      name: (typeof PUBLIC_MUTATIONS)[number],
    ): Promise<Record<string, unknown>> {
      switch (name) {
        case 'setHomeSystem':
          await seedEmpty(t);
          return { mapId: MAP_A, systemId: JITA };
        case 'addSystemFromNode':
          await seedHome(t);
          return { mapId: MAP_A, fromSystemId: JITA, toSystemId: AMARR };
        case 'setConnectionWormholeType':
        case 'setConnectionShipSize':
        case 'setConnectionMassState':
        case 'setConnectionLifeStage':
        case 'severConnection':
        case 'restoreSeveredBranch':
        case 'restoreConnection': {
          const { connectionId } = await seedJump(t);
          if (name === 'setConnectionWormholeType') {
            return { mapId: MAP_A, connectionId, value: 'C247' };
          }
          if (name === 'setConnectionShipSize') {
            return { mapId: MAP_A, connectionId, value: 'M' };
          }
          if (name === 'setConnectionMassState') {
            return { mapId: MAP_A, connectionId, value: 'stable' };
          }
          if (name === 'setConnectionLifeStage') {
            return { mapId: MAP_A, connectionId, value: 'under_1_day' };
          }
          return { mapId: MAP_A, connectionId };
        }
      }
    }

    it.each(PUBLIC_MUTATIONS)(
      'rejects a signed-out %s as UNAUTHENTICATED',
      async (name) => {
        const t = convexTest(schema, modules);
        const args = await argsFor(t, name);
        // argsFor builds the exact shape for `name`; the indexed public API is
        // a union Convex cannot refine from the string key alone.
        await expectConvexError(
          t.mutation(api.mapAuthoring[name], args as never),
          'UNAUTHENTICATED',
        );
      },
    );

    it.each(PUBLIC_MUTATIONS)(
      'rejects a viewer %s as FORBIDDEN',
      async (name) => {
        const t = convexTest(schema, modules);
        const args = await argsFor(t, name);
        await expectConvexError(
          asUser(t, VIEWER).mutation(api.mapAuthoring[name], args as never),
          'FORBIDDEN',
        );
      },
    );

    it('rejects an invalid wormhole code only after the edit gate', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await expectConvexError(
        asUser(t, VIEWER).mutation(api.mapAuthoring.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'not-a-code',
        }),
        'FORBIDDEN',
      );
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'not-a-code',
        }),
        'INVALID_WORMHOLE_CODE',
      );
    });

    it.each(PUBLIC_MUTATIONS)('lets an editor call %s successfully', async (name) => {
      const t = convexTest(schema, modules);

      if (name === 'setHomeSystem') {
        await seedEmpty(t);
        await expect(
          asUser(t).mutation(api.mapAuthoring.setHomeSystem, {
            mapId: MAP_A,
            systemId: JITA,
          }),
        ).resolves.toBeDefined();
        return;
      }

      if (name === 'addSystemFromNode') {
        await seedHome(t);
        await expect(
          asUser(t).mutation(api.mapAuthoring.addSystemFromNode, {
            mapId: MAP_A,
            fromSystemId: JITA,
            toSystemId: AMARR,
          }),
        ).resolves.toMatchObject({
          systemId: expect.anything(),
          connectionId: expect.anything(),
        });
        return;
      }

      if (
        name === 'setConnectionWormholeType'
        || name === 'setConnectionShipSize'
        || name === 'setConnectionMassState'
        || name === 'setConnectionLifeStage'
      ) {
        const { connectionId } = await seedJump(t);
        const value =
          name === 'setConnectionWormholeType'
            ? 'C247'
            : name === 'setConnectionShipSize'
              ? 'M'
              : name === 'setConnectionMassState'
                ? 'stable'
                : 'under_1_day';
        await expect(
          asUser(t).mutation(api.mapAuthoring[name], {
            mapId: MAP_A,
            connectionId,
            value,
          }),
        ).resolves.toEqual({ changed: true });
        return;
      }

      if (name === 'severConnection') {
        const { connectionId } = await seedJump(t);
        await expect(
          asUser(t).mutation(api.mapAuthoring.severConnection, {
            mapId: MAP_A,
            connectionId,
          }),
        ).resolves.toEqual({ outcome: 'retained' });
        return;
      }

      const { connectionId } = await seedJump(t);
      await expect(
        asUser(t).mutation(api.mapAuthoring[name], {
          mapId: MAP_A,
          connectionId,
        }),
      ).resolves.toEqual({ restored: true });
    });
  });

  // ── SC-1.3 / home refusals ────────────────────────────────────────────────
  describe('setHomeSystem', () => {
    it('refuses when a live system already exists (MAP_NOT_EMPTY)', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.setHomeSystem, {
          mapId: MAP_A,
          systemId: AMARR,
        }),
        'MAP_NOT_EMPTY',
      );
      expect(await readSystem(t, AMARR)).toBeNull();
    });

    it('allows a new home when only tombstoned systems remain', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const id = await asUser(t).mutation(api.mapAuthoring.setHomeSystem, {
        mapId: MAP_A,
        systemId: AMARR,
      });
      expect(id).toBeDefined();
      expect(await readSystem(t, AMARR)).toMatchObject({
        systemId: AMARR,
        deletedAt: null,
        purgeAfter: null,
      });
    });
  });

  // ── SC-2.2 origin/destination refusals ────────────────────────────────────
  describe('addSystemFromNode', () => {
    it('refuses an origin absent from the map (UNKNOWN_ORIGIN)', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.addSystemFromNode, {
          mapId: MAP_A,
          fromSystemId: AMARR,
          toSystemId: DODIXIE,
        }),
        'UNKNOWN_ORIGIN',
      );
    });

    it('refuses a self-loop', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.addSystemFromNode, {
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: JITA,
        }),
        'SELF_LOOP',
      );
    });

    it('refuses a tombstoned destination (DESTINATION_TOMBSTONED)', async () => {
      const t = convexTest(schema, modules);
      await seedJump(t);
      // Sever the connection so Amarr can be tombstoned, then refuse re-add.
      const connections = await t.run(async (ctx) =>
        await ctx.db
          .query('mapConnections')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      await asUser(t).mutation(internal.mapAuthoring.tombstoneConnection, {
        mapId: MAP_A,
        connectionId: connections[0]!._id,
      });
      await asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
        mapId: MAP_A,
        systemId: AMARR,
      });
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.addSystemFromNode, {
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: AMARR,
        }),
        'DESTINATION_TOMBSTONED',
      );
    });

    it('inserts only a connection when the destination is already live (loop)', async () => {
      const t = convexTest(schema, modules);
      await seedJump(t);
      const before = await t.run(async (ctx) =>
        await ctx.db
          .query('mapSystems')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      await asUser(t).mutation(api.mapAuthoring.addSystemFromNode, {
        mapId: MAP_A,
        fromSystemId: AMARR,
        toSystemId: JITA,
      });
      const after = await t.run(async (ctx) =>
        await ctx.db
          .query('mapSystems')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(after).toHaveLength(before.length);
      const connections = await t.run(async (ctx) =>
        await ctx.db
          .query('mapConnections')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(connections).toHaveLength(2);
    });
  });

  // ── SC-3.2 equality-skip ──────────────────────────────────────────────────
  describe('field setters equality-skip', () => {
    it.each([
      {
        mutation: 'setConnectionWormholeType' as const,
        value: 'C247',
        field: 'wormholeTypeCode',
      },
      {
        mutation: 'setConnectionShipSize' as const,
        value: 'L' as const,
        field: 'shipSize',
      },
      {
        mutation: 'setConnectionMassState' as const,
        value: 'reduced' as const,
        field: 'massState',
      },
      {
        mutation: 'setConnectionLifeStage' as const,
        value: 'under_4_hours' as const,
        field: 'lifeStage',
      },
    ])('$mutation writes once then no-ops on the same value', async ({ mutation, value, field }) => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await asUser(t).mutation(api.mapAuthoring[mutation], {
        mapId: MAP_A,
        connectionId,
        value,
      });
      const afterFirst = await readConnection(t, connectionId);
      expect(afterFirst).toMatchObject({ [field]: value });

      const result = await asUser(t).mutation(api.mapAuthoring[mutation], {
        mapId: MAP_A,
        connectionId,
        value,
      });
      expect(result).toEqual({ changed: false });

      const afterSecond = await readConnection(t, connectionId);
      expect(afterSecond).toEqual(afterFirst);
    });

    it('stamps lifeStageObservedAt on change and leaves it on an equal re-pick', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_hour',
      });
      const stamped = await readConnection(t, connectionId);
      expect(stamped?.lifeStageObservedAt).toBe(NOW);

      vi.setSystemTime(NOW + 60_000);
      await asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_hour',
      });
      expect(await readConnection(t, connectionId)).toEqual(stamped);

      await asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'expired',
      });
      const restamped = await readConnection(t, connectionId);
      expect(restamped?.lifeStage).toBe('expired');
      expect(restamped?.lifeStageObservedAt).toBe(NOW + 60_000);
    });
  });

  describe('connection death windows', () => {
    const HOUR_MS = 60 * 60 * 1000;

    it('accepts same-bucket narrowing, stamps it, and resets a contradiction', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_day',
        deathEarliestAt: NOW + 4 * HOUR_MS,
        deathLatestAt: NOW + 16 * HOUR_MS,
      });
      expect(await readConnection(t, connectionId)).toMatchObject({
        lifeStage: 'under_1_day',
        lifeStageObservedAt: NOW,
        deathEarliestAt: NOW + 4 * HOUR_MS,
        deathLatestAt: NOW + 16 * HOUR_MS,
      });

      vi.setSystemTime(NOW + HOUR_MS);
      await expect(
        asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
          mapId: MAP_A,
          connectionId,
          value: 'under_1_day',
          deathEarliestAt: NOW + 5 * HOUR_MS,
          deathLatestAt: NOW + 17 * HOUR_MS,
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        lifeStage: 'under_1_day',
        lifeStageObservedAt: NOW + HOUR_MS,
        deathEarliestAt: NOW + 5 * HOUR_MS,
        deathLatestAt: NOW + 16 * HOUR_MS,
      });

      vi.setSystemTime(NOW + 2 * HOUR_MS);
      await asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'expired',
        deathEarliestAt: NOW + 2 * HOUR_MS,
        deathLatestAt: NOW + 2 * HOUR_MS,
      });
      expect(await readConnection(t, connectionId)).toMatchObject({
        lifeStage: 'expired',
        lifeStageObservedAt: NOW + 2 * HOUR_MS,
        deathEarliestAt: NOW + 2 * HOUR_MS,
        deathLatestAt: NOW + 2 * HOUR_MS,
      });
    });

    it('intersects a type-pick ceiling and skips only the true no-op', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_day',
        deathEarliestAt: NOW + 4 * HOUR_MS,
        deathLatestAt: NOW + 24 * HOUR_MS,
      });

      await expect(
        asUser(t).mutation(api.mapAuthoring.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'C247',
          deathEarliestAt: NOW,
          deathLatestAt: NOW + 16 * HOUR_MS,
        }),
      ).resolves.toEqual({ changed: true });
      const typed = await readConnection(t, connectionId);
      expect(typed).toMatchObject({
        wormholeTypeCode: 'C247',
        deathEarliestAt: NOW + 4 * HOUR_MS,
        deathLatestAt: NOW + 16 * HOUR_MS,
      });

      await expect(
        asUser(t).mutation(api.mapAuthoring.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'C247',
          deathEarliestAt: NOW + 4 * HOUR_MS,
          deathLatestAt: NOW + 16 * HOUR_MS,
        }),
      ).resolves.toEqual({ changed: false });
      expect(await readConnection(t, connectionId)).toEqual(typed);
    });

    it('refuses partial, inverted, and non-finite death-window pairs', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
          mapId: MAP_A,
          connectionId,
          value: 'under_1_day',
          deathEarliestAt: NOW,
        }),
        'INVALID_DEATH_WINDOW',
      );
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
          mapId: MAP_A,
          connectionId,
          value: 'under_1_day',
          deathEarliestAt: NOW + 1,
          deathLatestAt: NOW,
        }),
        'INVALID_DEATH_WINDOW',
      );
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.setConnectionLifeStage, {
          mapId: MAP_A,
          connectionId,
          value: 'under_1_day',
          deathEarliestAt: Number.NaN,
          deathLatestAt: NOW,
        }),
        'INVALID_DEATH_WINDOW',
      );
    });
  });

  // ── SC-4.3 / SC-4.4 tombstone + restore ───────────────────────────────────
  describe('tombstone and restore', () => {
    it('round-trips system identity including _id and _creationTime', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      const before = await readSystem(t, JITA);
      expect(before).not.toBeNull();

      await asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const tombstoned = await readSystem(t, JITA);
      expect(tombstoned).toMatchObject({
        _id: before!._id,
        _creationTime: before!._creationTime,
        deletedAt: NOW,
        purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
      });
      expect(tombstoned!.purgeAfter! - tombstoned!.deletedAt!).toBe(
        MAP_CHAIN_UNDO_WINDOW_MS,
      );

      await asUser(t).mutation(internal.mapAuthoring.restoreSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const restored = await readSystem(t, JITA);
      expect(restored).toEqual({
        ...before,
        deletedAt: null,
        purgeAfter: null,
      });
    });

    it('round-trips connection identity including _id and _creationTime', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await asUser(t).mutation(api.mapAuthoring.setConnectionWormholeType, {
        mapId: MAP_A,
        connectionId,
        value: 'C247',
      });
      const before = await readConnection(t, connectionId);
      expect(before).not.toBeNull();

      await asUser(t).mutation(internal.mapAuthoring.tombstoneConnection, {
        mapId: MAP_A,
        connectionId,
      });
      const tombstoned = await readConnection(t, connectionId);
      expect(tombstoned).toMatchObject({
        _id: before!._id,
        _creationTime: before!._creationTime,
        wormholeTypeCode: 'C247',
        deletedAt: NOW,
        purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
      });

      await asUser(t).mutation(api.mapAuthoring.restoreConnection, {
        mapId: MAP_A,
        connectionId,
      });
      expect(await readConnection(t, connectionId)).toEqual({
        ...before,
        deletedAt: null,
        purgeAfter: null,
      });
    });

    it('refuses to tombstone a system while a live connection references it', async () => {
      const t = convexTest(schema, modules);
      await seedJump(t);
      await expectConvexError(
        asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
          mapId: MAP_A,
          systemId: JITA,
        }),
        'SYSTEM_IN_USE',
      );
      await expectConvexError(
        asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
          mapId: MAP_A,
          systemId: AMARR,
        }),
        'SYSTEM_IN_USE',
      );
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: null });
    });

    it('allows tombstone after the referencing connection is itself tombstoned', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await asUser(t).mutation(internal.mapAuthoring.tombstoneConnection, {
        mapId: MAP_A,
        connectionId,
      });
      await expect(
        asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
          mapId: MAP_A,
          systemId: AMARR,
        }),
      ).resolves.toEqual({ tombstoned: true });
    });

    it('refuses to restore a connection whose endpoint is tombstoned', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await asUser(t).mutation(internal.mapAuthoring.tombstoneConnection, {
        mapId: MAP_A,
        connectionId,
      });
      await asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
        mapId: MAP_A,
        systemId: AMARR,
      });
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.restoreConnection, {
          mapId: MAP_A,
          connectionId,
        }),
        'ENDPOINT_TOMBSTONED',
      );
    });

    it('writes nothing on repeated tombstone or restore of the current state', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const tombstoned = await readSystem(t, JITA);

      await asUser(t).mutation(internal.mapAuthoring.tombstoneSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      expect(await readSystem(t, JITA)).toEqual(tombstoned);

      await asUser(t).mutation(internal.mapAuthoring.restoreSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const restored = await readSystem(t, JITA);
      await asUser(t).mutation(internal.mapAuthoring.restoreSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      expect(await readSystem(t, JITA)).toEqual(restored);
    });
  });

  describe('collapse and ledger mutations', () => {
    it('internalizes the .1 helpers and exposes only the unified destructive surface', () => {
      const source = readFileSync('convex/mapAuthoring.ts', 'utf8');
      const publicMutations = [...source.matchAll(/export const (\w+) = mutation\(/g)]
        .map((match) => match[1]);
      expect(publicMutations).toEqual([
        'setHomeSystem',
        'addSystemFromNode',
        'setConnectionWormholeType',
        'setConnectionShipSize',
        'setConnectionMassState',
        'setConnectionLifeStage',
        'severConnection',
        'restoreSeveredBranch',
        'restoreConnection',
      ]);
      for (const name of [
        'tombstoneSystem',
        'tombstoneConnection',
        'restoreSystem',
      ]) {
        expect(source).toContain(`export const ${name} = internalMutation(`);
      }
    });

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
        asUser(t, EDITOR, 'Scout One').mutation(api.mapAuthoring.severConnection, {
          mapId: MAP_A,
          connectionId: cut,
        }),
      ).resolves.toEqual({ outcome: 'retained' });
      expect(await readConnection(t, cut)).toMatchObject({
        deletedAt: NOW,
        purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
      });
      expect(await readConnection(t, ids.other!)).toMatchObject({
        deletedAt: null,
      });
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
        api.mapAuthoring.restoreConnection,
        { mapId: MAP_A, connectionId: cut },
      );
      expect(await readConnection(t, cut)).toMatchObject({
        deletedAt: null,
        purgeAfter: null,
      });
      expect((await readEvents(t)).map((event) => [event.kind, event.actor])).toEqual([
        ['connection_severed_retained', 'Scout One'],
        ['connection_restored', 'Scout Two'],
      ]);
    });

    it('retains a severed component containing a known-space exit', async () => {
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
        asUser(t).mutation(api.mapAuthoring.severConnection, {
          mapId: MAP_A,
          connectionId: ids.cut!,
        }),
      ).resolves.toEqual({ outcome: 'retained' });
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: null });
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
        asUser(t).mutation(api.mapAuthoring.severConnection, {
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
      expect(new Set(tombstonedRows.map((row) => row?.deletedAt))).toEqual(
        new Set([NOW]),
      );
      expect(await readConnection(t, ids['root-a']!)).toMatchObject({
        deletedAt: null,
      });
      expect((await readEvents(t))[0]).toMatchObject({
        kind: 'branch_removed',
        payload: { connectionId: String(cut), systemIds: [WH_B, WH_C] },
      });

      vi.setSystemTime(NOW + 1_000);
      await asUser(t).mutation(api.mapAuthoring.restoreSeveredBranch, {
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
        deletedAt: null,
        purgeAfter: null,
      });
      expect(await readConnection(t, ids['b-c']!)).toEqual({
        ...beforeConnections[1]!,
        deletedAt: null,
        purgeAfter: null,
      });
      expect((await readEvents(t)).at(-1)).toMatchObject({
        kind: 'branch_restored',
        payload: { connectionId: String(cut), systemIds: [WH_B, WH_C] },
      });
    });

    it('evaluates an interior sever inside a retained known-space island', async () => {
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
      await asUser(t).mutation(api.mapAuthoring.severConnection, {
        mapId: MAP_A,
        connectionId: ids['island-cut']!,
      });

      await expect(
        asUser(t).mutation(api.mapAuthoring.severConnection, {
          mapId: MAP_A,
          connectionId: ids.interior!,
        }),
      ).resolves.toEqual({ outcome: 'removed', systemIds: [WH_B] });
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: null });
      expect(await readSystem(t, WH_B)).toMatchObject({ deletedAt: NOW + 1 });
      expect(await readConnection(t, ids['island-cut']!)).toMatchObject({
        deletedAt: NOW,
      });
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
      await asUser(t).mutation(api.mapAuthoring.severConnection, {
        mapId: MAP_A,
        connectionId: cutA,
      });
      await asUser(t).mutation(api.mapAuthoring.severConnection, {
        mapId: MAP_A,
        connectionId: cutB,
      });
      expect(await readConnection(t, cutA)).toMatchObject({ deletedAt: NOW });
      expect(await readConnection(t, cutB)).toMatchObject({ deletedAt: NOW + 1 });

      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.severConnection, {
          mapId: MAP_A,
          connectionId: cutA,
        }),
        'CONNECTION_TOMBSTONED',
      );
      expect(await readEvents(t)).toHaveLength(2);

      await asUser(t).mutation(api.mapAuthoring.restoreSeveredBranch, {
        mapId: MAP_A,
        connectionId: cutA,
      });
      expect(await readSystem(t, WH_A)).toMatchObject({ deletedAt: null });
      expect(await readConnection(t, cutA)).toMatchObject({ deletedAt: null });
      expect(await readSystem(t, WH_B)).toMatchObject({ deletedAt: NOW + 1 });
      expect(await readConnection(t, cutB)).toMatchObject({ deletedAt: NOW + 1 });

      await asUser(t).mutation(api.mapAuthoring.restoreSeveredBranch, {
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
      await asUser(t).mutation(api.mapAuthoring.severConnection, {
        mapId: MAP_A,
        connectionId: cut,
      });
      await asUser(t).mutation(api.mapAuthoring.severConnection, {
        mapId: MAP_A,
        connectionId: ids['root-a']!,
      });
      expect(await readSystem(t, WH_A)).toMatchObject({ deletedAt: NOW + 1 });

      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.restoreSeveredBranch, {
          mapId: MAP_A,
          connectionId: cut,
        }),
        'ENDPOINT_TOMBSTONED',
      );
      expect(await readSystem(t, WH_B)).toMatchObject({ deletedAt: NOW });
      expect(await readConnection(t, cut)).toMatchObject({ deletedAt: NOW });
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
        return await ctx.db.insert('mapConnections', {
          mapId: MAP_A,
          fromSystemId: WH_ROOT,
          toSystemId: WH_A,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          eolAt: null,
          deletedAt: null,
          purgeAfter: null,
        });
      });

      await expectConvexError(
        asUser(t).mutation(api.mapAuthoring.severConnection, {
          mapId: MAP_A,
          connectionId,
        }),
        'MAP_TOO_LARGE',
      );
      expect(await readConnection(t, connectionId)).toMatchObject({ deletedAt: null });
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
        await ctx.db.insert('mapConnections', {
          mapId: MAP_A,
          fromSystemId: WH_A,
          toSystemId: WH_B,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          eolAt: null,
          lifeStage: null,
          lifeStageObservedAt: null,
          deletedAt: NOW - MAP_CHAIN_UNDO_WINDOW_MS,
          purgeAfter: null,
        }),
      );

      await asUser(t).mutation(api.mapAuthoring.severConnection, {
        mapId: MAP_A,
        connectionId: ids.cut!,
      });
      expect(await readConnection(t, skeletonId)).toMatchObject({
        deletedAt: NOW - MAP_CHAIN_UNDO_WINDOW_MS,
        purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
      });
    });
  });

  // ── purge bounds ──────────────────────────────────────────────────────────
  describe('purgeExpiredChainTombstones', () => {
    it('deletes expired rows, spares active and not-yet-expired, and reports hasMore', async () => {
      const t = convexTest(schema, modules);
      await seedEmpty(t);

      await t.run(async (ctx) => {
        // Active — must never enter the purge range.
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: JITA,
          deletedAt: null,
          purgeAfter: null,
        });
        // Not yet expired.
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: AMARR,
          deletedAt: NOW - 1_000,
          purgeAfter: NOW + 60_000,
        });
        // Expired systems: one more than the batch so hasMore is true when
        // connections are empty — seed CHAIN_PURGE_BATCH + 1 expired systems.
        for (let i = 0; i < CHAIN_PURGE_BATCH + 1; i += 1) {
          await ctx.db.insert('mapSystems', {
            mapId: MAP_A,
            systemId: 40_000_000 + i,
            deletedAt: NOW - 20_000,
            purgeAfter: NOW - 10_000,
          });
        }
        // Expired connection + active connection.
        await ctx.db.insert('mapConnections', {
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: AMARR,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          eolAt: null,
          lifeStage: null,
          lifeStageObservedAt: null,
          deletedAt: null,
          purgeAfter: null,
        });
        await ctx.db.insert('mapConnections', {
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: DODIXIE,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          eolAt: null,
          deletedAt: NOW - 20_000,
          purgeAfter: NOW - 5_000,
        });
      });

      const result = await t.mutation(internal.mapAuthoring.purgeExpiredChainTombstones, {});
      // Per-table budgets: the full system batch AND the expired connection
      // progress in one call; only the leftover expired system waits.
      expect(result.deletedSystems).toBe(CHAIN_PURGE_BATCH);
      expect(result.deletedConnections).toBe(1);
      expect(result.hasMore).toBe(true);

      const systems = await t.run(async (ctx) =>
        await ctx.db
          .query('mapSystems')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(systems.some((row) => row.systemId === JITA)).toBe(true);
      expect(systems.some((row) => row.systemId === AMARR)).toBe(true);
      expect(systems.filter((row) => row.systemId >= 40_000_000)).toHaveLength(1);

      const connections = await t.run(async (ctx) =>
        await ctx.db
          .query('mapConnections')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(connections).toHaveLength(1);

      // Second call drains the leftover expired system.
      const second = await t.mutation(internal.mapAuthoring.purgeExpiredChainTombstones, {});
      expect(second.deletedSystems).toBe(1);
      expect(second.deletedConnections).toBe(0);
      expect(second.hasMore).toBe(false);

      const remainingConnections = await t.run(async (ctx) =>
        await ctx.db
          .query('mapConnections')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(remainingConnections).toHaveLength(1);
      expect(remainingConnections[0]).toMatchObject({
        toSystemId: AMARR,
        deletedAt: null,
      });
    });
  });
});
