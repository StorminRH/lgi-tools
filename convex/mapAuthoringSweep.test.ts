// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  CEILING_COLLAPSE_GRACE_MS,
  CEILING_SWEEP_ACTOR,
  CEILING_SWEEP_BATCH,
  CEILING_SWEEP_SCAN,
} from './mapAuthoringSweep';
import {
  MAP_CHAIN_UNDO_WINDOW_MS,
  tombstoneDeletedAt,
  tombstonePurgeAfter,
} from '@/data/maps/chain-contract';
import schema from './schema';

import { connectionInsert } from './__tests__/connection-doc.setup';
import { modules } from './__tests__/modules.setup';
import {
  AMARR,
  EDITOR,
  JITA,
  MAP_A,
  NOW,
  WH_A,
  WH_B,
  WH_C,
  type Chain,
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
  describe('collapse triggers', () => {
    const EXPIRED = NOW - CEILING_COLLAPSE_GRACE_MS - 1_000;
    const PILOT = 9_001;

    async function patchConnection(
      t: Chain,
      connectionId: Id<'mapConnections'>,
      patch: Record<string, unknown>,
    ): Promise<void> {
      await t.run(async (ctx) => {
        await ctx.db.patch(connectionId, patch);
      });
    }

    async function trackPilotAt(t: Chain, systemId: number): Promise<void> {
      await t.run(async (ctx) => {
        await ctx.db.insert('mapTracking', {
          mapId: MAP_A,
          userId: EDITOR,
          characterId: PILOT,
        });
        await ctx.db.insert('characterLocation', {
          userId: EDITOR,
          characterId: PILOT,
          solarSystemId: systemId,
          stationId: null,
          structureId: null,
          shipTypeId: null,
          prevSolarSystemId: null,
          prevFresh: false,
          observedAt: NOW,
          etagLocation: null,
          etagShip: null,
        });
      });
    }

    it('collapses an expired resolved branch through the shared severConnection core', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [JITA, WH_A, WH_B],
        [
          { key: 'cut', fromSystemId: JITA, toSystemId: WH_A },
          { key: 'a-b', fromSystemId: WH_A, toSystemId: WH_B },
        ],
      );
      await patchConnection(t, ids.cut!, {
        lifetime: {
          kind: 'window',
          earliestAt: EXPIRED - 60_000,
          latestAt: EXPIRED,
          lifeStage: null,
          observedAt: null,
        },
      });

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 1, removedStubs: 0, skipped: 0, failed: 0, hasMore: false });

      const tombstoned = await Promise.all([
        readConnection(t, ids.cut!),
        readConnection(t, ids['a-b']!),
        readSystem(t, WH_A),
        readSystem(t, WH_B),
      ]);
      expect(new Set(tombstoned.map((row) => (
        row == null ? null : tombstoneDeletedAt(row)
      )))).toEqual(new Set([NOW]));
      expect(new Set(tombstoned.map((row) => tombstonePurgeAfter(row)))).toEqual(
        new Set([NOW + MAP_CHAIN_UNDO_WINDOW_MS]),
      );
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: null });
      expect(await readEvents(t)).toEqual([
        expect.objectContaining({
          kind: 'branch_removed',
          actor: CEILING_SWEEP_ACTOR,
          payload: {
            connectionId: String(ids.cut!),
            systemIds: [WH_A, WH_B],
          },
        }),
      ]);
    });

    it('never touches live, in-grace, or windowless connections', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [JITA, WH_A, WH_B, WH_C],
        [
          { key: 'alive', fromSystemId: JITA, toSystemId: WH_A },
          { key: 'in-grace', fromSystemId: JITA, toSystemId: WH_B },
          { key: 'windowless', fromSystemId: JITA, toSystemId: WH_C },
        ],
      );
      await patchConnection(t, ids.alive!, {
        lifetime: {
          kind: 'window',
          earliestAt: NOW + 30_000,
          latestAt: NOW + 60_000,
          lifeStage: null,
          observedAt: null,
        },
      });
      await patchConnection(t, ids['in-grace']!, {
        lifetime: {
          kind: 'window',
          earliestAt: NOW - CEILING_COLLAPSE_GRACE_MS,
          latestAt: NOW - CEILING_COLLAPSE_GRACE_MS + 60_000,
          lifeStage: null,
          observedAt: null,
        },
      });

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 0, removedStubs: 0, skipped: 0, failed: 0, hasMore: false });
      for (const key of ['alive', 'in-grace', 'windowless'] as const) {
        expect(tombstoneDeletedAt(await readConnection(t, ids[key]!))).toBe(null);
      }
      expect(await readEvents(t)).toEqual([]);
    });

    it('retains a branch holding a tracked pilot and removes the dead connection alone', async () => {
      const t = convexTest(schema, modules);
      const ids = await seedTopology(
        t,
        [JITA, WH_A, WH_B],
        [
          { key: 'cut', fromSystemId: JITA, toSystemId: WH_A },
          { key: 'a-b', fromSystemId: WH_A, toSystemId: WH_B },
        ],
      );
      await patchConnection(t, ids.cut!, {
        lifetime: {
          kind: 'window',
          earliestAt: EXPIRED - 60_000,
          latestAt: EXPIRED,
          lifeStage: null,
          observedAt: null,
        },
      });
      await trackPilotAt(t, WH_B);

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 1, removedStubs: 0, skipped: 0, failed: 0, hasMore: false });

      expect(tombstoneDeletedAt(await readConnection(t, ids.cut!))).toBe(NOW);
      expect(tombstoneDeletedAt(await readConnection(t, ids['a-b']!))).toBe(null);
      expect(await readSystem(t, WH_A)).toMatchObject({ deletedAt: null });
      expect(await readSystem(t, WH_B)).toMatchObject({ deletedAt: null });
      expect(await readEvents(t)).toEqual([
        expect.objectContaining({
          kind: 'connection_severed_retained',
          actor: CEILING_SWEEP_ACTOR,
          payload: { connectionId: String(ids.cut!) },
        }),
      ]);
    });

    it('tombstones an expired stub, skips tombstoned rows, and repeats without writes', async () => {
      const t = convexTest(schema, modules);
      await seedEmpty(t);
      const { stubId, deadId } = await t.run(async (ctx) => {
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: JITA,
          deletedAt: null,
          purgeAfter: null,
        });
        const stub = await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: null,
          fromSignatureId: 'WHL-009',
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deathEarliestAt: EXPIRED - 60_000,
          deathLatestAt: EXPIRED,
          deletedAt: null,
          purgeAfter: null,
        }));
        await ctx.db.insert('mapSignatureActivity', {
          mapId: MAP_A,
          systemId: JITA,
          signatureId: 'WHL-009',
          lastSeenAt: NOW - 60_000,
        });
        const dead = await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: null,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deathEarliestAt: EXPIRED - 60_000,
          deathLatestAt: EXPIRED,
          deletedAt: NOW - 120_000,
          purgeAfter: NOW + 60_000,
        }));
        return { stubId: stub, deadId: dead };
      });

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 0, removedStubs: 1, skipped: 0, failed: 0, hasMore: false });
      expect(await readConnection(t, stubId)).toMatchObject({
        tombstone: {
          kind: 'removed',
          deletedAt: NOW,
          purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
        },
      });
      expect(tombstoneDeletedAt(await readConnection(t, deadId))).toBe(NOW - 120_000);
      const activities = await t.run(async (ctx) =>
        await ctx.db
          .query('mapSignatureActivity')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(activities).toEqual([]);
      expect(await readEvents(t)).toEqual([
        expect.objectContaining({
          kind: 'signatures_removed',
          actor: CEILING_SWEEP_ACTOR,
          payload: { systemId: JITA, signatureIds: ['WHL-009'] },
        }),
      ]);

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 0, removedStubs: 0, skipped: 0, failed: 0, hasMore: false });
      expect(tombstoneDeletedAt(await readConnection(t, stubId))).toBe(NOW);
    });

    it('tombstoned expired rows never occupy the sweep batch', async () => {
      const t = convexTest(schema, modules);
      await seedEmpty(t);
      const stubId = await t.run(async (ctx) => {
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: JITA,
          deletedAt: null,
          purgeAfter: null,
        });
        for (let i = 0; i < 9; i += 1) {
          await ctx.db.insert('mapConnections', connectionInsert({
            mapId: MAP_A,
            fromSystemId: JITA,
            toSystemId: null,
            wormholeTypeCode: null,
            massState: null,
            shipSize: null,
            deathEarliestAt: EXPIRED - 120_000,
            deathLatestAt: EXPIRED - 60_000 + i,
            deletedAt: NOW - 120_000,
            purgeAfter: NOW + 60_000,
          }));
        }
        return await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: null,
          fromSignatureId: 'WHL-010',
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deathEarliestAt: EXPIRED - 60_000,
          deathLatestAt: EXPIRED,
          deletedAt: null,
          purgeAfter: null,
        }));
      });

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 0, removedStubs: 1, skipped: 0, failed: 0, hasMore: false });
      expect(tombstoneDeletedAt(await readConnection(t, stubId))).toBe(NOW);
    });

    it('falls back to removing just the connection when a map cannot collapse, and sweeps the rest', async () => {
      const t = convexTest(schema, modules);
      await seedEmpty(t);
      const { poisonedA, poisonedB, otherStub } = await t.run(async (ctx) => {
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: JITA,
          deletedAt: null,
          purgeAfter: null,
        });
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: WH_A,
          deletedAt: null,
          purgeAfter: null,
        });
        for (let i = 0; i < 128; i += 1) {
          await ctx.db.insert('mapConnections', connectionInsert({
            mapId: MAP_A,
            fromSystemId: JITA,
            toSystemId: null,
            wormholeTypeCode: null,
            massState: null,
            shipSize: null,
            deathEarliestAt: null,
            deathLatestAt: null,
            deletedAt: null,
            purgeAfter: null,
          }));
        }
        const resolvedShape = {
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: WH_A,
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deletedAt: null,
          purgeAfter: null,
        };
        const a = await ctx.db.insert('mapConnections', connectionInsert({
          ...resolvedShape,
          deathEarliestAt: EXPIRED - 60_000,
          deathLatestAt: EXPIRED,
        }));
        const b = await ctx.db.insert('mapConnections', connectionInsert({
          ...resolvedShape,
          deathEarliestAt: EXPIRED - 60_000,
          deathLatestAt: EXPIRED + 100,
        }));
        const stub = await ctx.db.insert('mapConnections', connectionInsert({
          mapId: 'map-elsewhere',
          fromSystemId: AMARR,
          toSystemId: null,
          fromSignatureId: 'WHL-011',
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deathEarliestAt: EXPIRED - 60_000,
          deathLatestAt: EXPIRED + 200,
          deletedAt: null,
          purgeAfter: null,
        }));
        return { poisonedA: a, poisonedB: b, otherStub: stub };
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 0, removedStubs: 1, skipped: 0, failed: 2, hasMore: false });
      expect(tombstoneDeletedAt(await readConnection(t, poisonedA))).toBe(NOW);
      expect(tombstoneDeletedAt(await readConnection(t, poisonedB))).toBe(NOW);
      expect(tombstoneDeletedAt(await readConnection(t, otherStub))).toBe(NOW);
      // The systems stay on the map; only the first failure attempts a collapse and logs it.
      const systems = await t.run(async (ctx) => await ctx.db.query('mapSystems').collect());
      expect(systems.every((system) => system.deletedAt === null)).toBe(true);
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(JSON.parse(errorSpy.mock.calls[0]![0] as string)).toMatchObject({
        scope: 'map:ceiling-collapse',
        outcome: 'fallback',
        mapId: MAP_A,
        error: 'MAP_TOO_LARGE',
      });
      const events = await t.run(async (ctx) => await ctx.db.query('mapEvents').collect());
      expect(events.filter((event) => event.kind === 'connection_severed_retained')).toHaveLength(2);
    });

    it('continues a full batch until every due stub is removed', async () => {
      const t = convexTest(schema, modules);
      await seedEmpty(t);
      const stubIds = await t.run(async (ctx) => {
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: JITA,
          deletedAt: null,
          purgeAfter: null,
        });
        const ids: Id<'mapConnections'>[] = [];
        for (let i = 0; i <= CEILING_SWEEP_BATCH; i += 1) {
          ids.push(await ctx.db.insert('mapConnections', connectionInsert({
            mapId: MAP_A,
            fromSystemId: JITA,
            toSystemId: null,
            wormholeTypeCode: null,
            massState: null,
            shipSize: null,
            deathEarliestAt: EXPIRED - 60_000,
            deathLatestAt: EXPIRED + i,
            deletedAt: null,
            purgeAfter: null,
          })));
        }
        return ids;
      });

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toEqual({ collapsed: 0, removedStubs: CEILING_SWEEP_BATCH, skipped: 0, failed: 0, hasMore: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      for (const stubId of stubIds) {
        expect(tombstoneDeletedAt(await readConnection(t, stubId))).toBe(NOW);
      }
    });

    it('never lets failing rows clog the line ahead of healthy ones', async () => {
      const t = convexTest(schema, modules);
      await seedEmpty(t);
      await t.run(async (ctx) => {
        for (const systemId of [JITA, WH_A]) {
          await ctx.db.insert('mapSystems', {
            mapId: MAP_A,
            systemId,
            deletedAt: null,
            purgeAfter: null,
          });
        }
        // Enough unresolved doors on JITA to make every collapse on this map fail.
        for (let i = 0; i < 128; i += 1) {
          await ctx.db.insert('mapConnections', connectionInsert({
            mapId: MAP_A,
            fromSystemId: JITA,
            toSystemId: null,
            wormholeTypeCode: null,
            massState: null,
            shipSize: null,
            deathEarliestAt: null,
            deathLatestAt: null,
            deletedAt: null,
            purgeAfter: null,
          }));
        }
        for (let i = 0; i <= CEILING_SWEEP_SCAN; i += 1) {
          await ctx.db.insert('mapConnections', connectionInsert({
            mapId: MAP_A,
            fromSystemId: JITA,
            toSystemId: WH_A,
            wormholeTypeCode: null,
            massState: null,
            shipSize: null,
            deathEarliestAt: EXPIRED - 60_000,
            deathLatestAt: EXPIRED + i,
            deletedAt: null,
            purgeAfter: null,
          }));
        }
      });

      const healthyStub = await t.run(async (ctx) =>
        await ctx.db.insert('mapConnections', connectionInsert({
          mapId: 'map-elsewhere',
          fromSystemId: AMARR,
          toSystemId: null,
          fromSignatureId: 'WHL-012',
          wormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deathEarliestAt: EXPIRED - 60_000,
          deathLatestAt: EXPIRED + CEILING_SWEEP_SCAN + 1,
          deletedAt: null,
          purgeAfter: null,
        })),
      );
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      expect(await t.mutation(internal.mapAuthoringSweep.collapseExpiredConnections, {}))
        .toMatchObject({ collapsed: 0, removedStubs: 0, failed: CEILING_SWEEP_BATCH, hasMore: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(tombstoneDeletedAt(await readConnection(t, healthyStub))).toBe(NOW);
      const stillDue = await t.run(async (ctx) =>
        (await ctx.db.query('mapConnections').collect()).filter(
          (row) => row.toSystemId !== null && row.tombstone.kind === 'live',
        ),
      );
      expect(stillDue).toEqual([]);
    });

    it('keeps one collapse-decision owner', () => {
      const collapseSource = readFileSync('convex/mapAuthoringCollapse.ts', 'utf8');
      const selectionSource = readFileSync('convex/lib/mapScanSelection.ts', 'utf8');

      expect(collapseSource.match(/decideCollapse\(/g)).toHaveLength(1);
      expect(selectionSource).toContain('runCollapse(');
      expect(collapseSource).toContain('runCollapse(ctx, {');
      expect(collapseSource).toContain('gatedAuthoringEdit');
    });
  });
});
