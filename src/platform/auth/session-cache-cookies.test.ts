import { describe, expect, it } from 'vitest';
import { expireSessionCacheCookies } from './session-cache-cookies';

const ctx = {
  authCookies: {
    sessionData: { name: 'better-auth.session_data', attributes: { httpOnly: true, sameSite: 'lax' as const } },
    accountData: { name: 'better-auth.account_data', attributes: { path: '/api' } },
    dontRememberToken: { name: 'better-auth.dont_remember', attributes: {} },
  },
};

describe('expireSessionCacheCookies', () => {
  it('expires each cache cookie plus every chunk the browser sent, keeping the cookie attributes', () => {
    expect(
      expireSessionCacheCookies(
        ctx,
        'better-auth.session_data.0=a; better-auth.session_data.1=b; better-auth.session_token=t; other=1',
      ),
    ).toEqual([
      'better-auth.session_data=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
      'better-auth.session_data.0=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
      'better-auth.session_data.1=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
      'better-auth.account_data=; Max-Age=0; Path=/api',
      'better-auth.dont_remember=; Max-Age=0; Path=/',
    ]);
  });

  it('expires the base names when the request carries no cookies', () => {
    expect(expireSessionCacheCookies(ctx, null).map((c) => c.split(';')[0])).toEqual([
      'better-auth.session_data=',
      'better-auth.account_data=',
      'better-auth.dont_remember=',
    ]);
  });
});
