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
    vi.stubEnv('GITHUB_FEEDBACK_TOKEN', 'ghp_test_token');
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

  it('opens GitHub issues for logged-in and anonymous submissions and sanitises control characters', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ number: 42 }), { status: 201 }),
    );

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest(
        {
          message: 'sites browser is broken on C3 relic',
          path: '/sites?class=c3',
          category: 'bug',
        },
        'http://localhost:3000',
      ),
    );

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/StorminRH/lgi-tools/issues');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
    expect(headers.get('Authorization')).toBe('Bearer ghp_test_token');
    expect(headers.get('Accept')).toBe('application/vnd.github+json');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.title).toBe('[Bug] sites browser is broken on C3 relic');
    expect(payload.labels).toEqual(['bug']);
    expect(payload.body).toContain('sites browser is broken on C3 relic');
    expect(payload.body).toContain('**Submitted by:** Test Pilot');
    expect(payload.body).toContain('`/sites?class=c3`');
    expect(payload.body).not.toContain('#1000000000');

    expect(logUsageEventMock).toHaveBeenCalledOnce();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'feedback_submitted',
      characterId: 1000000000,
      metadata: {
        messageLength: 'sites browser is broken on C3 relic'.length,
        path: '/sites?class=c3',
        category: 'bug',
      },
    });

    getSessionMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ number: 1 }), { status: 201 }));
    logUsageEventMock.mockClear();
    fetchMock.mockClear();

    const anon = await POST(
      buildRequest({
        message: 'love the changelog',
        path: '/changelog',
        category: 'other',
      }),
    );
    expect(anon.status).toBe(204);
    const anonPayload = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(anonPayload.title).toBe('[Other] love the changelog');
    expect(anonPayload.labels).toBeUndefined();
    expect(anonPayload.body).toContain('**Submitted by:** Anonymous');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'feedback_submitted',
      characterId: null,
      metadata: {
        messageLength: 'love the changelog'.length,
        path: '/changelog',
        category: 'other',
      },
    });

    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ number: 1 }), { status: 201 }));
    fetchMock.mockClear();

    const scrubbed = await POST(
      buildRequest({
        message: 'hello\u0000world\u0007',
        path: '/sites\u0000?q=test',
        category: 'feature',
      }),
    );
    expect(scrubbed.status).toBe(204);
    const scrubbedPayload = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(scrubbedPayload.title).toBe('[Feature request] helloworld');
    expect(scrubbedPayload.body).toContain('helloworld');
    expect(scrubbedPayload.body).toContain('`/sites?q=test`');
    expect(scrubbedPayload.labels).toEqual(['enhancement']);
  });

  it('rejects empty, malformed, oversized, and invalid path or category bodies before GitHub', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    const { POST } = await importRoute();

    await expectProblem(
      await POST(buildRawRequest('{not json')),
      400,
      'invalid_json',
      'Invalid JSON',
    );
    expect(checkRateLimitMock).not.toHaveBeenCalled();

    await expectProblem(
      await POST(buildRequest({ message: 'hi', path: '/sites' })),
      400,
      'invalid_body',
    );
    await expectProblem(
      await POST(
        buildRequest({ message: 'x'.repeat(8001), path: '/sites', category: 'bug' }),
      ),
      400,
      'invalid_body',
    );
    await expectProblem(
      await POST(
        buildRequest({
          message: 'hi',
          path: '/' + 'x'.repeat(2049),
          category: 'bug',
        }),
      ),
      400,
      'invalid_body',
    );
    await expectProblem(
      await POST(buildRequest({ message: 42, path: '/sites', category: 'bug' })),
      400,
      'invalid_body',
    );
    expect(checkRateLimitMock).not.toHaveBeenCalled();

    await expectProblem(
      await POST(buildRequest({ message: '    ', path: '/sites', category: 'bug' })),
      400,
      'message_empty',
      'message must not be empty',
    );
    await expectProblem(
      await POST(
        buildRequest({ message: 'hi', path: 'not-a-path', category: 'bug' }),
      ),
      400,
      'path_invalid',
      'path must start with /',
    );
    expect(checkRateLimitMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('blocks cross-origin posts and maps unset token or GitHub failure without telemetry', async () => {
    const { POST } = await importRoute();
    await expectProblem(
      await POST(
        buildRequest(
          { message: 'hello', path: '/sites', category: 'bug' },
          'https://foreign.example',
        ),
      ),
      403,
      'cross_origin',
      'Cross-origin requests are not allowed',
    );
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    logUsageEventMock.mockClear();
    await expectProblem(
      await POST(buildRequest({ message: 'hi', path: '/sites', category: 'bug' })),
      502,
      'github_failed',
      'GitHub rejected the feedback',
    );
    expect(logUsageEventMock).not.toHaveBeenCalled();

    vi.stubEnv('GITHUB_FEEDBACK_TOKEN', '');
    fetchMock.mockClear();
    await expectProblem(
      await POST(buildRequest({ message: 'hi', path: '/sites', category: 'bug' })),
      503,
      'feedback_unconfigured',
      'Feedback channel is not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
