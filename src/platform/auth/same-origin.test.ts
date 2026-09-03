import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const { logUsageEventMock } = vi.hoisted(() => ({
  logUsageEventMock: vi.fn(),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: logUsageEventMock,
}));

import { requireSameOrigin } from './same-origin';

function mutationRequest(
  headers: Record<string, string> = {},
  url = 'https://lgi.tools/api/preferences?token=secret',
): Request {
  return new Request(url, { method: 'POST', headers });
}

beforeEach(() => {
  logUsageEventMock.mockReset().mockResolvedValue(undefined);
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
  vi.stubEnv('BETTER_AUTH_URL', 'https://lgi.tools');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('accepts same-origin, missing provenance, preview, local, and production auth origins', () => {
  expect(
    requireSameOrigin(
      mutationRequest({
        origin: 'https://lgi.tools',
        referer: 'https://foreign.example/private?credential=secret',
      }),
    ),
  ).toEqual({ ok: true });
  expect(requireSameOrigin(mutationRequest())).toEqual({ ok: true });

  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', 'lgi-tools-git-security.example.vercel.app');
  expect(
    requireSameOrigin(
      mutationRequest({ origin: 'https://lgi-tools-git-security.example.vercel.app' }),
    ),
  ).toEqual({ ok: true });
  expect(
    requireSameOrigin(
      mutationRequest(
        { origin: 'https://security-preview.lgi.tools' },
        'https://security-preview.lgi.tools/api/preferences',
      ),
    ),
  ).toEqual({ ok: true });

  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('VERCEL_URL', undefined);
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  expect(
    requireSameOrigin(
      mutationRequest({ origin: 'http://localhost:3000' }, 'http://localhost:3000/api/preferences'),
    ),
  ).toEqual({ ok: true });

  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('VERCEL_URL', 'other.example.vercel.app');
  vi.stubEnv('BETTER_AUTH_URL', 'https://lgi.tools');
  expect(requireSameOrigin(mutationRequest({ origin: 'https://lgi.tools' }))).toEqual({ ok: true });

  vi.stubEnv('BETTER_AUTH_URL', undefined);
  expect(requireSameOrigin(mutationRequest({ origin: 'https://lgi.tools' }))).toEqual({ ok: true });
  expect(logUsageEventMock).not.toHaveBeenCalled();
});

test('rejects foreign Origin/Referer, null, and malformed headers and swallows telemetry failures', async () => {
  expect(
    requireSameOrigin(mutationRequest({ referer: 'https://foreign.example/private?credential=secret' })),
  ).toEqual({
    ok: false,
    failure: {
      category: 'forbidden',
      code: 'cross_origin',
      detail: 'Cross-origin requests are not allowed',
    },
  });
  expect(logUsageEventMock).toHaveBeenCalledWith({
    action: 'cross_origin_mutation',
    metadata: {
      route: '/api/preferences',
      offendingOrigin: 'https://foreign.example',
      source: 'referer',
    },
  });

  logUsageEventMock.mockClear();
  expect(
    requireSameOrigin(mutationRequest({ origin: 'null', authorization: 'Bearer secret' })),
  ).toMatchObject({
    ok: false,
    failure: { category: 'forbidden', code: 'cross_origin' },
  });
  expect(logUsageEventMock).toHaveBeenCalledWith({
    action: 'cross_origin_mutation',
    metadata: {
      route: '/api/preferences',
      offendingOrigin: 'null',
      source: 'origin',
    },
  });

  logUsageEventMock.mockClear();
  expect(requireSameOrigin(mutationRequest({ origin: 'not a URL with secret=abc' }))).toMatchObject({
    ok: false,
    failure: { category: 'forbidden', code: 'cross_origin' },
  });
  expect(logUsageEventMock).toHaveBeenCalledWith({
    action: 'cross_origin_mutation',
    metadata: {
      route: '/api/preferences',
      offendingOrigin: 'invalid',
      source: 'origin',
    },
  });

  const error = new Error('database unavailable');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  logUsageEventMock.mockRejectedValueOnce(error);
  expect(requireSameOrigin(mutationRequest({ origin: 'https://foreign.example' }))).toMatchObject({
    ok: false,
    failure: { category: 'forbidden', code: 'cross_origin' },
  });
  await vi.waitFor(() => {
    expect(consoleError).toHaveBeenCalledWith('[same-origin] telemetry write failed', error);
  });
});
