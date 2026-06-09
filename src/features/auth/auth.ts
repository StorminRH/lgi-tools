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
import { customSession, genericOAuth } from 'better-auth/plugins';
import { and, eq } from 'drizzle-orm';
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
import { account, session, user, verification } from './schema';
import { syntheticEmail } from './synthetic-email';
import type { CharacterRole } from './types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
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
    schema: { user, session, account, verification },
  }),
  // Reuse the existing 32-byte key as the Better Auth secret when a dedicated
  // BETTER_AUTH_SECRET isn't set, so a local .env.local keeps working.
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
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
