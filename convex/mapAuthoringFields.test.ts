// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import {
  lifetimeObservedAt,
  lifetimeStage,
} from '@/data/maps/connection-hallway';
import schema from './schema';

import { connectionInsert } from './__tests__/connection-doc.setup';
import { modules } from './__tests__/modules.setup';
import {
  AMARR,
  DODIXIE,
  JITA,
  MAP_A,
  NOW,
  WH_A,
  WH_ROOT,
  asUser,
  expectConvexError,
  readConnection,
  readSystem,
  seedHome,
  seedJump,
  installAuthoringTimers,
  restoreAuthoringTimers,
  type Chain,
} from './__tests__/mapAuthoring.setup';

beforeEach(() => {
  installAuthoringTimers();
});

afterEach(() => {
  restoreAuthoringTimers();
});

describe('map authoring', () => {
  describe('field setters equality-skip', () => {
    it.each([
      {
        name: 'setConnectionShipSize',
        write: (t: Chain, connectionId: Parameters<typeof readConnection>[1]) =>
          asUser(t).mutation(api.mapAuthoringFields.setConnectionShipSize, {
            mapId: MAP_A,
            connectionId,
            value: 'L',
          }),
        stored: { shipSize: 'L' },
      },
      {
        name: 'setConnectionMassState',
        write: (t: Chain, connectionId: Parameters<typeof readConnection>[1]) =>
          asUser(t).mutation(api.mapAuthoringFields.setConnectionMassState, {
            mapId: MAP_A,
            connectionId,
            value: 'reduced',
          }),
        stored: { massState: 'reduced' },
      },
      {
        name: 'setConnectionLifeStage',
        write: (t: Chain, connectionId: Parameters<typeof readConnection>[1]) =>
          asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
            mapId: MAP_A,
            connectionId,
            value: 'under_4_hours',
          }),
        stored: { lifetime: { kind: 'stage', lifeStage: 'under_4_hours' } },
      },
    ])('$name writes once then no-ops on the same value', async ({ write, stored }) => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await write(t, connectionId);
      const afterFirst = await readConnection(t, connectionId);
      expect(afterFirst).toMatchObject(stored);

      const result = await write(t, connectionId);
      expect(result).toEqual({ changed: false });

      const afterSecond = await readConnection(t, connectionId);
      expect(afterSecond).toEqual(afterFirst);
    });

    it('returns mutated then idle for a repeated wormhole type with no claim', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'C247',
        }),
      ).resolves.toEqual({ kind: 'mutated' });
      const afterFirst = await readConnection(t, connectionId);
      expect(afterFirst).toMatchObject({
        from: expect.objectContaining({ typeCode: 'C247' }),
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'C247',
        }),
      ).resolves.toEqual({ kind: 'idle' });
      expect(await readConnection(t, connectionId)).toEqual(afterFirst);
    });

    it('returns claimed when a no-field-change type set absorbs a static placeholder', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t, WH_ROOT);
      await t.mutation(internal.mapStatics.applyStaticPlaceholders, {
        mapId: MAP_A,
        systemId: WH_ROOT,
        codes: ['C247'],
      });
      await t.run(async (ctx) => {
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: WH_A,
          deletedAt: null,
          purgeAfter: null,
        });
      });
      const resolvedId = await t.run(async (ctx) =>
        ctx.db.insert('mapConnections', {
          ...connectionInsert({
            mapId: MAP_A,
            fromSystemId: WH_ROOT,
            toSystemId: WH_A,
            wormholeTypeCode: 'C247',
            typedSide: 'from',
            typeProvenance: 'human',
          }),
          seatOrderAt: NOW + 80,
        }),
      );
      const placeholder = await t.run(async (ctx) => {
        const rows = await ctx.db
          .query('mapConnections')
          .withIndex('by_map_from', (q) => q.eq('mapId', MAP_A).eq('fromSystemId', WH_ROOT))
          .collect();
        return rows.find((row) => row.staticCode === 'C247' && row.from.signatureId === null);
      });
      expect(placeholder).toBeDefined();
      if (placeholder === undefined) throw new Error('Expected a C247 static placeholder');

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId: resolvedId,
          value: 'C247',
        }),
      ).resolves.toEqual({ kind: 'claimed' });
      expect(await readConnection(t, resolvedId)).toMatchObject({
        _id: resolvedId,
        staticCode: 'C247',
        toSystemId: WH_A,
      });
      expect(await readConnection(t, placeholder._id)).toBeNull();
    });

    it('stamps lifeStageObservedAt on change and leaves it on an equal re-pick', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_hour',
      });
      const stamped = await readConnection(t, connectionId);
      expect(lifetimeObservedAt(stamped!.lifetime)).toBe(NOW);

      vi.setSystemTime(NOW + 60_000);
      await asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_hour',
      });
      expect(await readConnection(t, connectionId)).toEqual(stamped);

      await asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'expired',
      });
      const restamped = await readConnection(t, connectionId);
      expect(lifetimeStage(restamped!.lifetime)).toBe('expired');
      expect(lifetimeObservedAt(restamped!.lifetime)).toBe(NOW + 60_000);
    });

    it('re-stamps the mass odometer anchor after new travel even for the same shake state', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(connectionId, { observedMassKg: 10_000_000 });
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionMassState, {
          mapId: MAP_A,
          connectionId,
          value: 'reduced',
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        massState: 'reduced',
        observedMassAtStateKg: 10_000_000,
      });

      await t.run(async (ctx) => {
        await ctx.db.patch(connectionId, { observedMassKg: 25_000_000 });
      });
      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionMassState, {
          mapId: MAP_A,
          connectionId,
          value: 'reduced',
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        massState: 'reduced',
        observedMassAtStateKg: 25_000_000,
      });
    });

    it('records manual type identity and clears pending automatic candidates on edits', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(connectionId, {
          resolution: {
            kind: 'pending',
            provenance: 'assumed',
            candidateIds: [connectionId],
            characterId: 1,
          },
        });
      });

      await asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
        mapId: MAP_A,
        connectionId,
        value: 'C247',
      });
      expect(await readConnection(t, connectionId)).toMatchObject({
        from: expect.objectContaining({ typeCode: 'C247' }),
        to: expect.objectContaining({ typeCode: 'K162' }),
        identity: { kind: 'typed', provenance: 'human' },
      });
      await asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
        mapId: MAP_A,
        connectionId,
        value: 'B274',
        side: 'to',
      });
      const afterTo = await readConnection(t, connectionId);
      expect(afterTo).toMatchObject({
        from: expect.objectContaining({ typeCode: 'C247' }),
        to: expect.objectContaining({ typeCode: 'B274' }),
        identity: { kind: 'typed', provenance: 'human' },
      });
      expect(
        afterTo?.resolution.kind === 'pending'
          ? afterTo.resolution.candidateIds
          : undefined,
      ).toBeUndefined();
      const mintedKey = afterTo?.observationKey;
      expect(mintedKey).toEqual(expect.any(String));
      await asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
        mapId: MAP_A,
        connectionId,
        value: 'B274',
        side: 'to',
      });
      expect((await readConnection(t, connectionId))?.observationKey).toBe(mintedKey);

      await asUser(t).mutation(api.mapAuthoringFields.setConnectionDestinationHint, {
        mapId: MAP_A,
        connectionId,
        side: 'to',
        value: 'dangerous',
      });
      expect(await readConnection(t, connectionId)).toMatchObject({
        identity: { kind: 'typed', provenance: 'human' },
        toSystemId: AMARR,
        to: expect.objectContaining({ leadsTo: { kind: 'hint', hint: 'dangerous' } }),
      });

      await asUser(t).mutation(api.mapAuthoringFields.setConnectionDestinationHint, {
        mapId: MAP_A,
        connectionId,
        side: 'to',
        value: null,
      });
      const clearedHint = await readConnection(t, connectionId);
      expect(
        clearedHint?.to.leadsTo.kind === 'hint' ? clearedHint.to.leadsTo.hint : undefined,
      ).toBeUndefined();
    });
  });

  describe('connection destination notes', () => {
    it('writes a Leads-to note without moving the line or spawning a system', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestination, {
          mapId: MAP_A,
          connectionId,
          side: 'from',
          value: AMARR,
        }),
      ).resolves.toEqual({ changed: false });
      expect(await readConnection(t, connectionId)).toMatchObject({
        fromSystemId: JITA,
        toSystemId: AMARR,
      });
      const afterSame = await readConnection(t, connectionId);
      expect(
        afterSame?.from.leadsTo.kind === 'system' ? afterSame.from.leadsTo.systemId : undefined,
      ).toBeUndefined();

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestination, {
          mapId: MAP_A,
          connectionId,
          side: 'from',
          value: DODIXIE,
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        fromSystemId: JITA,
        toSystemId: AMARR,
        from: expect.objectContaining({ leadsTo: { kind: 'system', systemId: DODIXIE } }),
      });
      const afterNote = await readConnection(t, connectionId);
      expect(afterNote?.resolution).toEqual({ kind: 'open' });
      expect(await readSystem(t, DODIXIE)).toBeNull();
      expect(await readSystem(t, AMARR)).toMatchObject({
        systemId: AMARR,
        deletedAt: null,
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestination, {
          mapId: MAP_A,
          connectionId,
          side: 'to',
          value: DODIXIE,
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        fromSystemId: JITA,
        toSystemId: AMARR,
        from: expect.objectContaining({ leadsTo: { kind: 'system', systemId: DODIXIE } }),
        to: expect.objectContaining({ leadsTo: { kind: 'system', systemId: DODIXIE } }),
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestination, {
          mapId: MAP_A,
          connectionId,
          side: 'from',
          value: JITA,
        }),
      ).rejects.toThrow('SELF_LOOP');

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestination, {
          mapId: MAP_A,
          connectionId,
          side: 'from',
          value: null,
        }),
      ).resolves.toEqual({ changed: true });
      const cleared = await readConnection(t, connectionId);
      expect(cleared?.toSystemId).toBe(AMARR);
      expect(cleared?.from.leadsTo.kind).toBe('unset');
      expect(cleared?.to.leadsTo).toEqual({ kind: 'system', systemId: DODIXIE });

      await asUser(t).mutation(api.mapAuthoringFields.setConnectionDestinationHint, {
        mapId: MAP_A,
        connectionId,
        side: 'from',
        value: 'dangerous',
      });
      expect(await readConnection(t, connectionId)).toMatchObject({
        toSystemId: AMARR,
        from: expect.objectContaining({ leadsTo: { kind: 'hint', hint: 'dangerous' } }),
      });
    });

    it('leaves jump identity and pending answers alone when a Leads-to note changes', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(connectionId, {
          resolution: {
            kind: 'pending',
            provenance: 'assumed',
            candidateIds: [connectionId],
            characterId: 21_198_055_274,
          },
        });
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestination, {
          mapId: MAP_A,
          connectionId,
          side: 'from',
          value: DODIXIE,
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        from: expect.objectContaining({ leadsTo: { kind: 'system', systemId: DODIXIE } }),
        resolution: {
          kind: 'pending',
          provenance: 'assumed',
          candidateIds: [connectionId],
          characterId: 21_198_055_274,
        },
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestinationHint, {
          mapId: MAP_A,
          connectionId,
          side: 'from',
          value: 'dangerous',
        }),
      ).resolves.toEqual({ changed: true });
      const afterHint = await readConnection(t, connectionId);
      expect(afterHint).toMatchObject({
        from: expect.objectContaining({ leadsTo: { kind: 'hint', hint: 'dangerous' } }),
        resolution: {
          kind: 'pending',
          provenance: 'assumed',
          candidateIds: [connectionId],
          characterId: 21_198_055_274,
        },
      });
      expect(afterHint?.from.leadsTo.kind === 'system' ? afterHint.from.leadsTo.systemId : undefined)
        .toBeUndefined();

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionDestination, {
          mapId: MAP_A,
          connectionId,
          side: 'from',
          value: null,
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        resolution: {
          kind: 'pending',
          provenance: 'assumed',
          candidateIds: [connectionId],
          characterId: 21_198_055_274,
        },
      });
    });
  });

  describe('connection death windows', () => {
    const HOUR_MS = 60 * 60 * 1000;

    it('accepts same-bucket narrowing, stamps it, and resets a contradiction', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_day',
        deathEarliestAt: NOW + 4 * HOUR_MS,
        deathLatestAt: NOW + 16 * HOUR_MS,
      });
      expect(await readConnection(t, connectionId)).toMatchObject({
        lifetime: {
          kind: 'window',
          lifeStage: 'under_1_day',
          observedAt: NOW,
          earliestAt: NOW + 4 * HOUR_MS,
          latestAt: NOW + 16 * HOUR_MS,
        },
      });

      vi.setSystemTime(NOW + HOUR_MS);
      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
          mapId: MAP_A,
          connectionId,
          value: 'under_1_day',
          deathEarliestAt: NOW + 5 * HOUR_MS,
          deathLatestAt: NOW + 17 * HOUR_MS,
        }),
      ).resolves.toEqual({ changed: true });
      expect(await readConnection(t, connectionId)).toMatchObject({
        lifetime: {
          kind: 'window',
          lifeStage: 'under_1_day',
          observedAt: NOW + HOUR_MS,
          earliestAt: NOW + 5 * HOUR_MS,
          latestAt: NOW + 16 * HOUR_MS,
        },
      });

      vi.setSystemTime(NOW + 2 * HOUR_MS);
      await asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'expired',
        deathEarliestAt: NOW + 2 * HOUR_MS,
        deathLatestAt: NOW + 2 * HOUR_MS,
      });
      expect(await readConnection(t, connectionId)).toMatchObject({
        lifetime: {
          kind: 'window',
          lifeStage: 'expired',
          observedAt: NOW + 2 * HOUR_MS,
          earliestAt: NOW + 2 * HOUR_MS,
          latestAt: NOW + 2 * HOUR_MS,
        },
      });
    });

    it('intersects a type-pick ceiling and skips only the true no-op', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
        mapId: MAP_A,
        connectionId,
        value: 'under_1_day',
        deathEarliestAt: NOW + 4 * HOUR_MS,
        deathLatestAt: NOW + 24 * HOUR_MS,
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'C247',
          deathEarliestAt: NOW,
          deathLatestAt: NOW + 16 * HOUR_MS,
        }),
      ).resolves.toEqual({ kind: 'mutated' });
      const typed = await readConnection(t, connectionId);
      expect(typed).toMatchObject({
        from: expect.objectContaining({ typeCode: 'C247' }),
        lifetime: expect.objectContaining({
          kind: 'window',
          earliestAt: NOW + 4 * HOUR_MS,
          latestAt: NOW + 16 * HOUR_MS,
        }),
      });

      await expect(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'C247',
          deathEarliestAt: NOW + 4 * HOUR_MS,
          deathLatestAt: NOW + 16 * HOUR_MS,
        }),
      ).resolves.toEqual({ kind: 'idle' });
      expect(await readConnection(t, connectionId)).toEqual(typed);
    });

    it('refuses partial, inverted, and non-finite death-window pairs', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);

      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
          mapId: MAP_A,
          connectionId,
          value: 'under_1_day',
          deathEarliestAt: NOW,
        }),
        'INVALID_DEATH_WINDOW',
      );
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
          mapId: MAP_A,
          connectionId,
          value: 'under_1_day',
          deathEarliestAt: NOW + 1,
          deathLatestAt: NOW,
        }),
        'INVALID_DEATH_WINDOW',
      );
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionLifeStage, {
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
});
