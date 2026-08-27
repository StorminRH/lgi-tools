// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import {
  AMARR,
  JITA,
  MAP_A,
  NOW,
  asUser,
  expectConvexError,
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
      await expectConvexError(
        asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
          mapId: MAP_A,
          systemId: JITA,
        }),
        'SYSTEM_IN_USE',
      );
      await expectConvexError(
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
      await expectConvexError(
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
