// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';

import { CONVEX_HTTP_SECRET, postConvexHttp } from './__tests__/http.setup';
import { connectionInsert } from './__tests__/connection-doc.setup';
import { modules } from './__tests__/modules.setup';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('jump resolver doors', () => {
  it.each(['/jump-evidence', '/resolve-jump'] as const)(
    'rejects %s without a bearer and returns clean malformed JSON',
    async (path) => {
      vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
      expect((await postConvexHttp(path, 'not json', false)).status).toBe(401);
      expect((await postConvexHttp(path, 'not json')).status).toBe(400);
    },
  );

  it('returns an access-safe evidence packet for a valid body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const res = await postConvexHttp(
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
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
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
      return await ctx.db.insert('mapConnections', connectionInsert({
        mapId: 'map-evidence',
        fromSystemId: 31_000_001,
        toSystemId: 31_000_002,
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        lifeStage: null,
        lifeStageObservedAt: null,
        deletedAt: null,
        purgeAfter: null,
      }));
    });

    const res = await t.fetch('/jump-evidence', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
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
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
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
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
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

describe('signature elimination door', () => {
  it('rejects before parsing without the bearer and returns clean malformed JSON', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    expect((await postConvexHttp('/signature-elimination', 'not json', false)).status).toBe(401);
    expect((await postConvexHttp('/signature-elimination', 'not json')).status).toBe(400);
  });

  it('returns access-safe empty evidence for a valid server request', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const res = await postConvexHttp(
      '/signature-elimination',
      JSON.stringify({
        operation: 'evidence',
        userId: 'user-1',
        mapId: 'map-1',
        systemId: 31_000_001,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      canEdit: false,
      signatures: [],
      connections: [],
    });
  });
});
