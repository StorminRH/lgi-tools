import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('requireSameOrigin', () => {
  it('prefers Origin over Referer and stays silent for the same origin', () => {
    const result = requireSameOrigin(mutationRequest({
      origin: 'https://lgi.tools',
      referer: 'https://foreign.example/private?credential=secret',
    }));

    expect(result).toEqual({ ok: true });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('uses Referer when Origin is absent', () => {
    const result = requireSameOrigin(mutationRequest({
      referer: 'https://foreign.example/private?credential=secret',
    }));

    expect(result).toEqual({
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
  });

  it('stays silent when both browser-origin headers are missing', () => {
    const result = requireSameOrigin(mutationRequest());

    expect(result).toEqual({ ok: true });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('uses the deployment-specific Vercel URL in previews', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'lgi-tools-git-security.example.vercel.app');

    const result = requireSameOrigin(mutationRequest({
      origin: 'https://lgi-tools-git-security.example.vercel.app',
    }));

    expect(result).toEqual({ ok: true });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('accepts the browser-visible request origin for a custom preview domain', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'lgi-tools-git-security.example.vercel.app');

    const result = requireSameOrigin(mutationRequest(
      { origin: 'https://security-preview.lgi.tools' },
      'https://security-preview.lgi.tools/api/preferences',
    ));

    expect(result).toEqual({ ok: true });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('uses Better Auth for local development', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

    const result = requireSameOrigin(mutationRequest(
      { origin: 'http://localhost:3000' },
      'http://localhost:3000/api/preferences',
    ));

    expect(result).toEqual({ ok: true });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('ignores VERCEL_URL outside previews and uses the production auth origin', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_URL', 'other.example.vercel.app');
    vi.stubEnv('BETTER_AUTH_URL', 'https://lgi.tools');

    const result = requireSameOrigin(
      mutationRequest({ origin: 'https://lgi.tools' }),
    );

    expect(result).toEqual({ ok: true });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('falls back to the configured site origin when Better Auth is unset', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', undefined);

    const result = requireSameOrigin(
      mutationRequest({ origin: 'https://lgi.tools' }),
    );

    expect(result).toEqual({ ok: true });
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('retains a null Origin without exposing other request data', () => {
    const result = requireSameOrigin(mutationRequest({
      origin: 'null',
      authorization: 'Bearer secret',
    }));

    expect(result).toMatchObject({
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
  });

  it('redacts malformed header content as invalid', () => {
    const result = requireSameOrigin(
      mutationRequest({ origin: 'not a URL with secret=abc' }),
    );

    expect(result).toMatchObject({
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
  });

  it('swallows telemetry failures', async () => {
    const error = new Error('database unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logUsageEventMock.mockRejectedValueOnce(error);

    expect(
      requireSameOrigin(
        mutationRequest({ origin: 'https://foreign.example' }),
      ),
    ).toMatchObject({
      ok: false,
      failure: { category: 'forbidden', code: 'cross_origin' },
    });

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        '[same-origin] telemetry write failed',
        error,
      );
    });
  });
});
