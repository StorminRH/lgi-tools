import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { account, characters, session, user } from '@/db/auth-schema';
import { mapAccess, maps } from '@/data/maps/schema';
import { reserveMapAccessProjectionRevision } from '@/data/maps/queries';
import type { MapRole } from '@/data/maps/access-contract';
import { installFixtureAccessControl } from '../docs/ux-check/lib/authoring-helpers.mjs';
import { seedFixturePrincipal } from './auth-seed';
import { censusFixtureProjections, purgeFixtureProjections } from './fixture-data-postgres';
import { censusConvexFixtures, localConvexCommand, localConvexRun, purgeConvexFixtures, removeOwnedSyncRows } from './fixture-data-convex.mjs';
import { requireLocalAuthEnvironment, requireLocalConvexEnvironment } from './fixture-data-local.mjs';
import { createFixtureIdentity, FIXTURE_ROLES, type FixtureRole } from './identity';

export type FixturePrincipal = Awaited<ReturnType<typeof seedFixturePrincipal>>;
export type FixturePrincipals = Record<FixtureRole, FixturePrincipal>;
export type CleanupCensus = {
  postgres: Record<string, number>;
  convex: { checked: boolean; remaining: number };
};

const MAP_ENV = {
  populated: 'UX_MAP_ID', blank: 'UX_BLANK_MAP_ID', second: 'UX_SECOND_MAP_ID',
  jump: 'UX_JUMP_MAP_ID', background: 'UX_BG_MAP_ID', halo: 'UX_HALO_MAP_ID',
  fog: 'UX_FOG_MAP_ID', fogBudget: 'UX_FOG_BUDGET_MAP_ID',
  signature: 'UX_SIG_MAP_ID', signatureViewer: 'UX_SITE_VIEWER_MAP_ID',
} as const;
type MapName = keyof typeof MAP_ENV;
export type FixtureMaps = Record<MapName, string>;

function makeMapIds(): FixtureMaps {
  return {
    populated: randomUUID(), blank: randomUUID(), second: randomUUID(),
    jump: randomUUID(), background: randomUUID(), halo: randomUUID(),
    fog: randomUUID(), fogBudget: randomUUID(), signature: randomUUID(), signatureViewer: randomUUID(),
  };
}

export async function createRunFixtures({ baseURL, maps: withMaps = false }: {
  baseURL: string;
  maps?: boolean;
}) {
  config({ path: process.env.DOTENV_PATH ?? '.env.local', quiet: true });
  requireLocalAuthEnvironment(baseURL);
  requireLocalConvexEnvironment();
  try {
    await db.execute(sql`select 1`);
    await db.select({ id: user.id }).from(user).limit(0);
    await db.select({ id: characters.characterId }).from(characters).limit(0);
    await db.select({ id: account.id }).from(account).limit(0);
    await db.select({ id: session.id }).from(session).limit(0);
    if (withMaps) await db.select({ id: maps.id }).from(maps).limit(0);
  } catch {
    throw new Error('E2E_PREREQUISITE: local PostgreSQL must be running with current migrations');
  }
  await censusConvexFixtures({ mapIds: [randomUUID()], userIds: [randomUUID()] });
  const runId = randomUUID();
  const identities = {
    owner: createFixtureIdentity(runId, 'owner'), editor: createFixtureIdentity(runId, 'editor'),
    viewer: createFixtureIdentity(runId, 'viewer'), unauthorized: createFixtureIdentity(runId, 'unauthorized'),
  };
  const mapIds = makeMapIds();
  const ownedMapIds = new Set<string>();
  const ownedUserIds = new Set<string>();
  const ownedCharacterIds = new Set<number>();
  let restoreEnvironment: (() => void) | undefined;
  let finalCensus: CleanupCensus | undefined;

  async function cleanup(): Promise<CleanupCensus> {
    if (finalCensus) return finalCensus;
    requireLocalAuthEnvironment(baseURL);
    const errors: unknown[] = [];
    const userIds = [...ownedUserIds];
    const characterIds = [...ownedCharacterIds];
    if (userIds.length === 0) {
      return { postgres: { users: 0, characters: 0, accounts: 0, sessions: 0, maps: 0, grants: 0 }, convex: { checked: true, remaining: 0 } };
    }
    try {
      const createdMaps = await db.select({ id: maps.id }).from(maps).where(inArray(maps.userId, userIds));
      for (const map of createdMaps) ownedMapIds.add(map.id);
    } catch (error) { errors.push(error); }
    try {
      await purgeConvexFixtures({ mapIds: [...ownedMapIds], userIds });
    } catch (error) { errors.push(error); }
    let projectionsRemoved = false;
    try {
      await purgeFixtureProjections(userIds, characterIds);
      projectionsRemoved = true;
    } catch (error) { errors.push(error); }
    try {
      await db.delete(user).where(inArray(user.id, userIds));
    } catch (error) { errors.push(error); }
    try {
      if (projectionsRemoved) await db.delete(characters).where(inArray(characters.characterId, characterIds));
    } catch (error) { errors.push(error); }
    try {
      const rows: unknown = await censusConvexFixtures({ mapIds: [], userIds });
      await removeOwnedSyncRows({ rows, userIds });
    } catch (error) { errors.push(error); }
    try {
      const postgres = {
        ...await censusPostgres(userIds, characterIds, [...ownedMapIds]),
        ...await censusFixtureProjections(userIds, characterIds),
      };
      const remaining: unknown = await censusConvexFixtures({ mapIds: [...ownedMapIds], userIds });
      if (!Array.isArray(remaining)) throw new Error('Invalid Convex absence census');
      const census = { postgres, convex: { checked: true, remaining: remaining.length } };
      if (Object.values(postgres).some((value) => value !== 0) || remaining.length > 0) {
        errors.push(new Error(`E2E_CLEANUP: run-owned data remains: ${JSON.stringify(census)}`));
      }
      if (errors.length === 0) finalCensus = census;
    } catch (error) { errors.push(error); }
    restoreEnvironment?.();
    restoreEnvironment = undefined;
    if (!finalCensus || errors.length > 0) {
      throw new AggregateError(errors, 'E2E_CLEANUP: fixture teardown or absence census failed');
    }
    return finalCensus;
  }

  async function seed(role: FixtureRole) {
    const identity = identities[role];
    return seedFixturePrincipal(identity, baseURL, {
      userCreated: () => { ownedUserIds.add(identity.userId); },
      characterCreated: () => { ownedCharacterIds.add(identity.characterId); },
    });
  }

  try {
    const principals: FixturePrincipals = {
      owner: await seed('owner'), editor: await seed('editor'),
      viewer: await seed('viewer'), unauthorized: await seed('unauthorized'),
    };
    const fixture = {
      runId, principals, maps: mapIds, cleanup,
      async readConnections(mapId: string) {
        requireOwnedMap(mapId);
        const source = `
          const rows = await ctx.db.query('mapConnections')
            .withIndex('by_map', q => q.eq('mapId', ${JSON.stringify(mapId)})).take(1001);
          if (rows.length > 1000) throw new Error('Fixture connection read exceeded its row bound');
          return rows.map(row => ({ fromSystemId: row.fromSystemId,
            toSystemId: row.toSystemId, observedMassKg: row.observedMassKg ?? null }));
        `;
        const result: unknown = JSON.parse(await localConvexCommand(['--inline-query', source]));
        if (!Array.isArray(result)) throw new Error('E2E_PREREQUISITE: invalid connection evidence');
        return result.map((row: unknown) => {
          if (row === null || typeof row !== 'object'
            || !('fromSystemId' in row) || typeof row.fromSystemId !== 'number'
            || !('toSystemId' in row) || (row.toSystemId !== null && typeof row.toSystemId !== 'number')
            || !('observedMassKg' in row) || (row.observedMassKg !== null && typeof row.observedMassKg !== 'number')) {
            throw new Error('E2E_PREREQUISITE: malformed connection mass evidence');
          }
          return { fromSystemId: row.fromSystemId, toSystemId: row.toSystemId, observedMassKg: row.observedMassKg };
        });
      },
      async readRole(role: FixtureRole, mapId: string): Promise<MapRole | null> {
        requireOwnedMap(mapId);
        const principal = principals[role];
        const [map] = await db.select({ userId: maps.userId }).from(maps).where(eq(maps.id, mapId));
        if (!map) return null;
        if (map.userId === principal.userId) return 'admin';
        const [grant] = await db.select({ role: mapAccess.role }).from(mapAccess).where(and(
          eq(mapAccess.mapId, mapId), eq(mapAccess.ownerType, 'character'),
          eq(mapAccess.ownerId, principal.characterId),
        ));
        return grant?.role ?? null;
      },
      async revoke(role: 'editor' | 'viewer', mapId: string) {
        requireOwnedMap(mapId);
        await db.delete(mapAccess).where(and(
          eq(mapAccess.mapId, mapId), eq(mapAccess.ownerType, 'character'),
          eq(mapAccess.ownerId, principals[role].characterId),
        ));
        await projectFixtureAccess(mapId, principals);
      },
      async restore(role: 'editor' | 'viewer', mapId: string) {
        requireOwnedMap(mapId);
        await db.insert(mapAccess).values({
          mapId, ownerType: 'character', ownerId: principals[role].characterId, role,
        }).onConflictDoNothing();
        await projectFixtureAccess(mapId, principals);
      },
      installProbeEnvironment() {
        if (restoreEnvironment) throw new Error('Fixture environment already installed');
        const values: Record<string, string> = {
          E2E_BASE_URL: baseURL, UX_FIXTURE_RUN_ID: runId,
          UX_CHARACTER_ID: String(principals.owner.characterId),
          UX_OWNED_USER_IDS: JSON.stringify(FIXTURE_ROLES.map((role) => principals[role].userId)),
          UX_OWNED_MAP_IDS: JSON.stringify([...ownedMapIds]),
        };
        if (withMaps) {
          for (const [name, envName] of Object.entries(MAP_ENV)) {
            const mapId = Reflect.get(mapIds, name);
            if (typeof mapId === 'string') values[envName] = mapId;
          }
        }
        const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
        Object.assign(process.env, values);
        const removeAccessControl = installFixtureAccessControl(fixture);
        restoreEnvironment = () => {
          removeAccessControl();
          for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        };
        return () => { restoreEnvironment?.(); restoreEnvironment = undefined; };
      },
    };
    function requireOwnedMap(mapId: string) {
      requireLocalAuthEnvironment(baseURL);
      requireLocalConvexEnvironment({ ...process.env, E2E_BASE_URL: baseURL });
      if (!withMaps || !ownedMapIds.has(mapId)) throw new Error('Refusing access changes outside the fixture');
    }
    if (withMaps) {
      for (const [name, mapId] of Object.entries(mapIds)) {
        await db.insert(maps).values({ id: mapId, userId: principals.owner.userId, name: `E2E ${runId.slice(0, 8)} ${name}` });
        ownedMapIds.add(mapId);
        await db.insert(mapAccess).values([
          { mapId, ownerType: 'character', ownerId: principals.editor.characterId, role: 'editor' },
          { mapId, ownerType: 'character', ownerId: principals.viewer.characterId, role: 'viewer' },
        ]);
        await projectFixtureAccess(mapId, principals);
      }
      await seedMapTopology(mapIds.populated, 30_000_142, 30_000_144);
      await seedMapTopology(mapIds.second, 30_002_187, 30_003_479);
      await localConvexRun('mapFixtureTracking:seedTrackedLocationFixture', {
        mapId: mapIds.populated, userId: principals.owner.userId,
        characterId: principals.owner.characterId, solarSystemId: 30_000_142,
        shipTypeId: null, transitionObservedAt: Date.now(),
      });
    }
    return fixture;
  } catch (error) {
    try { await cleanup(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'E2E_PREREQUISITE: fixture setup failed and cleanup was incomplete');
    }
    throw new Error('E2E_PREREQUISITE: run-owned fixture setup failed', { cause: error });
  }
}

export type RunFixtures = Awaited<ReturnType<typeof createRunFixtures>>;

async function seedMapTopology(mapId: string, fromSystemId: number, toSystemId: number) {
  await localConvexRun('mapFixturePlace:placeSystemFixture', { mapId, systemId: fromSystemId });
  await localConvexRun('mapFixturePlace:placeJumpFixture', {
    mapId, fromSystemId, toSystemId, wormholeTypeCode: null, massState: null, shipSize: null,
  });
}

async function censusPostgres(userIds: string[], characterIds: number[], mapIds: string[]) {
  async function rows(query: PromiseLike<Array<{ count: number }>>) {
    const result = await query;
    const row = result[0];
    if (!row) throw new Error('Missing PostgreSQL census count');
    return row.count;
  }
  return {
    users: await rows(db.select({ count: count() }).from(user).where(inArray(user.id, userIds))),
    characters: await rows(db.select({ count: count() }).from(characters).where(inArray(characters.characterId, characterIds))),
    accounts: await rows(db.select({ count: count() }).from(account).where(inArray(account.userId, userIds))),
    sessions: await rows(db.select({ count: count() }).from(session).where(inArray(session.userId, userIds))),
    maps: await rows(db.select({ count: count() }).from(maps).where(inArray(maps.userId, userIds))),
    grants: mapIds.length === 0 ? 0 : await rows(db.select({ count: count() }).from(mapAccess).where(inArray(mapAccess.mapId, mapIds))),
  };
}

async function projectFixtureAccess(mapId: string, principals: FixturePrincipals) {
  const grants = await db.select().from(mapAccess).where(eq(mapAccess.mapId, mapId));
  const claims: Array<{ userId: string; roles: MapRole[] }> = [
    { userId: principals.owner.userId, roles: ['admin'] },
  ];
  for (const role of ['editor', 'viewer'] as const) {
    const principal = principals[role];
    const grant = grants.find((row) => row.ownerType === 'character' && row.ownerId === principal.characterId);
    if (grant) claims.push({ userId: principal.userId, roles: [grant.role] });
  }
  const revision = await reserveMapAccessProjectionRevision();
  const result: unknown = await localConvexRun('mapAccessProjection:reconcileMapClaims', { mapId, revision, claims });
  if (typeof result !== 'object' || result === null || !('outcome' in result)
    || (result.outcome !== 'applied' && result.outcome !== 'duplicate')) {
    throw new Error('E2E_PREREQUISITE: fixture access projection was not applied');
  }
}
