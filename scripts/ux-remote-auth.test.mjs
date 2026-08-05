import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  delete process.env.DOTENV_PATH;
});

describe('vercelBypassHeaders', () => {
  it('returns undefined for an explicit empty secret without reading env', async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'must-not-be-used';
    const { vercelBypassHeaders } = await import('./ux-remote-auth.mjs');
    expect(vercelBypassHeaders('')).toBeUndefined();
  });

  it('sets the protection bypass and cookie headers from an explicit secret', async () => {
    const { vercelBypassHeaders } = await import('./ux-remote-auth.mjs');
    expect(vercelBypassHeaders('test-secret')).toEqual({
      'x-vercel-protection-bypass': 'test-secret',
      'x-vercel-set-bypass-cookie': 'true',
    });
  });

  it('reads process env when no argument is passed', async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'from-env-secret';
    const { vercelBypassHeaders } = await import('./ux-remote-auth.mjs');
    expect(vercelBypassHeaders()).toEqual({
      'x-vercel-protection-bypass': 'from-env-secret',
      'x-vercel-set-bypass-cookie': 'true',
    });
  });
});

describe('installOriginScopedBypass', () => {
  it('is a no-op when no secret is available', async () => {
    const { installOriginScopedBypass } = await import('./ux-remote-auth.mjs');
    const route = vi.fn();
    expect(await installOriginScopedBypass({ route }, 'https://lgi.tools', '')).toBe(false);
    expect(route).not.toHaveBeenCalled();
  });

  it('registers a route matcher that only matches the target origin', async () => {
    const { installOriginScopedBypass } = await import('./ux-remote-auth.mjs');
    const calls = [];
    const context = {
      route: async (matcher, handler) => {
        calls.push({ matcher, handler });
      },
    };
    expect(await installOriginScopedBypass(context, 'https://lgi.tools/sites/3', 'test-secret')).toBe(
      true,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].matcher(new URL('https://lgi.tools/'))).toBe(true);
    expect(calls[0].matcher(new URL('https://lgi.tools/sites/3'))).toBe(true);
    expect(calls[0].matcher(new URL('https://images.evetech.net/characters/1/portrait'))).toBe(
      false,
    );
    expect(calls[0].matcher(new URL('https://evil.example/'))).toBe(false);
  });

  it('merges bypass headers onto same-origin continues without logging the secret', async () => {
    const { installOriginScopedBypass } = await import('./ux-remote-auth.mjs');
    let handler;
    const context = {
      route: async (_matcher, routeHandler) => {
        handler = routeHandler;
      },
    };
    await installOriginScopedBypass(context, 'https://lgi.tools', 'test-secret');
    const continueFn = vi.fn();
    await handler({
      request: () => ({
        headers: () => ({ accept: 'text/html', 'user-agent': 'test' }),
      }),
      continue: continueFn,
    });
    expect(continueFn).toHaveBeenCalledWith({
      headers: {
        accept: 'text/html',
        'user-agent': 'test',
        'x-vercel-protection-bypass': 'test-secret',
        'x-vercel-set-bypass-cookie': 'true',
      },
    });
  });
});
