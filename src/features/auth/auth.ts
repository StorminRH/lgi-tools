// The Better Auth server instance — the spine of identity/authz (3.4.1a).
//
// Replaces the hand-rolled JWE-cookie + EVE PKCE flow with Better Auth on the
// Drizzle/Neon adapter. EVE SSO is wired as a Generic OAuth provider; identity
// comes from the verified access-token JWT (EVE has no userinfo endpoint), and
// the user↔character link lives in the `account` row (providerId 'eve',
// accountId = the character id). Admin is per-user (`user.role`).
//
// Module import stays side-effect-free (no DB, no network at construction — the
// adapter wraps the lazy `db` Proxy). Env is read here but only consumed at
// request time, mirroring the old lazy-key pattern.

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, genericOAuth, jwt } from 'better-auth/plugins';
import { and, eq } from 'drizzle-orm';
import { logUsageEvent } from '@/data/telemetry/queries';
import { db } from '@/db';
import {
  EVE_AUTHORIZE_URL,
  EVE_PROVIDER_ID,
  EVE_SCOPES,
  EVE_TOKEN_URL,
  claimsToCharacter,
  exchangeCodeForToken,
  verifyEveJwt,
} from './eve-sso';
import { upsertCharacterOnLogin } from './queries';
import { account, jwks, session, user, verification } from './schema';
import { syntheticEmail } from './synthetic-email';
import { TOKEN_CRYPTO_VERSION, encryptToken } from './token-crypto';
import type { CharacterRole } from './types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const CIPHERTEXT_PREFIX = `${TOKEN_CRYPTO_VERSION}:`;

// Encrypt the EVE access/refresh tokens on an account write before it reaches
// the DB. The create hook receives the full account; the update hook (re-login)
// receives only the changed fields — so this only touches tokens that are
// actually present, and skips a value that's already ciphertext (idempotent: it
// must never double-encrypt). The dedicated key lives in token-crypto.ts.
function encryptAccountTokens<
  T extends {
    providerId?: string;
    accessToken?: string | null;
    refreshToken?: string | null;
  },
>(data: T): T {
  // EVE is the ONLY provider today, so every account token reaching this hook is
  // an EVE token encrypted under EVE_TOKEN_ENCRYPTION_KEY. We skip only a write
  // that positively declares a non-EVE provider. The update path (re-login) often
  // omits providerId — for an EVE-only app that correctly still encrypts, which is
  // required (a re-login token refresh must not land plaintext). FORWARD-COMPAT: if
  // a second OAuth provider is ever wired in, revisit this — its tokens would
  // otherwise be encrypted under the EVE key and become unreadable. The fix then is
  // a per-provider key (or a positive-EVE-only guard that still covers the
  // providerId-absent EVE update path), not flipping this guard naively.
  if (data.providerId != null && data.providerId !== EVE_PROVIDER_ID) return data;
  const out: T = { ...data };
  if (
    typeof out.accessToken === 'string' &&
    out.accessToken.length > 0 &&
    !out.accessToken.startsWith(CIPHERTEXT_PREFIX)
  ) {
    out.accessToken = encryptToken(out.accessToken);
  }
  if (
    typeof out.refreshToken === 'string' &&
    out.refreshToken.length > 0 &&
    !out.refreshToken.startsWith(CIPHERTEXT_PREFIX)
  ) {
    out.refreshToken = encryptToken(out.refreshToken);
  }
  return out;
}

// Resolve a user's active EVE character id. In 3.4.1a a user has exactly one
// linked character; alt selection arrives in 3.4.2. One indexed lookup on
// account(provider, user).
async function getActiveCharacterId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, EVE_PROVIDER_ID)))
    .limit(1);
  if (!row) return null;
  const id = Number(row.accountId);
  return Number.isFinite(id) ? id : null;
}

// Same authz rule as the legacy isAdmin(): env-driven superadmin (keyed on the
// active character id) OR the DB-driven per-user ADMIN role.
function computeIsAdmin(characterId: number | null, role: CharacterRole): boolean {
  if (role === 'ADMIN') return true;
  const superId = Number(process.env.SUPERADMIN_CHARACTER_ID);
  return characterId !== null && characterId === superId;
}

const options = {
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification, jwks },
  }),
  // Reuse the existing 32-byte key as the Better Auth secret when a dedicated
  // BETTER_AUTH_SECRET isn't set, so a local .env.local keeps working.
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Encrypt EVE tokens at rest (3.4.1b). They arrive PLAINTEXT here:
  // `account.encryptOAuthTokens` is intentionally NOT set — enabling it would
  // AES-encrypt the tokens under the Better Auth secret *before* this hook runs,
  // which would defeat decryption with our dedicated EVE_TOKEN_ENCRYPTION_KEY.
  // Do not turn it on.
  databaseHooks: {
    account: {
      create: { before: async (acct) => ({ data: encryptAccountTokens(acct) }) },
      update: { before: async (acct) => ({ data: encryptAccountTokens(acct) }) },
    },
  },
  user: {
    additionalFields: {
      // Per-user admin role; the actual column is the character_role enum with a
      // 'USER' default. input:false keeps it admin-controlled, never client-set.
      role: { type: 'string', required: false, defaultValue: 'USER', input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days — matches the retired JWE cookie lifetime
    // Sign the base session into the cookie so getSession validates it without a
    // DB read for the cache window. (customSession's enrichment is never cached,
    // so the active-character lookup still runs each call — see session.ts.)
    cookieCache: { enabled: true, maxAge: 300 },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: EVE_PROVIDER_ID,
          clientId: process.env.EVE_CLIENT_ID ?? '',
          clientSecret: process.env.EVE_CLIENT_SECRET ?? '',
          authorizationUrl: EVE_AUTHORIZE_URL,
          tokenUrl: EVE_TOKEN_URL,
          scopes: [...EVE_SCOPES],
          pkce: true,
          responseType: 'code',
          // Force EVE to re-prompt so existing publicData-only pilots consent to
          // the expanded skills/industry scopes on their next sign-in.
          prompt: 'consent',
          // Refresh name/portrait from EVE on every sign-in (parity with the old
          // upsert-on-login behaviour).
          overrideUserInfo: true,
          // EVE's token endpoint needs HTTP Basic auth, the PKCE verifier, AND a
          // descriptive User-Agent (CCP blocks UA-less traffic). We hand the whole
          // exchange to the proven helper rather than Better Auth's default fetch,
          // which can't set the User-Agent. Likewise getUserInfo runs EVE's JWKS
          // fetch through the helper's User-Agent. Do NOT drop these for the
          // default exchange. (`authentication` is moot while getToken is custom.)
          getToken: async ({ code, codeVerifier }) => {
            const token = await exchangeCodeForToken({
              code,
              codeVerifier: codeVerifier ?? '',
              clientId: requireEnv('EVE_CLIENT_ID'),
              clientSecret: requireEnv('EVE_CLIENT_SECRET'),
            });
            return {
              accessToken: token.access_token,
              refreshToken: token.refresh_token,
              accessTokenExpiresAt: token.expires_in
                ? new Date(Date.now() + token.expires_in * 1000)
                : undefined,
              scopes: [...EVE_SCOPES],
              raw: token as unknown as Record<string, unknown>,
            };
          },
          // EVE has no userinfo endpoint — identity is the verified JWT. The
          // returned `id` becomes account.accountId (the character id). Also
          // refresh the per-character profile row, exactly as the old callback.
          getUserInfo: async (tokens) => {
            if (!tokens.accessToken) return null;
            const claims = await verifyEveJwt(tokens.accessToken);
            const character = claimsToCharacter(claims);
            await upsertCharacterOnLogin(character);
            // Best-effort login telemetry — parity with the retired callback route
            // (the admin dashboard's "Logins" metric reads `auth_login`). Fire-and-
            // forget so it never blocks or fails sign-in.
            void logUsageEvent({
              action: 'auth_login',
              characterId: character.characterId,
              metadata: {},
            }).catch((err) => console.error('[auth] login telemetry write failed', err));
            return {
              id: String(character.characterId),
              name: character.name,
              image: character.portraitUrl,
              email: syntheticEmail(character.characterId),
              emailVerified: true,
            };
          },
        },
      ],
    }),
    // Convex-facing JWT (3.4.1b → consumed in 3.4.3). Signed with ES256 — NOT the
    // EdDSA default — because Convex's custom-JWT validation accepts only
    // RS256/ES256. The keypair is generated once and persisted in the `jwks`
    // table (static JWKS served at /api/auth/jwks), private key encrypted at rest
    // under the app secret. The subject defaults to the Better Auth user id so
    // Convex scopes to the user; the payload carries only the role — never any
    // EVE token material. `aud`/`iss` are the recorded contract for 3.4.3's
    // auth.config.ts (applicationID = 'convex', issuer = BETTER_AUTH_URL).
    jwt({
      jwks: { keyPairConfig: { alg: 'ES256' } },
      jwt: {
        issuer: process.env.BETTER_AUTH_URL,
        audience: 'convex',
        definePayload: ({ user: u }) => ({ role: (u.role as CharacterRole | undefined) ?? 'USER' }),
      },
      // Don't attach a signed JWT to every session response — Convex pulls one
      // deliberately from /api/auth/token. Recommended with OAuth provider plugins.
      disableSettingJwtHeader: true,
    }),
  ],
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...options,
  plugins: [
    ...options.plugins,
    // Enrich the session with the legacy-shaped identity fields + the per-user
    // isAdmin (computed server-side because superadmin reads an env var). Both
    // the server shim (session.ts) and the client (useSession) read these.
    customSession(async ({ user: u, session: s }) => {
      const role = (u.role as CharacterRole) ?? 'USER';
      const characterId = await getActiveCharacterId(u.id);
      return {
        user: u,
        session: s,
        characterId,
        name: u.name,
        portraitUrl: u.image ?? '',
        role,
        isAdmin: computeIsAdmin(characterId, role),
      };
    }, options),
  ],
});
