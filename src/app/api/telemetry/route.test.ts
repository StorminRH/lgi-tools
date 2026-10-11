import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';

const CHARACTER_ID = 1000000000;

const getSessionCharacterIdMock = vi.fn();
const logUsageEventMock = vi.fn();
const afterMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/composition/session', () => ({
  getSessionCharacterId: () => getSessionCharacterIdMock(),
}));

vi.mock('@/data/telemetry/log', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => afterMock(task),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

const ROUTE = '/api/telemetry';

describe('POST /api/telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionCharacterIdMock.mockReset();
    getSessionCharacterIdMock.mockResolvedValue(null);
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    afterMock.mockReset();
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 204 first, then reads the session and records the event after the response', async () => {
    getSessionCharacterIdMock.mockResolvedValue(CHARACTER_ID);
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, { action: 'page_view', metadata: { path: '/sites' } }));
    expect(res.status).toBe(204);
    expect(afterMock).toHaveBeenCalledOnce();
    expect(getSessionCharacterIdMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();

    await afterMock.mock.calls[0]![0]();

    expect(logUsageEventMock).toHaveBeenCalledExactlyOnceWith({
      action: 'page_view',
      characterId: CHARACTER_ID,
      metadata: { path: '/sites' },
    });
  });

  it('records anonymous events with a null characterId', async () => {
    getSessionCharacterIdMock.mockResolvedValue(null);
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, { action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(204);

    await afterMock.mock.calls[0]![0]();

    expect(logUsageEventMock).toHaveBeenCalledExactlyOnceWith({
      action: 'page_view',
      characterId: null,
      metadata: { path: '/' },
    });
  });

  it('returns 204 and logs a failed write under the telemetry scope (fail-soft)', async () => {
    getSessionCharacterIdMock.mockResolvedValue(CHARACTER_ID);
    const error = new Error('Failed query: connection error');
    logUsageEventMock.mockRejectedValue(error);
    const logged = silenceConsolePrefixes('error', ['[telemetry] telemetry write failed']);
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, { action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(204);

    await expect(afterMock.mock.calls[0]![0]()).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith('[telemetry] telemetry write failed', error);
    logged.mockRestore();
  });

  it('rate-limits a flooding caller with 429 + Retry-After and skips the write', async () => {
    checkRateLimitMock.mockResolvedValue({
      ok: false,
      failure: {
        category: 'rate_limited',
        code: 'rate_limited',
        retryAfterSeconds: 42,
      },
    });
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, { action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 42,
    });
    expect(getSessionCharacterIdMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('rejects unknown actions with 400', async () => {
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, { action: 'malicious_action' }));
    expect(res.status).toBe(400);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('rejects server-only actions a client must not forge with 400', async () => {
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, { action: 'cron_prices' }));
    expect(res.status).toBe(400);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('rejects non-object metadata with 400', async () => {
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, { action: 'page_view', metadata: 'not-an-object' }));
    expect(res.status).toBe(400);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('rejects oversized metadata with 400', async () => {
    const { POST } = await import('./route');
    const big = { blob: 'x'.repeat(3000) };
    const res = await POST(postJson(ROUTE, { action: 'page_view', metadata: big }));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'metadata_too_large',
      detail: 'metadata too large',
    });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON body', async () => {
    const { POST } = await import('./route');
    const res = await POST(postJson(ROUTE, 'not json'));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_json',
    });
    expect(afterMock).not.toHaveBeenCalled();
  });
});
