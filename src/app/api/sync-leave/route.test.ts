import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  postLeaveSync: vi.fn(),
  checkRateLimit: vi.fn(),
  logUsageEvent: vi.fn(),
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
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));

import { LeaveSyncDoorError } from '@/data/convex/leave-door';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost:3000/api/sync-leave', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.postLeaveSync.mockReset().mockResolvedValue({ retired: true });
  h.checkRateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 29 });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/sync-leave', () => {
  it('rejects anonymous callers and forwards the session user, never a body userId', async () => {
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    const anonymous = await POST(
      request({ dataset: 'characterLocation', tabId: 'tab-aaaa-bbbb' }),
    );
    expect(anonymous.status).toBe(401);
    expect(h.postLeaveSync).not.toHaveBeenCalled();

    const ok = await POST(
      request({ dataset: 'characterLocation', tabId: 'tab-aaaa-bbbb' }),
    );
    expect(ok.status).toBe(204);
    expect(h.postLeaveSync).toHaveBeenCalledWith({
      userId: 'user-1',
      dataset: 'characterLocation',
      tabId: 'tab-aaaa-bbbb',
    });
  });

  it('rejects a forged userId in the body', async () => {
    const forged = await POST(
      request({
        dataset: 'characterLocation',
        tabId: 'tab-aaaa-bbbb',
        userId: 'someone-else',
      }),
    );
    expect(forged.status).toBe(400);
    expect(problemBodySchema.parse(await forged.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(h.postLeaveSync).not.toHaveBeenCalled();
  });

  it('surfaces a Convex door failure as 503', async () => {
    h.postLeaveSync.mockRejectedValueOnce(new LeaveSyncDoorError('down'));
    const failed = await POST(
      request({ dataset: 'characterLocation', tabId: 'tab-aaaa-bbbb' }),
    );
    expect(failed.status).toBe(503);
  });
});
