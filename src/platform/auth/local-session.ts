import { parseCookies } from 'better-auth/cookies';
import { makeSignature } from 'better-auth/crypto';
import { NextResponse } from 'next/server';
import type { createAuth } from './auth';

export async function createLocalSession(
  ctx: Awaited<ReturnType<typeof createAuth>['$context']>,
  userId: string,
  requestHeaders?: Headers,
) {
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
  const cookie = {
    name,
    value,
    domain: 'localhost',
    path: attributes.path ?? '/',
    httpOnly: attributes.httpOnly ?? true,
    secure: attributes.secure ?? false,
    sameSite,
    maxAgeSec,
  };
  const response = new NextResponse();
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
      const cachedSameSite = cached.attributes.sameSite?.toLowerCase();
      response.cookies.set(key, '', {
        ...cached.attributes,
        path: cached.attributes.path ?? '/',
        maxAge: 0,
        sameSite:
          cachedSameSite === 'strict'
            ? 'strict'
            : cachedSameSite === 'none'
              ? 'none'
              : 'lax',
      });
    }
  }
  response.cookies.set(name, value, {
    ...attributes,
    domain: cookie.domain,
    maxAge: maxAgeSec,
    sameSite:
      nativeSameSite === 'strict'
        ? 'strict'
        : nativeSameSite === 'none'
          ? 'none'
          : 'lax',
  });
  return { cookies: [cookie], headers: response.headers };
}
