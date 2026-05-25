import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/features/auth/types';

const USER_SESSION: Session = {
  characterId: 2114872920,
  name: 'Nimrots Sarikusa',
  portraitUrl: 'https://images.evetech.net/characters/2114872920/portrait?size=128',
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

  it('rejects unknown actions with 400', async () => {
    getSessionMock.mockResolvedValue(USER_SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ action: 'malicious_action' }));
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
