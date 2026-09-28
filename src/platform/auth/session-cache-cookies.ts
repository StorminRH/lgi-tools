import { parseCookies } from 'better-auth/cookies';
import { serializeCookie, type CookieOptions } from 'better-call';

export interface AuthCookieContext {
  readonly authCookies: Record<
    'sessionData' | 'accountData' | 'dontRememberToken',
    { readonly name: string; readonly attributes: CookieOptions }
  >;
}

/**
 * `maxAge=0` Set-Cookie values for Better Auth's cached-session cookies and
 * every `<name>.N` chunk present on the request, so the next request misses
 * the cookie cache and reads the session row again.
 */
export function expireSessionCacheCookies(
  ctx: AuthCookieContext,
  requestCookieHeader: string | null | undefined,
): string[] {
  const existing = parseCookies(requestCookieHeader ?? '');
  const expired: string[] = [];
  for (const cached of [
    ctx.authCookies.sessionData,
    ctx.authCookies.accountData,
    ctx.authCookies.dontRememberToken,
  ]) {
    const names = new Set([
      cached.name,
      ...[...existing.keys()].filter((key) => key.startsWith(`${cached.name}.`)),
    ]);
    for (const name of names) {
      expired.push(
        serializeCookie(name, '', {
          ...cached.attributes,
          path: cached.attributes.path ?? '/',
          maxAge: 0,
        }),
      );
    }
  }
  return expired;
}
