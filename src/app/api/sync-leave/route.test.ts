import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  postLeaveSync: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/data/convex/leave-door', () => ({
  LeaveSyncDoorError: class LeaveSyncDoorError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LeaveSyncDoorError';
    }
  },
  postLeaveSync: (...args: unknown[]) => h.postLeaveSync(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...args),
}));

import { LeaveSyncDoorError } from '@/data/convex/leave-door';
import { rateLimitedFailure } from '@/lib/failure';
import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const ROUTE = '/api/sync-leave';

const BODY = { dataset: 'characterLocation', tabId: 'tab-aaaa-bbbb' };

function resetMocks() {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.postLeaveSync.mockReset().mockResolvedValue({ retired: true });
  h.checkRateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 29 });
}

test('POST /api/sync-leave rejects anonymous callers and a forged body userId, and forwards only the session user', async () => {
  resetMocks();
  h.checkUserId.mockResolvedValueOnce({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  const anonymous = await POST(postJson(ROUTE, BODY));
  expect(anonymous.status).toBe(401);

  const forged = await POST(postJson(ROUTE, { ...BODY, userId: 'someone-else' }));
  expect(forged.status).toBe(400);
  expect(problemBodySchema.parse(await forged.json())).toMatchObject({
    code: 'invalid_body',
  });
  expect(h.postLeaveSync).not.toHaveBeenCalled();

  const ok = await POST(postJson(ROUTE, BODY));
  expect(ok.status).toBe(204);
  expect(h.postLeaveSync).toHaveBeenCalledWith({
    userId: 'user-1',
    dataset: 'characterLocation',
    tabId: 'tab-aaaa-bbbb',
  });
});

test('POST /api/sync-leave throttles before authorizing, with the 429 its contract declares', async () => {
  resetMocks();
  h.checkRateLimit.mockResolvedValueOnce({ ok: false, failure: rateLimitedFailure(12) });
  const throttled = await POST(postJson(ROUTE, BODY));
  expect(throttled.status).toBe(429);
  expect(throttled.headers.get('Retry-After')).toBe('12');
  expect(problemBodySchema.parse(await throttled.json())).toMatchObject({
    code: 'rate_limited',
    retryAfterSeconds: 12,
  });
  expect(h.checkRateLimit).toHaveBeenCalledWith(expect.any(Request), {
    name: 'sync-leave',
    perMinute: 30,
  });
  expect(h.checkUserId).not.toHaveBeenCalled();
  expect(h.postLeaveSync).not.toHaveBeenCalled();
});

test('POST /api/sync-leave surfaces a Convex door failure as 503', async () => {
  resetMocks();
  h.postLeaveSync.mockRejectedValueOnce(new LeaveSyncDoorError('down'));
  expect((await POST(postJson(ROUTE, BODY))).status).toBe(503);
});
