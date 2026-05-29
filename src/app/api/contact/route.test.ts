import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import type { Session } from '@/features/auth/types';

const SESSION: Session = {
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
  role: 'USER',
};

const getSessionMock = vi.fn();
const logUsageEventMock = vi.fn();
const fetchMock = vi.fn();

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
  return new NextRequest('http://localhost:3000/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildRawRequest(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('CONTACT_EMAIL', 'dev@example.com');
    vi.stubEnv('CONTACT_FROM_EMAIL', '');
    getSessionMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('emails the maintainer and logs the event, with the visitor as Reply-To', async () => {
    getSessionMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response('{"id":"abc"}', { status: 200 }));

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ email: 'pilot@example.com', message: 'C3 relic prices look stale' }),
    );

    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers((init as RequestInit).headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
    expect(new Headers((init as RequestInit).headers).get('Authorization')).toBe(
      'Bearer test-key',
    );
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.to).toEqual(['dev@example.com']);
    expect(payload.reply_to).toBe('pilot@example.com');
    expect(payload.text).toContain('C3 relic prices look stale');

    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'contact_submitted',
      characterId: null,
      metadata: { messageLength: 'C3 relic prices look stale'.length },
    });
  });

  it('attaches in-game character context when the sender is logged in', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(new Response('{"id":"abc"}', { status: 200 }));

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ email: 'pilot@example.com', message: 'hello' }),
    );

    expect(res.status).toBe(204);
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.text).toContain('in-game: Test Pilot #1000000000');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'contact_submitted',
      characterId: 1000000000,
      metadata: { messageLength: 'hello'.length },
    });
  });

  it('silently accepts (204) and does not send when the honeypot is filled', async () => {
    getSessionMock.mockResolvedValue(null);

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ email: 'bot@example.com', message: 'spam', website: 'http://spam.example' }),
    );

    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid email', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ email: 'not-an-email', message: 'hi' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the message is empty', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ email: 'pilot@example.com', message: '' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the message exceeds the input cap', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ email: 'pilot@example.com', message: 'x'.repeat(16001) }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(buildRawRequest('{not json'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 502 and skips telemetry when the mail service responds non-2xx', async () => {
    getSessionMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response('rejected', { status: 422 }));

    const { POST } = await importRoute();
    const res = await POST(buildRequest({ email: 'pilot@example.com', message: 'hi' }));
    expect(res.status).toBe(502);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('returns 502 and skips telemetry when the fetch throws', async () => {
    getSessionMock.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new Error('network down'));

    const { POST } = await importRoute();
    const res = await POST(buildRequest({ email: 'pilot@example.com', message: 'hi' }));
    expect(res.status).toBe(502);
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('returns 503 when the contact form is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('CONTACT_EMAIL', '');
    getSessionMock.mockResolvedValue(null);

    const { POST } = await importRoute();
    const res = await POST(buildRequest({ email: 'pilot@example.com', message: 'hi' }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
