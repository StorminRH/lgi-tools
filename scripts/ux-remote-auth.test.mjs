import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  delete process.env.DOTENV_PATH;
});

describe('ux-remote-auth bypass', () => {
  it('vercelBypassHeaders resolves empty, explicit, and env secrets', async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'must-not-be-used';
    const { vercelBypassHeaders } = await import('./ux-remote-auth.mjs');
    expect(vercelBypassHeaders('')).toBeUndefined();

    expect(vercelBypassHeaders('test-secret')).toEqual({
      'x-vercel-protection-bypass': 'test-secret',
      'x-vercel-set-bypass-cookie': 'true',
    });

    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'from-env-secret';
    vi.resetModules();
    const envMod = await import('./ux-remote-auth.mjs');
    expect(envMod.vercelBypassHeaders()).toEqual({
      'x-vercel-protection-bypass': 'from-env-secret',
      'x-vercel-set-bypass-cookie': 'true',
    });
  });

  it('installOriginScopedBypass is a no-op without a secret and origin-scopes with one', async () => {
    const { installOriginScopedBypass } = await import('./ux-remote-auth.mjs');
    const idleRoute = vi.fn();
    expect(await installOriginScopedBypass({ route: idleRoute }, 'https://lgi.tools', '')).toBe(
      false,
    );
    expect(idleRoute).not.toHaveBeenCalled();

    let handler;
    const context = {
      route: async (matcher, routeHandler) => {
        handler = routeHandler;
        expect(matcher(new URL('https://lgi.tools/'))).toBe(true);
        expect(matcher(new URL('https://lgi.tools/sites/3'))).toBe(true);
        expect(matcher(new URL('https://images.evetech.net/characters/1/portrait'))).toBe(false);
        expect(matcher(new URL('https://evil.example/'))).toBe(false);
      },
    };
    expect(
      await installOriginScopedBypass(context, 'https://lgi.tools/sites/3', 'test-secret'),
    ).toBe(true);

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
