import { describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { getOAuthState } from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins';

type AccountRow = {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  ownerHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SessionRow = { userId: string };

const BASE = 'http://localhost:3000/api/auth';
const STRAY_CHARACTER = '111';
const FRESH_CHARACTER = '222';
const OWNER_FROM_HOOK = 'owner-hash-from-plaintext-token';

function makeHarness({
  rebindTo,
  provenCharacter = STRAY_CHARACTER,
}: {
  rebindTo: string | null;
  provenCharacter?: string;
}) {
  const now = new Date();
  const createBeforeCalls: string[] = [];
  const db = {
    user: [
      {
        id: 'user-a',
        name: 'Stray Owner',
        email: `${STRAY_CHARACTER}@eve.invalid`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    account: [
      {
        id: 'acct-a',
        userId: 'user-a',
        providerId: 'eve',
        accountId: STRAY_CHARACTER,
        accessToken: 'old-at',
        refreshToken: 'old-rt',
        scope: 'old-scope',
        createdAt: now,
        updatedAt: now,
      },
    ] as AccountRow[],
    session: [] as SessionRow[],
    verification: [] as Record<string, unknown>[],
  };
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'spike-secret-at-least-32-chars-long!!',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    account: {
      accountLinking: { allowDifferentEmails: true },
      additionalFields: {
        ownerHash: { type: 'string', required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      account: {
        create: {
          before: async (acct) => {
            if (acct.providerId !== 'eve') return;
            createBeforeCalls.push(`${acct.accountId}:${acct.accessToken}`);
            return { data: { ...acct, ownerHash: OWNER_FROM_HOOK } };
          },
        },
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: 'eve',
            clientId: 'spike-client',
            clientSecret: 'spike-secret',
            authorizationUrl: 'http://eve.test/authorize',
            tokenUrl: 'http://eve.test/token',
            pkce: true,
            getToken: async () => ({
              accessToken: 'new-at',
              refreshToken: 'new-rt',
              scopes: ['scope-a'],
              raw: {},
            }),
            getUserInfo: async () => {
              if (rebindTo !== null) {
                const state = (await getOAuthState()) as { link?: { userId: string } } | null;
                if (state?.link) state.link.userId = rebindTo;
              }
              return {
                id: provenCharacter,
                name: 'Spike Pilot',
                email: `${provenCharacter}@eve.invalid`,
                emailVerified: true,
              };
            },
          },
        ],
      }),
    ],
  });
  return { auth, db, createBeforeCalls };
}

type Harness = ReturnType<typeof makeHarness>;

function cookiePairs(res: Response): string[] {
  return res.headers.getSetCookie().map((c) => c.split(';')[0]!);
}

async function post(
  auth: Harness['auth'],
  path: string,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function callback(auth: Harness['auth'], state: string, cookie?: string): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/oauth2/callback/eve?code=fake-code&state=${state}`, {
      method: 'GET',
      headers: cookie ? { cookie } : {},
    }),
  );
}

function redirectTarget(res: Response): URL {
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  const location = res.headers.get('location');
  expect(location).toBeTruthy();
  return new URL(location as string, 'http://localhost:3000');
}

async function signUpUserB(auth: Harness['auth']): Promise<{ userId: string; sessionCookie: string }> {
  const res = await post(auth, '/sign-up/email', {
    name: 'Main Owner',
    email: 'main@example.test',
    password: 'password1234',
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  const sessionCookie = cookiePairs(res).find((c) => c.startsWith('better-auth.session_token='));
  expect(sessionCookie).toBeTruthy();
  return { userId: body.user.id, sessionCookie: sessionCookie as string };
}

async function startLink(
  auth: Harness['auth'],
  sessionCookie: string,
): Promise<{ state: string; stateCookie: string }> {
  const res = await post(
    auth,
    '/oauth2/link',
    { providerId: 'eve', callbackURL: '/settings/characters', errorCallbackURL: '/settings/characters' },
    sessionCookie,
  );
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  const state = new URL(url).searchParams.get('state');
  expect(state).toBeTruthy();
  const stateCookie = cookiePairs(res).find((c) => c.startsWith('better-auth.state='));
  expect(stateCookie).toBeTruthy();
  return { state: state as string, stateCookie: stateCookie as string };
}

async function startSignIn(
  auth: Harness['auth'],
  body: Record<string, unknown>,
): Promise<{ state: string; stateCookie: string }> {
  const res = await post(auth, '/sign-in/oauth2', { providerId: 'eve', callbackURL: '/', ...body });
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  const state = new URL(url).searchParams.get('state');
  expect(state).toBeTruthy();
  const stateCookie = cookiePairs(res).find((c) => c.startsWith('better-auth.state='));
  expect(stateCookie).toBeTruthy();
  return { state: state as string, stateCookie: stateCookie as string };
}

function accountRow(db: Harness['db'], accountId: string): AccountRow {
  const row = db.account.find((a) => a.accountId === accountId);
  expect(row).toBeTruthy();
  return row as AccountRow;
}

describe('link-target rebind (Better Auth 1.6.x pipeline)', () => {
  it('(a) baseline: linking a character owned by another user is refused and writes no tokens', async () => {
    const { auth, db } = makeHarness({ rebindTo: null });
    const { sessionCookie } = await signUpUserB(auth);
    const { state, stateCookie } = await startLink(auth, sessionCookie);

    const res = await callback(auth, state, `${sessionCookie}; ${stateCookie}`);
    const target = redirectTarget(res);
    expect(target.pathname).toBe('/settings/characters');
    expect(target.searchParams.get('error')).toBe('account_already_linked_to_different_user');
    expect(accountRow(db, STRAY_CHARACTER)).toMatchObject({ userId: 'user-a', accessToken: 'old-at' });
  });

  it('(b) rebinding link.userId to the survivor inside getUserInfo takes the same-user relink path', async () => {
    const { auth, db } = makeHarness({ rebindTo: 'user-a' });
    const { sessionCookie } = await signUpUserB(auth);
    const { state, stateCookie } = await startLink(auth, sessionCookie);

    const res = await callback(auth, state, `${sessionCookie}; ${stateCookie}`);
    const target = redirectTarget(res);
    expect(target.pathname).toBe('/settings/characters');
    expect(target.searchParams.get('error')).toBeNull();

    expect(accountRow(db, STRAY_CHARACTER)).toMatchObject({
      id: 'acct-a',
      userId: 'user-a',
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      scope: 'scope-a',
    });
    expect(db.account.filter((a) => a.providerId === 'eve')).toHaveLength(1);
    expect(db.user.find((u) => u.id === 'user-a')?.name, 'updateUserInfoOnLink stays unset').toBe(
      'Stray Owner',
    );
  });

  it('(c) account.create.before fires on the link createAccount path with the plaintext token', async () => {
    const { auth, db, createBeforeCalls } = makeHarness({
      rebindTo: null,
      provenCharacter: FRESH_CHARACTER,
    });
    const { userId: userB, sessionCookie } = await signUpUserB(auth);
    const { state, stateCookie } = await startLink(auth, sessionCookie);

    const res = await callback(auth, state, `${sessionCookie}; ${stateCookie}`);
    expect(redirectTarget(res).searchParams.get('error')).toBeNull();
    expect(createBeforeCalls).toEqual([`${FRESH_CHARACTER}:new-at`]);
    expect(accountRow(db, FRESH_CHARACTER)).toMatchObject({
      userId: userB,
      ownerHash: OWNER_FROM_HOOK,
    });
  });

  it('(d) account.create.before fires on the sign-up createOAuthUser path with the plaintext token', async () => {
    const { auth, db, createBeforeCalls } = makeHarness({
      rebindTo: null,
      provenCharacter: FRESH_CHARACTER,
    });
    const { state, stateCookie } = await startSignIn(auth, {});

    const res = await callback(auth, state, stateCookie);
    expect(redirectTarget(res).searchParams.get('error')).toBeNull();
    expect(createBeforeCalls).toEqual([`${FRESH_CHARACTER}:new-at`]);
    const created = accountRow(db, FRESH_CHARACTER);
    expect(created.ownerHash).toBe(OWNER_FROM_HOOK);
    expect(db.session.some((s) => s.userId === created.userId)).toBe(true);
  });

  it('(e) single-use: replaying the callback dies at state parsing', async () => {
    const { auth, db } = makeHarness({ rebindTo: 'user-a' });
    const { sessionCookie } = await signUpUserB(auth);
    const { state, stateCookie } = await startLink(auth, sessionCookie);
    const cookies = `${sessionCookie}; ${stateCookie}`;

    const first = await callback(auth, state, cookies);
    expect(redirectTarget(first).searchParams.get('error')).toBeNull();

    const replay = await callback(auth, state, cookies);
    const error = redirectTarget(replay).searchParams.get('error');
    expect(error).toMatch(/^(state_mismatch|please_restart_the_process)$/);
    expect(accountRow(db, STRAY_CHARACTER).userId).toBe('user-a');
  });

  it('(f) sign-in carries no link: the existing owner signs in and nothing rebinds', async () => {
    const { auth, db } = makeHarness({ rebindTo: 'user-forged' });
    const { state, stateCookie } = await startSignIn(auth, {});

    const res = await callback(auth, state, stateCookie);
    expect(redirectTarget(res).searchParams.get('error')).toBeNull();
    expect(accountRow(db, STRAY_CHARACTER).userId).toBe('user-a');
    expect(db.session.some((s) => s.userId === 'user-a')).toBe(true);
  });

  it('(g) cookie binding: a callback without the state cookie is rejected before getUserInfo', async () => {
    const { auth, db } = makeHarness({ rebindTo: 'user-a' });
    const { sessionCookie } = await signUpUserB(auth);
    const { state } = await startLink(auth, sessionCookie);

    const res = await callback(auth, state, sessionCookie);
    const error = redirectTarget(res).searchParams.get('error');
    expect(error).toMatch(/^(state_mismatch|state_security_mismatch)$/);
    expect(accountRow(db, STRAY_CHARACTER).accessToken).toBe('old-at');
  });

  it('(h) a client body cannot smuggle a link into a sign-in state', async () => {
    const { auth, db } = makeHarness({ rebindTo: 'user-a' });
    const { state, stateCookie } = await startSignIn(auth, {
      additionalData: { link: { userId: 'forged-user', email: 'forged@eve.invalid' } },
    });

    const res = await callback(auth, state, stateCookie);
    expect(redirectTarget(res).searchParams.get('error')).toBeNull();
    expect(accountRow(db, STRAY_CHARACTER).userId).toBe('user-a');
    expect(db.session.some((s) => s.userId === 'user-a')).toBe(true);
  });
});
