// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const SECRET = 'svc-secret';

const post = (body: BodyInit | null, authorized = true) =>
  convexTest(schema, modules).fetch('/purge-online', {
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

    const res = await post(JSON.stringify({ userId: 'user-1', characterId: null }), false);

    expect(res.status).toBe(401);
  });

  it('returns a clean 400 for a malformed JSON body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);

    const res = await post('not json');

    expect(res.status).toBe(400);
  });

  it('returns a clean 400 for well-formed JSON with wrong-typed fields', async () => {
    // Old behavior: the mutation's arg validators threw, surfacing a 500 plus a
    // stack trace in the deployment logs. The purge stays best-effort either
    // way — the online-status contributor swallows any non-2xx response.
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);

    const res = await post(JSON.stringify({ userId: 42, characterId: 'nope' }));

    expect(res.status).toBe(400);
  });

  it('purges for a valid body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);

    const res = await post(JSON.stringify({ userId: 'user-1', characterId: null }));

    expect(res.status).toBe(200);
    expect(await res.json()).toBeTypeOf('object');
  });
});
