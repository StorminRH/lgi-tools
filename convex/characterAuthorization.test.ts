// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { modules } from './__tests__/modules.setup';

beforeEach(() => {
  vi.stubEnv('SITE_URL', 'https://app.test');
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'service-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('forwards the scheduled check through the authenticated service contract', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'checked' }));
  vi.stubGlobal('fetch', fetch);
  const t = convexTest(schema, modules);
  expect(await t.action(internal.characterAuthorization.verify, {})).toBeNull();
  expect(fetch).toHaveBeenCalledWith('https://app.test/api/internal/verify-character-authorization', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer service-secret' }),
    signal: expect.any(AbortSignal),
  }));
});

it('fails visibly when verification cannot be delivered instead of reporting success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
  const t = convexTest(schema, modules);
  await expect(t.action(internal.characterAuthorization.verify, {})).rejects.toThrow();
});
