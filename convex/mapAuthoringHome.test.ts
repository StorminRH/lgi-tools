// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

import { tombstoneDeletedAt } from '@/data/maps/chain-contract';
import { modules } from './__tests__/modules.setup';
import {
  AMARR,
  DODIXIE,
  JITA,
  MAP_A,
  VIEWER,
  asUser,
  expectConvexError,
  readConnection,
  readSystem,
  seedEmpty,
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

const PUBLIC_MUTATIONS = [
  { name: 'setHomeSystem', fn: api.mapAuthoringHome.setHomeSystem },
  { name: 'addSystemFromNode', fn: api.mapAuthoringHome.addSystemFromNode },
  { name: 'setConnectionWormholeType', fn: api.mapAuthoringFields.setConnectionWormholeType },
  { name: 'setConnectionDestinationHint', fn: api.mapAuthoringFields.setConnectionDestinationHint },
  { name: 'setConnectionDestination', fn: api.mapAuthoringFields.setConnectionDestination },
  { name: 'setConnectionShipSize', fn: api.mapAuthoringFields.setConnectionShipSize },
  { name: 'setConnectionMassState', fn: api.mapAuthoringFields.setConnectionMassState },
  { name: 'setConnectionLifeStage', fn: api.mapAuthoringFields.setConnectionLifeStage },
  { name: 'severConnection', fn: api.mapAuthoringCollapse.severConnection },
  { name: 'restoreSeveredBranch', fn: api.mapAuthoringCollapse.restoreSeveredBranch },
  { name: 'restoreConnection', fn: api.mapAuthoringTombstone.restoreConnection },
] as const;

async function argsFor(
  t: Chain,
  name: (typeof PUBLIC_MUTATIONS)[number]['name'],
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'setHomeSystem':
      await seedEmpty(t);
      return { mapId: MAP_A, systemId: JITA };
    case 'addSystemFromNode':
      await seedHome(t);
      return { mapId: MAP_A, fromSystemId: JITA, toSystemId: AMARR };
    case 'setConnectionWormholeType':
    case 'setConnectionDestinationHint':
    case 'setConnectionDestination':
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
      if (name === 'setConnectionDestinationHint') {
        return { mapId: MAP_A, connectionId, side: 'from', value: 'dangerous' };
      }
      if (name === 'setConnectionDestination') {
        return { mapId: MAP_A, connectionId, side: 'from', value: DODIXIE };
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

describe('map authoring', () => {
  describe('gates every public mutation', () => {
    it.each(PUBLIC_MUTATIONS)(
      'rejects a signed-out $name as UNAUTHENTICATED',
      async ({ name, fn }) => {
        const t = convexTest(schema, modules);
        const args = await argsFor(t, name);
        await expectConvexError(
          t.mutation(fn, args as never),
          'UNAUTHENTICATED',
        );
      },
    );

    it.each(PUBLIC_MUTATIONS)(
      'rejects a viewer $name as FORBIDDEN',
      async ({ name, fn }) => {
        const t = convexTest(schema, modules);
        const args = await argsFor(t, name);
        await expectConvexError(
          asUser(t, VIEWER).mutation(fn, args as never),
          'FORBIDDEN',
        );
      },
    );

    it('rejects an invalid wormhole code only after the edit gate', async () => {
      const t = convexTest(schema, modules);
      const { connectionId } = await seedJump(t);
      await expectConvexError(
        asUser(t, VIEWER).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'not-a-code',
        }),
        'FORBIDDEN',
      );
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
          mapId: MAP_A,
          connectionId,
          value: 'not-a-code',
        }),
        'INVALID_WORMHOLE_CODE',
      );
    });

    it('internalizes the .1 helpers and exposes only the unified destructive surface', () => {
      const publicMutations = [
        'convex/mapAuthoringHome.ts',
        'convex/mapAuthoringFields.ts',
        'convex/mapAuthoringCollapse.ts',
        'convex/mapAuthoringTombstone.ts',
      ].flatMap((path) =>
        [...readFileSync(path, 'utf8').matchAll(/export const (\w+) = mutation\(/g)]
          .map((match) => match[1]),
      );
      expect(publicMutations).toEqual([
        'setHomeSystem',
        'addSystemFromNode',
        'setConnectionWormholeType',
        'setConnectionDestinationHint',
        'setConnectionDestination',
        'setConnectionShipSize',
        'setConnectionMassState',
        'setConnectionLifeStage',
        'severConnection',
        'restoreSeveredBranch',
        'restoreConnection',
      ]);
      const tombstoneSource = readFileSync('convex/mapAuthoringTombstone.ts', 'utf8');
      for (const name of [
        'tombstoneSystem',
        'tombstoneConnection',
        'restoreSystem',
      ]) {
        expect(tombstoneSource).toContain(`export const ${name} = internalMutation(`);
      }
    });
  });

  describe('setHomeSystem', () => {
    it('refuses when a live system already exists (MAP_NOT_EMPTY)', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringHome.setHomeSystem, {
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
      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const id = await asUser(t).mutation(api.mapAuthoringHome.setHomeSystem, {
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

  describe('addSystemFromNode', () => {
    it('refuses an origin absent from the map (UNKNOWN_ORIGIN)', async () => {
      const t = convexTest(schema, modules);
      await seedHome(t);
      await expectConvexError(
        asUser(t).mutation(api.mapAuthoringHome.addSystemFromNode, {
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
        asUser(t).mutation(api.mapAuthoringHome.addSystemFromNode, {
          mapId: MAP_A,
          fromSystemId: JITA,
          toSystemId: JITA,
        }),
        'SELF_LOOP',
      );
    });

    it('authors a new line when the destination is already in trash', async () => {
      const t = convexTest(schema, modules);
      const { connectionId: trashedId } = await seedJump(t);
      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneConnection, {
        mapId: MAP_A,
        connectionId: trashedId,
      });
      await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
        mapId: MAP_A,
        systemId: AMARR,
      });
      const added = await asUser(t).mutation(api.mapAuthoringHome.addSystemFromNode, {
        mapId: MAP_A,
        fromSystemId: JITA,
        toSystemId: AMARR,
      });
      expect(added.connectionId).not.toBe(trashedId);
      expect(await readSystem(t, AMARR)).toMatchObject({ deletedAt: null });
      expect(tombstoneDeletedAt(await readConnection(t, trashedId))).toEqual(expect.any(Number));
      expect(await readConnection(t, added.connectionId)).toMatchObject({
        fromSystemId: JITA,
        toSystemId: AMARR,
        tombstone: { kind: 'live' },
      });
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
      await asUser(t).mutation(api.mapAuthoringHome.addSystemFromNode, {
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
});
