// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from './schema';

import { CONVEX_HTTP_SECRET, postConvexHttp } from './__tests__/http.setup';
import { modules } from './__tests__/modules.setup';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /merge-user-state', () => {
  it('rejects a missing bearer, a malformed body, and a source equal to the survivor', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const body = JSON.stringify({ sourceUserId: 'src', survivorUserId: 'surv' });
    expect((await postConvexHttp('/merge-user-state', body, false)).status).toBe(401);
    expect((await postConvexHttp('/merge-user-state', 'not json')).status).toBe(400);
    expect(
      (
        await postConvexHttp(
          '/merge-user-state',
          JSON.stringify({ sourceUserId: 'same', survivorUserId: 'same' }),
        )
      ).status,
    ).toBe(400);
  });

  it('moves the source tracking rows and answers with the counts', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: 'src', characterId: 1 });
      await ctx.db.insert('mapAccess', { mapId: 'map-a', userId: 'src', roles: ['viewer'] });
    });

    const res = await t.fetch('/merge-user-state', {
      method: 'POST',
      headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify({ sourceUserId: 'src', survivorUserId: 'surv' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trackingMoved: 1, trackingDropped: 0, deleted: 1 });
    const tracking = await t.run((ctx) => ctx.db.query('mapTracking').collect());
    expect(tracking.map((row) => row.userId)).toEqual(['surv']);
  });
});

describe('merge tracking recovery service doors', () => {
  it('requires service authorization and validates both request shapes', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    for (const path of ['/snapshot-merge-tracking', '/restore-merge-tracking'] as const) {
      expect((await postConvexHttp(path, '{}', false)).status).toBe(401);
      expect((await postConvexHttp(path, 'not-json')).status).toBe(400);
      expect((await postConvexHttp(path, '{}')).status).toBe(400);
    }
    expect((await postConvexHttp('/restore-merge-tracking', JSON.stringify({
      operationId: 'a', survivorUserId: 'b', selections: [{ mapId: 'x', characterId: -1 }],
    }))).status).toBe(400);
  });

  it('snapshots and restores selections through authenticated endpoints', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', CONVEX_HTTP_SECRET);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: 'src', characterId: 1 });
      await ctx.db.insert('mapAccess', { mapId: 'map-a', userId: 'surv', roles: ['viewer'] });
      await ctx.db.insert('mapJumpBookkeeping', { mapId: 'map-a', characterId: 1, lastProcessedTransitionAt: 123 });
    });
    const request = (path: string, body: unknown) => t.fetch(path, {
      method: 'POST', headers: { authorization: `Bearer ${CONVEX_HTTP_SECRET}` },
      body: JSON.stringify(body),
    });
    const snapshot = await request('/snapshot-merge-tracking', { sourceUserId: 'src' });
    expect(snapshot.status).toBe(200);
    const { selections } = await snapshot.json();
    expect(selections).toEqual([{ mapId: 'map-a', characterId: 1, lastProcessedTransitionAt: 123 }]);
    const restored = await request('/restore-merge-tracking', {
      operationId: 'recovery', survivorUserId: 'surv', selections,
    });
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ restored: 1, skipped: 0, alreadyApplied: false });
    expect(await t.run((ctx) => ctx.db.query('mapTracking').collect())).toHaveLength(2);
  });
});
