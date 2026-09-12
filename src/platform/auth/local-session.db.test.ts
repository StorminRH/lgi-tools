import { parseSetCookieHeader } from 'better-auth/cookies';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';
import { session } from '@/db/auth-schema';

const harness = await createDbTestHarness({
  schema: 'test_local_session_cache',
  tables: ['user', 'account', 'session', 'characters'],
  steerDbProxy: true,
  env: {
    BETTER_AUTH_SECRET: 'local-session-cache-test-secret-32chars',
    BETTER_AUTH_URL: 'http://localhost:3000',
  },
  resetBetweenTests: 'delete',
});

describe.skipIf(!harness.reachable)('local session cookie cache (real Postgres)', () => {
  it.each([
    ['e2e-pilot', false],
    ['ordinary-user', true],
  ] as const)('checks revocation for %s without changing ordinary caching', async (userId, retainsCache) => {
    await seedUser(harness.db, userId);
    const { createAuth } = await import('./auth');
    const { createLocalSession } = await import('./local-session');
    const auth = createAuth({
      runners: {
        runBeforeUserDelete: async () => {},
        runAfterCharacterLinkChanged: async () => {},
      },
      reconcileCharacterOwner: async () => {},
    });
    const issued = await createLocalSession(await auth.$context, userId);
    const cookie = issued.cookies[0]!;
    const tokenHeader = `${cookie.name}=${cookie.value}`;
    const first = await auth.api.getSession({
      headers: new Headers({ cookie: tokenHeader }),
      returnHeaders: true,
    });
    expect(first.response?.user.id).toBe(userId);
    const cacheName = (await auth.$context).authCookies.sessionData.name;
    const cacheCookie = first.headers.getSetCookie().find((value) => value.startsWith(`${cacheName}=`));
    expect(cacheCookie).toBeDefined();
    const browserCookies = `${tokenHeader}; ${cacheCookie!.split(';')[0]}`;
    await harness.db.delete(session).where(eq(session.userId, userId));
    const afterRevocation = await auth.api.getSession({
      headers: new Headers({ cookie: browserCookies }),
    });
    if (retainsCache) expect(afterRevocation?.user.id).toBe(userId);
    else expect(afterRevocation).toBeNull();
  });

  it.each([false, true])('replaces another user cache when chunked is %s', async (chunked) => {
    await seedUser(harness.db, 'ordinary-user');
    await seedUser(harness.db, 'e2e-pilot');
    const { createAuth } = await import('./auth');
    const { createLocalSession } = await import('./local-session');
    const auth = createAuth({
      runners: {
        runBeforeUserDelete: async () => {},
        runAfterCharacterLinkChanged: async () => {},
      },
      reconcileCharacterOwner: async () => {},
    });
    const ctx = await auth.$context;
    const prior = await createLocalSession(ctx, 'ordinary-user');
    const token = prior.cookies[0]!;
    const browser = new Map([[token.name, token.value]]);
    const browserHeaders = () => new Headers({
      cookie: [...browser].map(([name, value]) => `${name}=${value}`).join('; '),
    });
    const first = await auth.api.getSession({ headers: browserHeaders(), returnHeaders: true });
    expect(first.response?.user.id).toBe('ordinary-user');
    const cacheName = ctx.authCookies.sessionData.name;
    for (const header of first.headers.getSetCookie()) {
      for (const [name, attrs] of parseSetCookieHeader(header)) browser.set(name, attrs.value);
    }
    const cache = browser.get(cacheName);
    expect(cache).toBeDefined();
    if (chunked) {
      browser.delete(cacheName);
      const midpoint = Math.floor(cache!.length / 2);
      browser.set(`${cacheName}.0`, cache!.slice(0, midpoint));
      browser.set(`${cacheName}.1`, cache!.slice(midpoint));
    }
    expect((await auth.api.getSession({ headers: browserHeaders() }))?.user.id).toBe('ordinary-user');
    const switched = await createLocalSession(ctx, 'e2e-pilot', browserHeaders());
    for (const header of switched.headers.getSetCookie()) {
      for (const [name, attrs] of parseSetCookieHeader(header)) {
        if (attrs['max-age'] === 0) browser.delete(name);
        else browser.set(name, attrs.value);
      }
    }
    expect([...browser.keys()].filter((name) => name.startsWith(cacheName))).toEqual([]);
    expect((await auth.api.getSession({ headers: browserHeaders() }))?.user.id).toBe('e2e-pilot');
  });

});
