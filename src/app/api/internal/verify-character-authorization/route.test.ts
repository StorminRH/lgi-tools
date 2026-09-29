import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/composition/character-authorization', () => ({ checkCharacterAuthorizations: mocks.check }));
import { POST } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'service-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each([undefined, 'Bearer wrong-secret'])('rejects unauthenticated scheduler requests (%s)', async (authorization) => {
  const response = await POST(new Request('https://app.test/api/internal/verify-character-authorization', {
    method: 'POST', headers: authorization ? { Authorization: authorization } : {},
  }));
  expect(response.status).toBe(401);
  expect(mocks.check).not.toHaveBeenCalled();
});

it('fails closed when the service secret is missing', async () => {
  vi.stubEnv('CONVEX_SERVICE_SECRET', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await POST(new Request('https://app.test/api/internal/verify-character-authorization', { method: 'POST' }));
  expect(response.status).toBe(500);
  expect(mocks.check).not.toHaveBeenCalled();
});

it('awaits the worker before acknowledging an authenticated check', async () => {
  const response = await POST(new Request('https://app.test/api/internal/verify-character-authorization', {
    method: 'POST', headers: { Authorization: 'Bearer service-secret' },
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'checked' });
  expect(mocks.check).toHaveBeenCalledExactlyOnceWith();
});
