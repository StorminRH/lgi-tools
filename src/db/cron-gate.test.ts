import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withAdvisoryLockMock = vi.fn();

// Reserved-connection stub identical in shape to the one the cron route tests
// use, so the gate exercises the real requireCronAuth path.
const reservedTag = vi.fn(() => Promise.resolve([{ got: true }]));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(reservedTag as any).release = vi.fn();
const reserveMock = vi.fn((..._args: unknown[]) => Promise.resolve(reservedTag));

vi.mock('@/db', () => ({
  directClient: { reserve: (...args: unknown[]) => reserveMock(...args) },
}));
vi.mock('./advisory-lock', () => ({
  withAdvisoryLock: (...args: unknown[]) => withAdvisoryLockMock(...args),
}));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

import { runCronJob } from './cron-gate';

function authedRequest(): Request {
  return new Request('http://localhost/api/cron/example', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('runCronJob', () => {
  beforeEach(() => {
    withAdvisoryLockMock.mockReset();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a request without the cron bearer before touching the lock', async () => {
    const res = await runCronJob({
      req: new Request('http://localhost/api/cron/example'),
      lockKey: 7,
      onBusy: () => new Response('busy'),
      work: async () => new Response('work'),
    });
    expect(res.status).toBe(401);
    expect(withAdvisoryLockMock).not.toHaveBeenCalled();
  });

  it('returns the work result when the lock is acquired', async () => {
    const workResponse = Response.json({ status: 'refreshed' });
    withAdvisoryLockMock.mockResolvedValue({ busy: false, result: workResponse });
    const onBusy = vi.fn();
    const res = await runCronJob({
      req: authedRequest(),
      lockKey: 7,
      onBusy,
      work: async () => workResponse,
    });
    expect(res).toBe(workResponse);
    expect(onBusy).not.toHaveBeenCalled();
    expect(withAdvisoryLockMock).toHaveBeenCalledWith(
      expect.anything(),
      7,
      expect.any(Function),
    );
  });

  it('invokes onBusy when the lock is held', async () => {
    withAdvisoryLockMock.mockResolvedValue({ busy: true });
    const busyResponse = Response.json({ status: 'busy' });
    const res = await runCronJob({
      req: authedRequest(),
      lockKey: 7,
      onBusy: () => busyResponse,
      work: async () => new Response('work'),
    });
    expect(res).toBe(busyResponse);
  });
});
