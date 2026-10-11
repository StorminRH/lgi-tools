/**
 * An EVE sign-in must never land in an account its character was unlinked or
 * sold out of. These cases drive the real auth instance through this
 * catch-all route and the real Settings unlink route against a disposable
 * Postgres schema. Only the network edges are stubbed: EVE's token exchange
 * and JWT check (the access token is an unsigned JWT whose payload names the
 * character and owner hash each sign-in picks), after(), request headers,
 * telemetry, rate limits, the Convex and ESI side effects, and outbound fetch.
 */
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness, seedUser } from '@/db/__tests__/support/db-test-harness';
import { account, session, user } from '@/db/auth-schema';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { accountMatch } from '@/platform/auth/eve-account-shared';
import { syntheticEmail, unlinkedEmail } from '@/platform/auth/synthetic-email';

const ORIGIN = 'http://localhost:3000';
const SELLER = 'owner-hash-seller';
const BUYER = 'owner-hash-buyer';
const MAIN = 90_300_001;
const ALT = 90_300_002;
const OTHER = 90_300_003;

const sso = vi.hoisted(() => {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const decode = (value: string): unknown => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  let issued = 0;
  return {
    /** The authorization code EVE hands back, carrying the identity its token will claim. */
    code: (characterId: number, owner: string): string => encode({ characterId, owner }),
    token(code: string) {
      const { characterId, owner } = decode(code) as { characterId: number; owner: string };
      issued += 1;
      const claims = {
        sub: `CHARACTER:EVE:${characterId}`,
        name: `Pilot ${characterId}`,
        owner,
        scp: ['publicData'],
        iss: 'https://login.eveonline.com',
        aud: ['sign-in-after-unlink-client', 'EVE Online'],
        exp: Math.floor(Date.now() / 1000) + 1200,
      };
      return {
        access_token: `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.unsigned`,
        refresh_token: `refresh-${characterId}-${issued}`,
        token_type: 'Bearer',
        expires_in: 1200,
      };
    },
    claims: (accessToken: string) =>
      decode(accessToken.split('.')[1] ?? '') as { sub: string; name: string; owner?: string },
  };
});

const requestScope = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}));

vi.mock('next/headers', () => ({
  headers: async () => requestScope.headers,
}));

vi.mock('@/platform/auth/eve-sso', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/auth/eve-sso')>()),
  exchangeCodeForToken: async ({ code }: { code: string }) => sso.token(code),
  verifyEveJwt: async (accessToken: string) => sso.claims(accessToken),
  revokeEveRefreshToken: async () => ({ ok: true }),
}));

vi.mock('@/data/telemetry/log', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/telemetry/log')>()),
  logUsageEvent: async () => {},
}));

vi.mock('@/data/telemetry/capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/telemetry/capability')>()),
  recordCapabilityOutcome: () => {},
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: async () => ({ ok: true as const }),
}));

vi.mock('@/composition/map-access-identity', () => ({
  identityProjectionRunners: {
    runBeforeUserDelete: async () => {},
    runBeforeCharacterUnlink: async () => [],
    runAfterFailedCharacterUnlink: async () => {},
    runAfterCharacterUnlink: async () => {},
    runAfterCharacterLinkChanged: async () => {},
  },
}));

vi.mock('@/composition/map-affiliation-access', () => ({
  reconcileAffiliationAccess: async () => ({ processed: 0, failed: 0 }),
  reconcileAffiliationAccessOnVisit: async () => ({ processed: 0, failed: 0 }),
  deliverCapturedMapAccessChanges: async () => ({ processed: 0, failed: 0 }),
  refreshAffiliationsAndReconcile: async () => {},
}));

vi.mock('@/composition/character-authorization', () => ({
  checkUserCharacterAuthorizations: async () => {},
}));

vi.mock('@/lib/convex-http-door', () => ({
  postConvexHttpDoor: async () => {
    throw new Error('sign-in-after-unlink: Convex is out of reach');
  },
}));

const harness = await createDbTestHarness({
  schema: 'test_auth_sign_in_after_unlink',
  tables: [
    'user',
    'account',
    'session',
    'verification',
    'jwks',
    'characters',
    'pending_deletions',
    'maps',
    'map_access',
    'map_blocks',
    'map_block_accounts',
    'map_access_changes',
  ],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'session', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  env: {
    BETTER_AUTH_SECRET: 'sign-in-after-unlink-secret-at-least-32-characters',
    BETTER_AUTH_URL: ORIGIN,
    EVE_CLIENT_ID: 'sign-in-after-unlink-client',
    EVE_CLIENT_SECRET: 'sign-in-after-unlink-client-secret',
    EVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    SUPERADMIN_CHARACTER_ID: '1',
  },
  resetBetweenTests: 'delete',
});

let authRoute: typeof import('./route');
let unlinkRoute: typeof import('@/app/api/account/characters/unlink/route');
let auth: (typeof import('@/composition/auth'))['auth'];

// Registered after the harness hooks, so env and the DB proxy are steered
// before '@/composition/auth' builds the auth instance at import time.
beforeAll(async () => {
  if (!harness.reachable) return;
  vi.stubGlobal('fetch', async (input: unknown) => {
    throw new Error(`sign-in-after-unlink: outbound fetch to ${input instanceof Request ? input.url : String(input)}`);
  });
  authRoute = await import('./route');
  unlinkRoute = await import('@/app/api/account/characters/unlink/route');
  ({ auth } = await import('@/composition/auth'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** One browser's cookie jar, fed by Set-Cookie. A new Browser is a signed-out visitor. */
class Browser {
  private readonly jar = new Map<string, string>();

  cookie(): string {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  absorb(res: Response): void {
    for (const header of res.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';');
      const split = pair.indexOf('=');
      if (split <= 0) continue;
      const name = pair.slice(0, split).trim();
      const value = pair.slice(split + 1).trim();
      const expired = value === '' || attributes.some((attribute) => {
        const [key = '', setting = ''] = attribute.split('=').map((part) => part.trim());
        return (/^max-age$/i.test(key) && Number(setting) <= 0)
          || (/^expires$/i.test(key) && Date.parse(setting) <= Date.now());
      });
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
}

async function authPost(browser: Browser, path: string, body: unknown): Promise<Response> {
  const cookie = browser.cookie();
  const res = await authRoute.POST(new Request(`${ORIGIN}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
  browser.absorb(res);
  return res;
}

async function authGet(browser: Browser, pathAndQuery: string): Promise<Response> {
  const cookie = browser.cookie();
  const res = await authRoute.GET(new Request(`${ORIGIN}/api/auth${pathAndQuery}`, {
    headers: cookie ? { cookie } : {},
  }));
  browser.absorb(res);
  return res;
}

/** Starts at Better Auth, then comes back from EVE to its callback as `characterId`. */
async function eveRoundTrip(
  browser: Browser,
  start: string,
  urls: { callbackURL: string; errorCallbackURL: string },
  characterId: number,
  owner: string,
): Promise<Response> {
  const started = await authPost(browser, start, { providerId: 'eve', ...urls });
  expect(started.status).toBe(200);
  const state = new URL(((await started.json()) as { url: string }).url).searchParams.get('state');
  expect(state).toBeTruthy();
  return authGet(browser, `/oauth2/callback/eve?code=${sso.code(characterId, owner)}&state=${encodeURIComponent(state ?? '')}`);
}

/** A no-session sign-in, with the URLs startEveSignIn sends. */
function signIn(browser: Browser, characterId: number, owner = SELLER): Promise<Response> {
  return eveRoundTrip(browser, '/sign-in/oauth2', { callbackURL: '/', errorCallbackURL: '/' }, characterId, owner);
}

/** Settings → Characters "add character", with the URLs startCharacterLink sends. */
function addCharacter(browser: Browser, characterId: number, owner = SELLER): Promise<Response> {
  const urls = { callbackURL: '/settings/characters', errorCallbackURL: '/settings/characters' };
  return eveRoundTrip(browser, '/oauth2/link', urls, characterId, owner);
}

async function unlinkInSettings(browser: Browser, characterId: number): Promise<Response> {
  const request = new NextRequest(`${ORIGIN}/api/account/characters/unlink`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, cookie: browser.cookie() },
    body: new URLSearchParams({ characterId: String(characterId) }),
  });
  requestScope.headers = new Headers(request.headers);
  try {
    return await unlinkRoute.POST(request);
  } finally {
    requestScope.headers = new Headers();
  }
}

function expectRedirect(res: Response, status: 302 | 303, path: string, error: string | null = null): void {
  expect(res.status).toBe(status);
  const location = new URL(res.headers.get('location') ?? '', ORIGIN);
  expect(location.pathname).toBe(path);
  expect(location.searchParams.get('error')).toBe(error);
}

async function signedInUserId(browser: Browser): Promise<string | null> {
  const cookie = browser.cookie();
  if (!cookie) return null;
  return (await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id ?? null;
}

async function ownerOf(characterId: number): Promise<string | null> {
  const [row] = await harness.db.select({ userId: account.userId }).from(account).where(accountMatch(characterId));
  return row?.userId ?? null;
}

async function emailOf(userId: string): Promise<string | null> {
  const [row] = await harness.db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  return row?.email ?? null;
}

/** Account A: signed up as MAIN, then ALT added in Settings. */
async function accountWithAlt(): Promise<{ browser: Browser; userId: string }> {
  const browser = new Browser();
  expectRedirect(await signIn(browser, MAIN), 302, '/');
  const userId = await signedInUserId(browser);
  expect(userId).not.toBeNull();
  expectRedirect(await addCharacter(browser, ALT), 302, '/settings/characters');
  expect(await ownerOf(ALT)).toBe(userId);
  expect(await emailOf(userId!)).toBe(syntheticEmail(MAIN));
  return { browser, userId: userId! };
}

/** A new visitor signs in as `characterId` and must land in a brand-new account that owns it. */
async function expectNewAccount(characterId: number, owner: string, previousUserId: string): Promise<void> {
  const visitor = new Browser();
  expectRedirect(await signIn(visitor, characterId, owner), 302, '/');
  const signedIn = await signedInUserId(visitor);
  expect(signedIn).not.toBeNull();
  expect(signedIn).not.toBe(previousUserId);
  expect(await ownerOf(characterId)).toBe(signedIn);
}

/** Fails every write to a user row, as a database outage during the sign-in's email repair would. */
async function refuseUserWrites(): Promise<() => Promise<void>> {
  await harness.sql.unsafe(`
    CREATE FUNCTION refuse_user_write() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'user rows are read-only in this test'; END $$
  `);
  await harness.sql.unsafe('CREATE TRIGGER refuse_user_write BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION refuse_user_write()');
  return async () => {
    await harness.sql.unsafe('DROP TRIGGER refuse_user_write ON "user"');
    await harness.sql.unsafe('DROP FUNCTION refuse_user_write()');
  };
}

async function snapshot() {
  return {
    users: await harness.db.select().from(user).orderBy(user.id),
    accounts: await harness.db
      .select({ userId: account.userId, accountId: account.accountId })
      .from(account)
      .orderBy(account.accountId),
    sessions: await harness.db.select({ id: session.id }).from(session).orderBy(session.id),
  };
}

describe.skipIf(!harness.reachable)('EVE sign-in after an unlink or a sale (real auth, real Postgres)', () => {
  it.each([
    { who: 'its owner', owner: SELLER },
    { who: 'a buyer', owner: BUYER },
  ])('gives a character unlinked in Settings a new account when $who signs in as it', async ({ owner }) => {
    const a = await accountWithAlt();
    expectRedirect(await unlinkInSettings(a.browser, MAIN), 303, '/settings/characters');
    expect(await emailOf(a.userId)).toBe(syntheticEmail(ALT));

    await expectNewAccount(MAIN, owner, a.userId);
    expect(await ownerOf(ALT)).toBe(a.userId);
  });

  it('repairs an email older code left naming the character, then gives the visitor a new account', async () => {
    const a = await accountWithAlt();
    // Older code deleted the link and left the email naming the character.
    await harness.db.delete(account).where(accountMatch(MAIN));

    await expectNewAccount(MAIN, BUYER, a.userId);
    expect(await emailOf(a.userId)).toBe(syntheticEmail(ALT));
    expect(await ownerOf(ALT)).toBe(a.userId);
  });

  it('refuses the sign-in, never linking it by email, when that repair cannot run', async () => {
    const a = await accountWithAlt();
    await harness.db.delete(account).where(accountMatch(MAIN));
    const before = await snapshot();

    const repairFailure = silenceConsolePrefixes('error', ['[auth] stale synthetic email repair failed']);
    const allowUserWrites = await refuseUserWrites();
    try {
      const visitor = new Browser();
      expectRedirect(await signIn(visitor, MAIN, BUYER), 302, '/', 'account_not_linked');
      expect(await signedInUserId(visitor)).toBeNull();
      expect(repairFailure).toHaveBeenCalledWith('[auth] stale synthetic email repair failed', expect.any(Error));
    } finally {
      await allowUserWrites();
      repairFailure.mockRestore();
    }
    expect(await ownerOf(MAIN)).toBeNull();
    expect(await snapshot()).toEqual(before);
    expect(await emailOf(a.userId)).toBe(syntheticEmail(MAIN));
  });

  it('signs a buyer of a character sold without unlinking into a new account', async () => {
    const a = await accountWithAlt();

    await expectNewAccount(MAIN, BUYER, a.userId);
    expect(await ownerOf(ALT)).toBe(a.userId);
    expect(await emailOf(a.userId)).toBe(syntheticEmail(ALT));
  });

  it('links a character in Settings to the signed-in account while an old email still names it', async () => {
    const a = await accountWithAlt();
    await harness.db.delete(account).where(accountMatch(MAIN));

    const buyer = new Browser();
    expectRedirect(await signIn(buyer, OTHER, BUYER), 302, '/');
    const buyerUserId = await signedInUserId(buyer);
    expect(buyerUserId).not.toBeNull();
    expect(buyerUserId).not.toBe(a.userId);
    expectRedirect(await addCharacter(buyer, MAIN, BUYER), 302, '/settings/characters');
    expect(await ownerOf(MAIN)).toBe(buyerUserId);
    expect(await emailOf(a.userId)).toBe(syntheticEmail(ALT));

    const later = new Browser();
    expectRedirect(await signIn(later, MAIN, BUYER), 302, '/');
    expect(await signedInUserId(later)).toBe(buyerUserId);
  });

  it('frees a linked character\'s address from a stale holder, so signing in as it still works', async () => {
    const a = await accountWithAlt();
    await seedUser(harness.db, 'stale-holder', { email: syntheticEmail(ALT) });

    const owner = new Browser();
    expectRedirect(await signIn(owner, ALT), 302, '/');
    expect(await signedInUserId(owner)).toBe(a.userId);
    expect(await emailOf(a.userId)).toBe(syntheticEmail(ALT));
    expect(await emailOf('stale-holder')).toBe(unlinkedEmail('stale-holder'));
  });

  it('refuses the raw unlink endpoint while the Settings route still unlinks', async () => {
    const a = await accountWithAlt();

    const raw = await authPost(a.browser, '/unlink-account', { providerId: 'eve', accountId: String(ALT) });
    expect(raw.status).toBe(404);
    expect(await ownerOf(ALT)).toBe(a.userId);

    expectRedirect(await unlinkInSettings(a.browser, ALT), 303, '/settings/characters');
    expect(await ownerOf(ALT)).toBeNull();
    expect(await ownerOf(MAIN)).toBe(a.userId);
  });
});
