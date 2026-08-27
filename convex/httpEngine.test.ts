// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONVEX_HTTP_SECRET, postConvexHttp } from './__tests__/http.setup';

afterEach(() => {
  vi.unstubAllEnvs();
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
