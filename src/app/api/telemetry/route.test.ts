import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CHARACTER_ID = 1000000000;

const getSessionCharacterIdMock = vi.fn();
const logUsageEventMock = vi.fn();
const rateLimitGuardMock = vi.fn();

vi.mock('@/features/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/session')>(
    '@/features/auth/session',
  );
  return {
    ...actual,
    getSessionCharacterId: () => getSessionCharacterIdMock(),
  };
});

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

// The guard's own 429 construction + IP keying are pinned in
// src/lib/rate-limit.test.ts; here we only drive its ok/denied union.
vi.mock('@/lib/rate-limit', () => ({
  rateLimitGuard: (...args: unknown[]) => rateLimitGuardMock(...args),
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
    rateLimitGuardMock.mockReset();
    rateLimitGuardMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 204 and records the event for a logged-in caller', async () => {
    getSessionCharacterIdMock.mockResolvedValue(CHARACTER_ID);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/sites' } }));
    expect(res.status).toBe(204);
    // The write is fire-and-forget — the 204 returns before it lands, so wait
    // for the scheduled insert rather than asserting synchronously.
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
    // The insert can fail; the tracker must never break a user flow, so the
    // 204 has already returned and the rejection is swallowed — logged so a
    // genuine bug stays visible.
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
    rateLimitGuardMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 429, headers: { 'Retry-After': '42' } }),
    });
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
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
    // cron_prices is server-only (written by the price cron) — a client POST
    // of it would pollute the health signal, so the public route must reject it.
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
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });
});
