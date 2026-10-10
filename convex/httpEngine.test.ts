// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';

import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { CONVEX_HTTP_SECRET, postConvexHttp } from './__tests__/http.setup';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /purge-online', () => {
  it('rejects missing bearer and malformed bodies before purge work', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    expect(
      (
        await postConvexHttp(
          '/purge-online',
          JSON.stringify({ userId: 'user-1', characterId: null }),
          false,
        )
      ).status,
    ).toBe(401);
    expect((await postConvexHttp('/purge-online', 'not json')).status).toBe(400);
    expect(
      (await postConvexHttp('/purge-online', JSON.stringify({ userId: 42, characterId: 'nope' }))).status,
    ).toBe(400);
  });

  it('answers 500 and logs, not 401, when the deployment has no service secret', async () => {
    const error = silenceConsolePrefixes('error', ['[httpAuth] CONVEX_SERVICE_SECRET is not set']);
    const body = JSON.stringify({ userId: 'user-1', characterId: null });

    for (const unset of ['', undefined]) {
      vi.stubEnv('CONVEX_SERVICE_SECRET', unset);
      const res = await postConvexHttp('/purge-online', body);
      expect(res.status).toBe(500);
      expect(await res.text()).toBe('Service authentication is not configured');
    }
    expect(error.mock.calls).toEqual([
      ['[httpAuth] CONVEX_SERVICE_SECRET is not set on this Convex deployment'],
      ['[httpAuth] CONVEX_SERVICE_SECRET is not set on this Convex deployment'],
    ]);

    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    expect((await postConvexHttp('/purge-online', body, false)).status).toBe(401);
  });

  it('purges for a valid body', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);

    const res = await postConvexHttp(
      '/purge-online',
      JSON.stringify({ userId: 'user-1', characterId: null }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toBeTypeOf('object');
  });
});
