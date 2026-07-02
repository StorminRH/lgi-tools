// The ACCOUNT.3 interception spike, kept as the permanent Better-Auth-bump
// regression pin. Absorb-on-proof pre-empts the generic-oauth callback's
// already-linked refusal from inside our own getUserInfo: parseState has
// already published the OAuth state (link.userId = the session user who
// initiated /oauth2/link) into Better Auth's request-scoped store, so
// getUserInfo can read it via getOAuthState() and move the stray account row
// onto the linking user BEFORE the callback's own lookup — which then sees a
// same-user row and completes as a normal relink (token update + success
// redirect). This file drives the REAL better-auth pipeline (memory adapter,
// stub provider, HTTP through auth.handler) and pins every property the absorb
// relies on: the refusal baseline, the pre-empt-becomes-relink conversion, the
// single-use state row, the sign-in/link discrimination, the state-cookie
// binding, and that a client body can never smuggle a link into the state.
// If a Better Auth upgrade changes any of these semantics, this file fails
// loudly — re-verify the absorb path before shipping that bump.
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
  createdAt: Date;
  updatedAt: Date;
};

type SessionRow = { userId: string };

const BASE = 'http://localhost:3000/api/auth';
const STRAY_CHARACTER = '111';

// A minimal real better-auth instance: user A owns the stray character's
// account row; emailAndPassword exists purely to mint user B's session; the
// stub provider skips the network (getToken/getUserInfo are app-supplied for
// EVE in production too). `absorb` toggles the getUserInfo pre-empt on/off so
// the baseline refusal and the absorb conversion are pinned side by side.
function makeHarness({ absorb }: { absorb: boolean }) {
  const now = new Date();
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
    account: { accountLinking: { allowDifferentEmails: true } },
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
              if (absorb) {
                try {
                  const state = (await getOAuthState()) as {
                    link?: { userId: string };
                  } | null;
                  const link = state?.link; // present ONLY on link flows
                  if (link) {
                    const row = db.account.find(
                      (a) => a.providerId === 'eve' && a.accountId === STRAY_CHARACTER,
                    );
                    if (row && row.userId !== link.userId) row.userId = link.userId;
                  }
                } catch {
                  // degrade to no-absorb — the refusal is the fallback
                }
              }
              return {
                id: STRAY_CHARACTER,
                name: 'Spike Pilot',
                email: `${STRAY_CHARACTER}@eve.invalid`,
                emailVerified: true,
              };
            },
          },
        ],
      }),
    ],
  });
  return { auth, db };
}

type Harness = ReturnType<typeof makeHarness>;

function cookiePairs(res: Response): string[] {
  return res.headers.getSetCookie().map((c) => c.split(';')[0]);
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
    { providerId: 'eve', callbackURL: '/characters', errorCallbackURL: '/characters' },
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

function strayRow(db: Harness['db']): AccountRow {
  const row = db.account.find((a) => a.accountId === STRAY_CHARACTER);
  expect(row).toBeTruthy();
  return row as AccountRow;
}

describe('absorb-on-proof interception (Better Auth 1.6.x pipeline)', () => {
  it('(a) baseline: linking a character owned by another user is refused', async () => {
    const { auth, db } = makeHarness({ absorb: false });
    const { sessionCookie } = await signUpUserB(auth);
    const { state, stateCookie } = await startLink(auth, sessionCookie);

    const res = await callback(auth, state, `${sessionCookie}; ${stateCookie}`);
    const target = redirectTarget(res);
    expect(target.pathname).toBe('/characters');
    expect(target.searchParams.get('error')).toBe('account_already_linked_to_different_user');
    expect(strayRow(db).userId).toBe('user-a');
  });

  it('(b) absorb: the getUserInfo pre-empt converts the refusal into a successful relink', async () => {
    const { auth, db } = makeHarness({ absorb: true });
    const { userId: userB, sessionCookie } = await signUpUserB(auth);
    const { state, stateCookie } = await startLink(auth, sessionCookie);

    const res = await callback(auth, state, `${sessionCookie}; ${stateCookie}`);
    const target = redirectTarget(res);
    expect(target.pathname).toBe('/characters');
    expect(target.searchParams.get('error')).toBeNull();

    const row = strayRow(db);
    expect(row.userId).toBe(userB); // moved onto the linking user
    expect(row.id).toBe('acct-a'); // the SAME row, not a duplicate
    expect(row.accessToken).toBe('new-at'); // relink token update landed on it
    expect(row.scope).toContain('scope-a');
  });

  it('(c) single-use: replaying the callback dies at state parsing', async () => {
    const { auth, db } = makeHarness({ absorb: true });
    const { userId: userB, sessionCookie } = await signUpUserB(auth);
    const { state, stateCookie } = await startLink(auth, sessionCookie);
    const cookies = `${sessionCookie}; ${stateCookie}`;

    const first = await callback(auth, state, cookies);
    expect(redirectTarget(first).searchParams.get('error')).toBeNull();

    const replay = await callback(auth, state, cookies);
    const error = redirectTarget(replay).searchParams.get('error');
    expect(error).toMatch(/^(state_mismatch|please_restart_the_process)$/);
    expect(strayRow(db).userId).toBe(userB); // replay changed nothing
  });

  it('(d) sign-in never absorbs: no link in state, the existing owner just signs in', async () => {
    const { auth, db } = makeHarness({ absorb: true });
    const { state, stateCookie } = await startSignIn(auth, {});

    const res = await callback(auth, state, stateCookie);
    const target = redirectTarget(res);
    expect(target.searchParams.get('error')).toBeNull();
    expect(strayRow(db).userId).toBe('user-a');
    expect(db.session.some((s) => s.userId === 'user-a')).toBe(true);
  });

  it('(e) cookie binding: a callback without the state cookie is rejected before any absorb', async () => {
    const { auth, db } = makeHarness({ absorb: true });
    const { sessionCookie } = await signUpUserB(auth);
    const { state } = await startLink(auth, sessionCookie);

    const res = await callback(auth, state, sessionCookie); // state cookie withheld
    const error = redirectTarget(res).searchParams.get('error');
    expect(error).toMatch(/^(state_mismatch|state_security_mismatch)$/);
    expect(strayRow(db).userId).toBe('user-a');
  });

  it('(f) a client body cannot smuggle a link into a sign-in state', async () => {
    const { auth, db } = makeHarness({ absorb: true });
    const { state, stateCookie } = await startSignIn(auth, {
      additionalData: { link: { userId: 'forged-user', email: 'forged@eve.invalid' } },
    });

    const res = await callback(auth, state, stateCookie);
    expect(redirectTarget(res).searchParams.get('error')).toBeNull();
    expect(strayRow(db).userId).toBe('user-a'); // the forged link never reached the state
    expect(db.session.some((s) => s.userId === 'user-a')).toBe(true);
  });
});
