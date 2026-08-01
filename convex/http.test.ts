// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const SECRET = 'svc-secret';

const post = (
  path: '/purge-online' | '/project-map-access' | '/purge-map-access',
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
