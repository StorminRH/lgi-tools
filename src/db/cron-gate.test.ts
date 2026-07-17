import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withAdvisoryLockMock = vi.fn();
const logUsageEventMock = vi.fn();
const connectionMock = vi.fn();

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
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));
vi.mock('next/server', () => ({
  connection: (...args: unknown[]) => connectionMock(...args),
}));

import { defineCronRoute } from './cron-gate';

function authedRequest(): Request {
  return new Request('http://localhost/api/cron/example', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('defineCronRoute', () => {
  beforeEach(() => {
    withAdvisoryLockMock.mockReset();
    logUsageEventMock.mockReset().mockResolvedValue(undefined);
    connectionMock.mockReset().mockResolvedValue(undefined);
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects an unauthenticated request before any declared stage', async () => {
    const work = vi.fn();
    const probe = vi.fn();
    const GET = defineCronRoute<{ status: string }>({
      name: 'cron:test',
      action: 'cron_prices',
      wakeClass: 'batch',
      record: { policy: 'noteworthy' },
      lock: { mode: 'none', justification: 'test route is lock-free' },
      idle: {
        probe,
        body: () => ({ status: 'idle' }),
      },
      work,
    });

    const response = await GET(
      new Request('http://localhost/api/cron/example'),
    );

    expect(response.status).toBe(401);
    expect(probe).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
    expect(withAdvisoryLockMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('orders auth, pre-lock work, lock acquisition, work, and telemetry', async () => {
    const order: string[] = [];
    connectionMock.mockImplementation(async () => {
      order.push('auth');
    });
    withAdvisoryLockMock.mockImplementation(
      async (
        _client: unknown,
        _key: number,
        work: (reserved: typeof reservedTag) => Promise<unknown>,
      ) => {
        order.push('lock');
        return { busy: false, result: await work(reservedTag) };
      },
    );
    logUsageEventMock.mockImplementation(async () => {
      order.push('telemetry');
    });
    const GET = defineCronRoute<{ status: string }, string>({
      name: 'cron:test',
      action: 'cron_prices',
      wakeClass: 'batch',
      record: {
        policy: 'always',
        justification: 'daily test batch records every run',
      },
      lock: {
        key: 17,
        busyBody: () => ({ status: 'busy' as const }),
      },
      idle: {
        probe: async () => {
          order.push('idle');
          return { idle: false };
        },
        body: () => ({ status: 'idle' as const }),
      },
      preLock: async () => {
        order.push('preLock');
        return { proceed: 'prepared' };
      },
      work: async (ctx, pre) => {
        order.push('work');
        expect(ctx.reserved).toBe(reservedTag);
        expect(pre).toBe('prepared');
        return {
          outcome: 'completed',
          workDone: true,
          telemetry: { count: 2 },
          body: { status: 'completed' as const },
        };
      },
    });

    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({ status: 'completed' });
    expect(order).toEqual([
      'auth',
      'idle',
      'preLock',
      'lock',
      'work',
      'telemetry',
    ]);
  });

  it('finishes an idle probe before pre-lock, lock, work, or durable telemetry', async () => {
    const preLock = vi.fn();
    const work = vi.fn();
    const GET = defineCronRoute<{
      status: 'skipped';
      reason: 'idle';
      durationMs: number;
    }>({
      name: 'cron:test',
      action: 'cron_sync_sweeper',
      wakeClass: 'idle-silent',
      record: { policy: 'noteworthy' },
      lock: {
        key: 17,
        busyBody: (durationMs) => ({
          status: 'skipped',
          reason: 'idle',
          durationMs,
        }),
      },
      idle: {
        probe: async () => ({
          idle: true,
          telemetry: { signal: 'empty' },
        }),
        body: (durationMs) => ({
          status: 'skipped',
          reason: 'idle',
          durationMs,
        }),
      },
      preLock,
      work,
    });

    const response = await GET(authedRequest());
    const body = await response.json();

    expect(body).toEqual({
      status: 'skipped',
      reason: 'idle',
      durationMs: expect.any(Number),
    });
    expect(preLock).not.toHaveBeenCalled();
    expect(withAdvisoryLockMock).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0] as string)).toEqual({
      scope: 'cron:test',
      signal: 'empty',
      outcome: 'idle',
      durationMs: body.durationMs,
    });
  });

  it('returns the declared busy body and records busy under always', async () => {
    withAdvisoryLockMock.mockResolvedValue({ busy: true });
    const GET = defineCronRoute<{
      status: string;
      durationMs: number;
    }>({
      name: 'cron:test',
      action: 'cron_prices',
      wakeClass: 'batch',
      record: {
        policy: 'always',
        justification: 'daily test batch records every run',
      },
      lock: {
        key: 17,
        busyBody: (durationMs) => ({ status: 'busy' as const, durationMs }),
      },
      work: async () => ({
        outcome: 'completed',
        workDone: true,
        body: { status: 'completed' as const, durationMs: 0 },
      }),
    });

    const response = await GET(authedRequest());
    const body = await response.json();

    expect(body).toEqual({
      status: 'busy',
      durationMs: expect.any(Number),
    });
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_prices',
      metadata: {
        outcome: 'busy',
        durationMs: body.durationMs,
      },
    });
  });

  it('keeps a noteworthy busy run durable-silent', async () => {
    withAdvisoryLockMock.mockResolvedValue({ busy: true });
    const GET = defineCronRoute<{ status: string }>({
      name: 'cron:test',
      action: 'cron_sync_sweeper',
      wakeClass: 'idle-silent',
      record: { policy: 'noteworthy' },
      lock: {
        key: 17,
        busyBody: () => ({ status: 'busy' as const }),
      },
      work: async () => ({
        outcome: 'completed',
        workDone: true,
        body: { status: 'completed' as const },
      }),
    });

    await GET(authedRequest());

    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('runs a lock-free declaration without reserving a connection', async () => {
    const GET = defineCronRoute<{ status: string }>({
      name: 'cron:test',
      action: 'cron_prices',
      wakeClass: 'batch',
      record: { policy: 'noteworthy' },
      lock: { mode: 'none', justification: 'test route is lock-free' },
      work: async (ctx) => {
        expect(ctx.client).toEqual(expect.anything());
        expect(ctx.reserved).toBeUndefined();
        return {
          outcome: 'idle',
          workDone: false,
          body: { status: 'idle' as const },
        };
      },
    });

    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({ status: 'idle' });
    expect(withAdvisoryLockMock).not.toHaveBeenCalled();
  });

  it('returns a pre-lock short-circuit without touching the lock or work', async () => {
    const work = vi.fn();
    const GET = defineCronRoute<{ status: string }>({
      name: 'cron:test',
      action: 'cron_sde',
      wakeClass: 'batch',
      record: {
        policy: 'always',
        justification: 'daily test batch records every run',
      },
      lock: {
        key: 17,
        busyBody: () => ({ status: 'busy' as const }),
      },
      preLock: async () => ({
        done: {
          outcome: 'up-to-date',
          workDone: false,
          telemetry: { version: '2026-07-17' },
          body: { status: 'up-to-date' as const },
        },
      }),
      work,
    });

    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({ status: 'up-to-date' });
    expect(withAdvisoryLockMock).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: {
        version: '2026-07-17',
        outcome: 'up-to-date',
        durationMs: expect.any(Number),
      },
    });
  });

  it('records noteworthy completed work but not a healthy no-op', async () => {
    let workDone = false;
    const GET = defineCronRoute({
      name: 'cron:test',
      action: 'cron_sync_sweeper',
      wakeClass: 'idle-silent',
      record: { policy: 'noteworthy' },
      lock: { mode: 'none', justification: 'watchdog has no Neon lock' },
      work: async () => ({
        outcome: workDone ? 'rearmed' : 'idle',
        workDone,
        telemetry: { dispatched: workDone ? 2 : 0 },
        body: { status: 'ok' as const },
      }),
    });

    await GET(authedRequest());
    expect(logUsageEventMock).not.toHaveBeenCalled();

    workDone = true;
    await GET(authedRequest());
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sync_sweeper',
      metadata: {
        dispatched: 2,
        outcome: 'rearmed',
        durationMs: expect.any(Number),
      },
    });
  });

  it('emits a boundary line on a durable-silent no-op', async () => {
    const GET = defineCronRoute({
      name: 'cron:test',
      action: 'cron_sync_sweeper',
      wakeClass: 'idle-silent',
      record: { policy: 'noteworthy' },
      lock: { mode: 'none', justification: 'watchdog has no Neon lock' },
      work: async () => ({
        outcome: 'idle',
        workDone: false,
        telemetry: { dispatched: 0 },
        body: { status: 'ok' as const },
      }),
    });

    await GET(authedRequest());

    expect(console.log).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0] as string)).toEqual({
      scope: 'cron:test',
      dispatched: 0,
      outcome: 'idle',
      durationMs: expect.any(Number),
    });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('records a failed run before rethrowing the work error', async () => {
    const error = new Error('work failed');
    const GET = defineCronRoute({
      name: 'cron:test',
      action: 'cron_sync_sweeper',
      wakeClass: 'idle-silent',
      record: { policy: 'noteworthy' },
      lock: { mode: 'none', justification: 'watchdog has no Neon lock' },
      work: async () => {
        throw error;
      },
    });

    await expect(GET(authedRequest())).rejects.toBe(error);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sync_sweeper',
      metadata: {
        outcome: 'failed',
        durationMs: expect.any(Number),
      },
    });
  });

  it('swallows route-specific ctx.record failures', async () => {
    logUsageEventMock.mockRejectedValue(new Error('telemetry unavailable'));
    const GET = defineCronRoute({
      name: 'cron:test',
      action: 'cron_prices',
      wakeClass: 'batch',
      record: { policy: 'noteworthy' },
      lock: { mode: 'none', justification: 'test route is lock-free' },
      work: async (ctx) => {
        await ctx.record('price_source_degraded', { caller: 'cron' });
        return {
          outcome: 'idle',
          workDone: false,
          body: { status: 'idle' as const },
        };
      },
    });

    const response = await GET(authedRequest());

    expect(response.status).toBe(200);
    expect(logUsageEventMock).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      '[cron:test] telemetry write failed',
      expect.any(Error),
    );
  });
});
