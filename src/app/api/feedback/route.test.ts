import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { problemBodySchema } from '@/lib/problem';
import type { Session } from '@/platform/auth/types';

const SESSION: Session = {
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
  role: 'USER',
};

const getSessionMock = vi.fn();
const logUsageEventMock = vi.fn();
const fetchMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/platform/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/platform/auth/session')>(
    '@/platform/auth/session',
  );
  return {
    ...actual,
    getSession: () => getSessionMock(),
  };
});

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (request: Request, options: unknown) =>
    checkRateLimitMock(request, options),
}));

async function importRoute() {
  return await import('./route');
}

function buildRequest(
  body: unknown,
  origin?: string,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin === undefined ? {} : { origin }),
    },
    body: JSON.stringify(body),
  });
}

function buildRawRequest(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

async function expectProblem(
  response: Response,
  status: number,
  code: string,
  detail?: string,
) {
  const body = problemBodySchema.parse(await response.json());
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toBe('application/problem+json');
  expect(body).toMatchObject({
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
  });
  return body;
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.example/webhook/test');
    getSessionMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forwards a logged-in submission to Discord and logs the event', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest(
        { message: 'sites browser is broken on C3 relic', path: '/sites?class=c3' },
        'http://localhost:3000',
      ),
    );

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://discord.example/webhook/test');
    // Outbound identity header (T-3): the Discord webhook must self-identify
    // like every other outbound surface.
    expect(new Headers((init as RequestInit).headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.embeds[0].author.name).toBe('Test Pilot (#1000000000)');
    expect(payload.embeds[0].description).toBe('sites browser is broken on C3 relic');
    expect(payload.embeds[0].fields[0].name).toBe('Page');
    expect(payload.embeds[0].fields[0].value).toBe('`/sites?class=c3`');

    expect(logUsageEventMock).toHaveBeenCalledOnce();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'feedback_submitted',
      characterId: 1000000000,
      metadata: { messageLength: 'sites browser is broken on C3 relic'.length, path: '/sites?class=c3' },
    });
  });

  it('attributes an anonymous submission and logs with null characterId', async () => {
    getSessionMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ message: 'love the changelog', path: '/changelog' }),
    );

    expect(res.status).toBe(204);
    const payload = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(payload.embeds[0].author.name).toBe('Anonymous');
    expect(payload.embeds[0].fields[0].value).toBe('`/changelog`');

    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'feedback_submitted',
      characterId: null,
      metadata: { messageLength: 'love the changelog'.length, path: '/changelog' },
    });
  });

  it('returns a mapped 403 for a cross-origin request', async () => {
    const { POST } = await importRoute();
    const res = await POST(
      buildRequest(
        { message: 'hello', path: '/sites' },
        'https://foreign.example',
      ),
    );

    await expectProblem(
      res,
      403,
      'cross_origin',
      'Cross-origin requests are not allowed',
    );
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when message is empty after trim', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ message: '    ', path: '/sites' }));
    await expectProblem(res, 400, 'message_empty', 'message must not be empty');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 when message exceeds the input cap (>8000 chars)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({ message: 'x'.repeat(8001), path: '/sites' }),
    );
    await expectProblem(res, 400, 'invalid_body');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when path does not start with a slash', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ message: 'hi', path: 'not-a-path' }));
    await expectProblem(res, 400, 'path_invalid', 'path must start with /');
    expect(checkRateLimitMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when path exceeds the input cap (>2048 chars)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ message: 'hi', path: '/' + 'x'.repeat(2049) }));
    await expectProblem(res, 400, 'invalid_body');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRawRequest('{not json'));
    await expectProblem(res, 400, 'invalid_json', 'Invalid JSON');
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when message is not a string', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ message: 42, path: '/sites' }));
    await expectProblem(res, 400, 'invalid_body');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips control characters from message and path before forwarding', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest({
        message: 'hello\u0000world\u0007',
        path: '/sites\u0000?q=test',
      }),
    );

    expect(res.status).toBe(204);
    const payload = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(payload.embeds[0].description).toBe('helloworld');
    expect(payload.embeds[0].fields[0].value).toBe('`/sites?q=test`');
  });

  it('returns 502 and skips telemetry when Discord responds non-2xx', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));

    const { POST } = await importRoute();
    const res = await POST(buildRequest({ message: 'hi', path: '/sites' }));
    await expectProblem(
      res,
      502,
      'discord_failed',
      'Discord rejected the feedback',
    );
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

});
