import { type TestConvex } from 'convex-test';
import { expect, vi } from 'vitest';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import schema from '../schema';

import { connectionInsert } from './connection-doc.setup';

export const MAP_A = 'map-a';
export const EDITOR = 'user-editor';
export const VIEWER = 'user-viewer';
export const NOW = 1_800_000_000_000;
export const JITA = 30_000_142;
export const AMARR = 30_002_187;
export const DODIXIE = 30_002_659;
export const WH_ROOT = 31_000_001;
export const WH_A = 31_000_002;
export const WH_B = 31_000_003;
export const WH_C = 31_000_004;

export type Chain = TestConvex<typeof schema>;

export function installAuthoringTimers(): void {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

export function restoreAuthoringTimers(): void {
  vi.useRealTimers();
}

export function asUser(t: Chain, userId = EDITOR, name = 'Editor Pilot') {
  return t.withIdentity({ subject: userId, name });
}

async function grant(
  t: Chain,
  mapId: string,
  userId: string,
  roles: ('viewer' | 'editor' | 'admin')[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
  });
}

export async function expectConvexError(call: Promise<unknown>, code: string): Promise<void> {
  await expect(call).rejects.toThrow(code);
}

export async function seedEmpty(t: Chain): Promise<void> {
  await grant(t, MAP_A, EDITOR, ['editor']);
  await grant(t, MAP_A, VIEWER, ['viewer']);
}

export async function seedHome(t: Chain, systemId = JITA): Promise<Id<'mapSystems'>> {
  await seedEmpty(t);
  return await asUser(t).mutation(api.mapAuthoringHome.setHomeSystem, {
    mapId: MAP_A,
    systemId,
  });
}

export async function seedJump(t: Chain): Promise<{
  systemId: Id<'mapSystems'>;
  connectionId: Id<'mapConnections'>;
}> {
  await seedHome(t);
  return await asUser(t).mutation(api.mapAuthoringHome.addSystemFromNode, {
    mapId: MAP_A,
    fromSystemId: JITA,
    toSystemId: AMARR,
  });
}

export function readSystem(t: Chain, systemId: number) {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) => q.eq('mapId', MAP_A).eq('systemId', systemId))
      .unique(),
  );
}

export function readConnection(t: Chain, connectionId: Id<'mapConnections'>) {
  return t.run(async (ctx) => await ctx.db.get(connectionId));
}

export function readEvents(t: Chain) {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
      .collect(),
  );
}

export async function seedTopology(
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
      const id = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: connection.fromSystemId,
        toSystemId: connection.toSystemId,
        wormholeTypeCode: null,
        massState: null,
        shipSize: null,
        lifeStage: null,
        lifeStageObservedAt: null,
        deletedAt: null,
        purgeAfter: null,
      }));
      ids[connection.key] = id;
    }
    return ids;
  });
}
