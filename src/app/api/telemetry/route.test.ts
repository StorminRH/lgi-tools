import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/features/auth/types';

const USER_SESSION: Session = {
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
  role: 'USER',
};

const getSessionMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/features/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth/session')>(
    '@/features/auth/session',
  );
  return {
    ...actual,
    getSession: () => getSessionMock(),
  };
});

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
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
    getSessionMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 204 and records the event for a logged-in caller', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/sites' } }));
    expect(res.status).toBe(204);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'page_view',
      characterId: USER_SESSION.characterId,
      metadata: { path: '/sites' },
    });
  });

  it('records anonymous events with a null characterId', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(204);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'page_view',
      characterId: null,
      metadata: { path: '/' },
    });
  });

  it('returns 204 and logs when the session read fails (fail-soft)', async () => {
    // getSession() re-queries the characters row; that DB read can fail. The
    // tracker must never break a user flow, so a thrown session read still 204s
    // — but the failure is logged so a genuine bug stays visible.
    getSessionMock.mockRejectedValue(new Error('Failed query: connection error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: { path: '/' } }));
    expect(res.status).toBe(204);
    expect(logUsageEventMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('rejects unknown actions with 400', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'malicious_action' }));
    expect(res.status).toBe(400);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('rejects server-only actions a client must not forge with 400', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    // cron_prices is server-only (written by the price cron) — a client POST
    // of it would pollute the health signal, so the public route must reject it.
    const res = await POST(buildRequest({ action: 'cron_prices' }));
    expect(res.status).toBe(400);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('rejects non-object metadata with 400', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'page_view', metadata: 'not-an-object' }));
    expect(res.status).toBe(400);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('rejects oversized metadata with 400', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const big = { blob: 'x'.repeat(3000) };
    const res = await POST(buildRequest({ action: 'page_view', metadata: big }));
    expect(res.status).toBe(400);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON body', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
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
