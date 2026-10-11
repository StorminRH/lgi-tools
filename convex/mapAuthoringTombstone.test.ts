// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import { connectionInsert } from './__tests__/connection-doc.setup';
import { expectConvexErrorCode } from './__tests__/convexTest.setup';
import {
  AMARR,
  JITA,
  MAP_A,
  NOW,
  WH_ROOT,
  asUser,
  readConnection,
  readSystem,
  seedHome,
  seedJump,
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
  describe('tombstone and restore', () => {
    it('round-trips system identity including _id and _creationTime', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      const before = await readSystem(t, JITA);
      expect(before).not.toBeNull();

      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
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

      await asUser(t).mutation(internal.mapAuthoringTombstone.restoreSystem, {
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
      await asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
        mapId: MAP_A,
        connectionId,
        value: 'C247',
      });
      const before = await readConnection(t, connectionId);
      expect(before).not.toBeNull();

      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneConnection, {
        mapId: MAP_A,
        connectionId,
      });
      const tombstoned = await readConnection(t, connectionId);
      expect(tombstoned).toMatchObject({
        _id: before!._id,
        _creationTime: before!._creationTime,
        from: expect.objectContaining({ typeCode: 'C247' }),
        tombstone: {
          kind: 'removed',
          deletedAt: NOW,
          purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
        },
      });

      await asUser(t).mutation(api.mapAuthoringTombstone.restoreConnection, {
        mapId: MAP_A,
        connectionId,
      });
      expect(await readConnection(t, connectionId)).toEqual(before);
    });

    it('refuses to tombstone a system while a live connection references it', async () => {
      const t = convexTest(schema, modules);
      await seedJump(t);
      await expectConvexErrorCode(
        asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
          mapId: MAP_A,
          systemId: JITA,
        }),
        'SYSTEM_IN_USE',
      );
      await expectConvexErrorCode(
        asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
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
      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneConnection, {
        mapId: MAP_A,
        connectionId,
      });
      await expect(
        asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
          mapId: MAP_A,
          systemId: AMARR,
        }),
      ).resolves.toEqual({ tombstoned: true });
    });

    it('bounds the liveness proof on inbound connections alone, then tombstones at the bound', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      // 33 removed inbound doors and no origin doors: one past the 32-connection proof bound.
      const inbound = await t.run(async (ctx) => await Promise.all(
        Array.from({ length: 33 }, (_, index) => ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP_A,
          fromSystemId: WH_ROOT + index,
          toSystemId: JITA,
          deletedAt: NOW - 1,
          purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
        }))),
      ));

      const refused = await expectConvexErrorCode(
        asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
          mapId: MAP_A,
          systemId: JITA,
        }),
        'MAP_TOO_LARGE',
      );
      expect(refused.data).toEqual({
        code: 'MAP_TOO_LARGE',
        detail: `Map ${MAP_A} exceeds the 32-connection liveness proof bound for system ${JITA}.`,
      });
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: null });

      await t.run(async (ctx) => ctx.db.delete('mapConnections', inbound[0]!));
      await expect(
        asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
          mapId: MAP_A,
          systemId: JITA,
        }),
      ).resolves.toEqual({ tombstoned: true });
      expect(await readSystem(t, JITA)).toMatchObject({ deletedAt: NOW });
    });

    it('refuses to restore a connection whose endpoint is tombstoned', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneConnection, {
        mapId: MAP_A,
        connectionId,
      });
      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
        mapId: MAP_A,
        systemId: AMARR,
      });
      await expectConvexErrorCode(
        asUser(t).mutation(api.mapAuthoringTombstone.restoreConnection, {
          mapId: MAP_A,
          connectionId,
        }),
        'ENDPOINT_TOMBSTONED',
      );
    });

    it('writes nothing on repeated tombstone or restore of the current state', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const tombstoned = await readSystem(t, JITA);

      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      expect(await readSystem(t, JITA)).toEqual(tombstoned);

      await asUser(t).mutation(internal.mapAuthoringTombstone.restoreSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const restored = await readSystem(t, JITA);
      await asUser(t).mutation(internal.mapAuthoringTombstone.restoreSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      expect(await readSystem(t, JITA)).toEqual(restored);
    });
  });
});
