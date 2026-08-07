// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAP_JUMP_BOOKKEEPING_PURGE_BATCH } from './mapJumpBookkeeping';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const SECRET = 'svc-secret';

const post = (
  path:
    | '/purge-online'
    | '/purge-location-tracking'
    | '/project-map-access'
    | '/purge-map-access'
    | '/jump-evidence'
    | '/resolve-jump',
  body: BodyInit | null,
  authorized = true,
) =>
  convexTest(schema, modules).fetch(path, {
    method: 'POST',
    ...(authorized ? { headers: { authorization: `Bearer ${SECRET}` } } : {}),
    body,
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /purge-online', () => {
  it('rejects a request without the service bearer token', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);

    const res = await post(
      '/purge-online',
      JSON.stringify({ userId: 'user-1', characterId: null }),
      false,
    );

    expect(res.status).toBe(401);
  });

  it('returns a clean 400 for a malformed JSON body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);

    const res = await post('/purge-online', 'not json');

    expect(res.status).toBe(400);
  });

  it('returns a clean 400 for well-formed JSON with wrong-typed fields', async () => {
    // Old behavior: the mutation's arg validators threw, surfacing a 500 plus a
    // stack trace in the deployment logs. The purge stays best-effort either
    // way — the online-status contributor swallows any non-2xx response.
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);

    const res = await post(
      '/purge-online',
      JSON.stringify({ userId: 42, characterId: 'nope' }),
    );

    expect(res.status).toBe(400);
  });

  it('purges for a valid body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);

    const res = await post(
      '/purge-online',
      JSON.stringify({ userId: 'user-1', characterId: null }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toBeTypeOf('object');
  });
});

describe('jump resolver doors', () => {
  it.each(['/jump-evidence', '/resolve-jump'] as const)(
    'rejects %s before parsing without the service bearer token',
    async (path) => {
      vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
      const res = await post(path, 'not json', false);
      expect(res.status).toBe(401);
    },
  );

  it.each(['/jump-evidence', '/resolve-jump'] as const)(
    'returns a clean 400 for malformed %s JSON',
    async (path) => {
      vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
      const res = await post(path, 'not json');
      expect(res.status).toBe(400);
    },
  );

  it('returns an access-safe evidence packet for a valid body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await post(
      '/jump-evidence',
      JSON.stringify({
        mode: 'transition',
        userId: 'user-1',
        mapId: 'map-1',
        characterId: 90_000_001,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      canEdit: false,
      tracked: false,
      transition: null,
      lastProcessedTransitionAt: null,
      originLive: false,
      scannedTypeCodes: [],
      candidates: [],
    });
  });

  it('pins the read-only connection-evidence mode on the existing evidence door', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const t = convexTest(schema, modules);
    const connectionId = await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', {
        mapId: 'map-evidence',
        userId: 'editor',
        roles: ['editor'],
      });
      await ctx.db.insert('mapSystems', {
        mapId: 'map-evidence',
        systemId: 31_000_001,
      });
      await ctx.db.insert('mapSystems', {
        mapId: 'map-evidence',
        systemId: 31_000_002,
      });
      return await ctx.db.insert('mapConnections', {
        mapId: 'map-evidence',
        fromSystemId: 31_000_001,
        toSystemId: 31_000_002,
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        eolAt: null,
        lifeStage: null,
        lifeStageObservedAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });

    const res = await t.fetch('/jump-evidence', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        mode: 'connection',
        userId: 'editor',
        mapId: 'map-evidence',
        connectionId,
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      canEdit: true,
      connection: {
        connectionId,
        fromSystemId: 31_000_001,
        toSystemId: 31_000_002,
        typedSide: 'from',
      },
    });
  });

  it('dispatches one valid author operation through the resolving door', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', {
        mapId: 'map-jump',
        userId: 'editor',
        roles: ['editor'],
      });
      await ctx.db.insert('mapSystems', {
        mapId: 'map-jump',
        systemId: 31_000_001,
      });
      await ctx.db.insert('mapTracking', {
        mapId: 'map-jump',
        userId: 'tracker',
        characterId: 90_000_001,
      });
      await ctx.db.insert('characterLocation', {
        userId: 'tracker',
        characterId: 90_000_001,
        solarSystemId: 31_000_002,
        stationId: null,
        structureId: null,
        shipTypeId: 587,
        prevSolarSystemId: 31_000_001,
        prevFresh: true,
        transitionObservedAt: 1_800_000_000_000,
        observedAt: 1_800_000_000_000,
        etagLocation: null,
        etagShip: null,
      });
    });

    const res = await t.fetch('/resolve-jump', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        operation: 'author',
        userId: 'editor',
        mapId: 'map-jump',
        characterId: 90_000_001,
        fromSolarSystemId: 31_000_001,
        toSolarSystemId: 31_000_002,
        transitionObservedAt: 1_800_000_000_000,
        observedShipMassKg: 10_000_000,
        observationKey: 'door-key',
        decision: { kind: 'insert', candidateIds: [], survivors: [] },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'authored' });
    expect(
      await t.run(async (ctx) => await ctx.db.query('mapConnections').collect()),
    ).toEqual([
      expect.objectContaining({
        mapId: 'map-jump',
        fromSystemId: 31_000_001,
        toSystemId: 31_000_002,
        observedMassKg: 10_000_000,
      }),
    ]);
  });
});

describe('POST /project-map-access', () => {
  it('rejects a request without the service bearer token', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await post(
      '/project-map-access',
      JSON.stringify({ mapId: 'map-1', claims: [{ userId: 'u1', roles: ['owner'] }] }),
      false,
    );
    expect(res.status).toBe(401);
  });

  it('returns a clean 400 for malformed JSON', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await post('/project-map-access', 'not json');
    expect(res.status).toBe(400);
  });

  it('returns a clean 400 for an out-of-vocabulary role', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await post(
      '/project-map-access',
      JSON.stringify({ mapId: 'map-1', claims: [{ userId: 'u1', roles: ['admin'] }] }),
    );
    expect(res.status).toBe(400);
  });

  it('returns a clean 400 for empty roles', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await post(
      '/project-map-access',
      JSON.stringify({ mapId: 'map-1', claims: [{ userId: 'u1', roles: [] }] }),
    );
    expect(res.status).toBe(400);
  });

  it('returns a clean 400 for a repeated userId', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await post(
      '/project-map-access',
      JSON.stringify({
        mapId: 'map-1',
        claims: [
          { userId: 'u1', roles: ['viewer'] },
          { userId: 'u1', roles: ['editor'] },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('reconciles a valid body and returns counts', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const res = await post(
      '/project-map-access',
      JSON.stringify({
        mapId: 'map-1',
        claims: [{ userId: 'u1', roles: ['owner'] }],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
    });
  });

  it('drains a multi-batch bookkeeping teardown without touching another map', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index <= MAP_JUMP_BOOKKEEPING_PURGE_BATCH; index += 1) {
        await ctx.db.insert('mapJumpBookkeeping', {
          mapId: 'map-large',
          characterId: 90_000_000 + index,
          lastProcessedTransitionAt: index,
        });
      }
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'map-other',
        characterId: 91_000_000,
        lastProcessedTransitionAt: 1,
      });
    });

    const res = await t.fetch('/project-map-access', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ mapId: 'map-large', claims: [] }),
    });

    expect(res.status).toBe(200);
    expect(await t.run(async (ctx) => ctx.db.query('mapJumpBookkeeping').collect())).toEqual([
      expect.objectContaining({ mapId: 'map-other', characterId: 91_000_000 }),
    ]);
  });
});

describe('POST /purge-map-access', () => {
  it('loops purge batches and returns totals', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 129; index += 1) {
        await ctx.db.insert('mapAccess', {
          mapId: `map-${index}`,
          userId: 'purge-me',
          roles: ['viewer'],
        });
      }
    });

    const res = await t.fetch('/purge-map-access', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ userId: 'purge-me' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 129 });
  });
});
