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

const LINEAR_SUCCESS = {
  data: {
    issueCreate: {
      success: true,
      issue: { id: 'issue-1', title: 'sites browser is broken on C3 relic' },
    },
  },
};

const getSessionMock = vi.fn();
const logUsageEventMock = vi.fn();
const fetchMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock('@/composition/session', async () => {
  const actual = await vi.importActual<typeof import('@/composition/session')>(
    '@/composition/session',
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

function linearPayload(init: RequestInit | undefined) {
  return JSON.parse((init as RequestInit).body as string) as {
    query: string;
    variables: {
      input: {
        title: string;
        description: string;
        teamId: string;
        labelIds?: string[];
      };
    };
  };
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('LINEAR_API_KEY', 'lin_api_test_token');
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

  it('opens Linear issues for logged-in and anonymous submissions and sanitises control characters', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(LINEAR_SUCCESS), { status: 200 }),
    );

    const { POST } = await importRoute();
    const res = await POST(
      buildRequest(
        {
          title: 'sites browser is broken on C3 relic',
          message: 'Relic sites on C3 lose their filter after refresh.',
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
    expect(url).toBe('https://api.linear.app/graphql');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
    expect(headers.get('Authorization')).toBe('lin_api_test_token');
    expect(headers.get('Content-Type')).toBe('application/json');
    const payload = linearPayload(init as RequestInit);
    expect(payload.query).toContain('issueCreate');
    expect(payload.variables.input.title).toBe('sites browser is broken on C3 relic');
    expect(payload.variables.input.teamId).toBe('d6e910f7-a117-4358-896a-6ef20b13e117');
    expect(payload.variables.input.labelIds).toEqual([
      'a567bd23-7df3-46aa-aad9-0ba7c908e918',
    ]);
    expect(payload.variables.input.description).toContain(
      'Relic sites on C3 lose their filter after refresh.',
    );
    expect(payload.variables.input.description).toContain('**Submitted by:** Test Pilot');
    expect(payload.variables.input.description).toContain('`/sites?class=c3`');
    expect(payload.variables.input.description).not.toContain('#1000000000');
    expect(payload.variables.input.title).not.toBe(
      'Relic sites on C3 lose their filter after refresh.',
    );

    expect(logUsageEventMock).toHaveBeenCalledOnce();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'feedback_submitted',
      characterId: 1000000000,
      metadata: {
        titleLength: 'sites browser is broken on C3 relic'.length,
        messageLength: 'Relic sites on C3 lose their filter after refresh.'.length,
        path: '/sites?class=c3',
        category: 'bug',
      },
    });

    getSessionMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(LINEAR_SUCCESS), { status: 200 }),
    );
    logUsageEventMock.mockClear();
    fetchMock.mockClear();

    const anon = await POST(
      buildRequest({
        title: 'love the changelog',
        message: 'The latest notes were easy to scan.',
        path: '/changelog',
        category: 'other',
      }),
    );
    expect(anon.status).toBe(204);
    const anonPayload = linearPayload(fetchMock.mock.calls[0]![1] as RequestInit);
    expect(anonPayload.variables.input.title).toBe('love the changelog');
    expect(anonPayload.variables.input.labelIds).toBeUndefined();
    expect(anonPayload.variables.input.description).toContain('**Submitted by:** Anonymous');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'feedback_submitted',
      characterId: null,
      metadata: {
        titleLength: 'love the changelog'.length,
        messageLength: 'The latest notes were easy to scan.'.length,
        path: '/changelog',
        category: 'other',
      },
    });

    getSessionMock.mockResolvedValue(SESSION);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(LINEAR_SUCCESS), { status: 200 }),
    );
    fetchMock.mockClear();

    const scrubbed = await POST(
      buildRequest({
        title: 'hello\u0000world\u0007',
        message: 'please\u0000add export',
        path: '/sites\u0000?q=test',
        category: 'feature',
      }),
    );
    expect(scrubbed.status).toBe(204);
    const scrubbedPayload = linearPayload(fetchMock.mock.calls[0]![1] as RequestInit);
    expect(scrubbedPayload.variables.input.title).toBe('helloworld');
    expect(scrubbedPayload.variables.input.description).toContain('pleaseadd export');
    expect(scrubbedPayload.variables.input.description).toContain('`/sites?q=test`');
    expect(scrubbedPayload.variables.input.labelIds).toEqual([
      '2f9442ba-c519-4c1c-9b9b-202335d2de73',
    ]);
  });

  it('rejects empty, malformed, oversized, and invalid path or category bodies before Linear', async () => {
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
        buildRequest({
          title: 'x'.repeat(481),
          message: 'hi',
          path: '/sites',
          category: 'bug',
        }),
      ),
      400,
      'invalid_body',
    );
    await expectProblem(
      await POST(
        buildRequest({ title: 'hi', message: 'x'.repeat(8001), path: '/sites', category: 'bug' }),
      ),
      400,
      'invalid_body',
    );
    await expectProblem(
      await POST(
        buildRequest({
          title: 'hi',
          message: 'hi',
          path: '/' + 'x'.repeat(2049),
          category: 'bug',
        }),
      ),
      400,
      'invalid_body',
    );
    await expectProblem(
      await POST(buildRequest({ title: 'hi', message: 42, path: '/sites', category: 'bug' })),
      400,
      'invalid_body',
    );
    expect(checkRateLimitMock).not.toHaveBeenCalled();

    await expectProblem(
      await POST(buildRequest({ title: '   ', message: 'hi', path: '/sites', category: 'bug' })),
      400,
      'title_empty',
      'title must not be empty',
    );
    await expectProblem(
      await POST(buildRequest({ title: 'hi', message: '    ', path: '/sites', category: 'bug' })),
      400,
      'message_empty',
      'message must not be empty',
    );
    await expectProblem(
      await POST(
        buildRequest({ title: 'hi', message: 'hi', path: 'not-a-path', category: 'bug' }),
      ),
      400,
      'path_invalid',
      'path must start with /',
    );
    expect(checkRateLimitMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('blocks cross-origin posts and maps unset token or Linear failure without telemetry', async () => {
    const { POST } = await importRoute();
    await expectProblem(
      await POST(
        buildRequest(
          { title: 'hello', message: 'hello', path: '/sites', category: 'bug' },
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
      await POST(
        buildRequest({ title: 'hi', message: 'hi', path: '/sites', category: 'bug' }),
      ),
      502,
      'linear_failed',
      'Linear rejected the feedback',
    );
    expect(logUsageEventMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'denied' }] }), { status: 200 }),
    );
    await expectProblem(
      await POST(
        buildRequest({ title: 'hi', message: 'hi', path: '/sites', category: 'bug' }),
      ),
      502,
      'linear_failed',
      'Linear rejected the feedback',
    );
    expect(logUsageEventMock).not.toHaveBeenCalled();

    vi.stubEnv('LINEAR_API_KEY', '');
    fetchMock.mockClear();
    await expectProblem(
      await POST(
        buildRequest({ title: 'hi', message: 'hi', path: '/sites', category: 'bug' }),
      ),
      503,
      'feedback_unconfigured',
      'Feedback channel is not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
