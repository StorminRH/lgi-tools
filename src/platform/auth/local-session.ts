import { parseCookies } from 'better-auth/cookies';
import { makeSignature } from 'better-auth/crypto';
import { serializeCookie } from 'better-call';
import type { createAuth } from './auth';

export interface LocalSession {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    maxAgeSec: number;
  }>;
  headers: Headers;
}

export async function createLocalSession(
  ctx: Awaited<ReturnType<typeof createAuth>['$context']>,
  userId: string,
  requestHeaders?: Headers,
): Promise<LocalSession> {
  const session = await ctx.internalAdapter.createSession(userId);
  const { name, attributes } = ctx.authCookies.sessionToken;
  const value = `${session.token}.${await makeSignature(session.token, ctx.secret)}`;
  const maxAgeSec = Math.max(
    0,
    Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
  );
  const nativeSameSite = attributes.sameSite?.toLowerCase();
  const sameSite =
    nativeSameSite === 'strict'
      ? 'Strict' as const
      : nativeSameSite === 'none'
        ? 'None' as const
        : 'Lax' as const;
  const cookie: LocalSession['cookies'][number] = {
    name,
    value,
    domain: 'localhost',
    path: attributes.path ?? '/',
    httpOnly: attributes.httpOnly ?? true,
    secure: attributes.secure ?? false,
    sameSite,
    maxAgeSec,
  };
  const headers = new Headers();
  const existingCookies = parseCookies(requestHeaders?.get('cookie') ?? '');
  for (const cached of [
    ctx.authCookies.sessionData,
    ctx.authCookies.accountData,
    ctx.authCookies.dontRememberToken,
  ]) {
    const names = new Set([
      cached.name,
      ...[...existingCookies.keys()].filter((key) => key.startsWith(`${cached.name}.`)),
    ]);
    for (const key of names) {
      headers.append('Set-Cookie', serializeCookie(key, '', {
        ...cached.attributes,
        path: cached.attributes.path ?? '/',
        maxAge: 0,
      }));
    }
  }
  headers.append('Set-Cookie', serializeCookie(cookie.name, cookie.value, {
    ...attributes,
    domain: cookie.domain,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    maxAge: cookie.maxAgeSec,
    sameSite: cookie.sameSite,
  }));
  return { cookies: [cookie], headers };
}
