import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

const CHARACTER_ID = 1000000000;

const getSessionCharacterIdMock = vi.fn();
const logUsageEventMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/platform/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/platform/auth/session')>(
    '@/platform/auth/session',
  );
  return {
    ...actual,
    getSessionCharacterId: () => getSessionCharacterIdMock(),
  };
});

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

async function importRoute() {
  return await import('./route');
}

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionCharacterIdMock.mockReset();
    getSessionCharacterIdMock.mockResolvedValue(null);
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 204 and records the event for a logged-in caller', async () => {
    getSessionCharacterIdMock.mockResolvedValue(CHARACTER_ID);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/sites' } }));
    expect(res.status).toBe(204);

    await vi.waitFor(() =>
      expect(logUsageEventMock).toHaveBeenCalledWith({
        action: 'page_view',
        characterId: CHARACTER_ID,
        metadata: { path: '/sites' },
      }),
    );
  });

  it('records anonymous events with a null characterId', async () => {
    getSessionCharacterIdMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(204);
    await vi.waitFor(() =>
      expect(logUsageEventMock).toHaveBeenCalledWith({
        action: 'page_view',
        characterId: null,
        metadata: { path: '/' },
      }),
    );
  });

  it('returns 204 and stays up when the write fails (fail-soft)', async () => {

    getSessionCharacterIdMock.mockResolvedValue(CHARACTER_ID);
    logUsageEventMock.mockRejectedValue(new Error('Failed query: connection error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(204);
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    errorSpy.mockRestore();
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
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 42,
    });
    expect(getSessionCharacterIdMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('rejects unknown actions with 400', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'malicious_action' }));
    expect(res.status).toBe(400);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('rejects server-only actions a client must not forge with 400', async () => {
    const { POST } = await importRoute();

    const res = await POST(buildRequest({ action: 'cron_prices' }));
    expect(res.status).toBe(400);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('rejects non-object metadata with 400', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: 'not-an-object' }));
    expect(res.status).toBe(400);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('rejects oversized metadata with 400', async () => {
    const { POST } = await importRoute();
    const big = { blob: 'x'.repeat(3000) };
    const res = await POST(buildRequest({ action: 'page_view', metadata: big }));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'metadata_too_large',
      detail: 'metadata too large',
    });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON body', async () => {
    const { POST } = await importRoute();
    const req = new NextRequest('http://localhost:3000/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_json',
    });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });
});
