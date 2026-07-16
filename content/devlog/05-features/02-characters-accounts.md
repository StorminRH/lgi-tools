## Characters & Accounts
<!-- updated: 2026-06-30 -->

Account work in LGI.tools is not just “add login.”

For a normal web app, the identity model is usually one human, one account, one session. EVE makes that more complicated. One human can own many characters. Each character can grant a different set of ESI scopes. A character can be sold to another EVE account. A corporation-level feature may need a linked character with the right in-game role. And once the site starts storing skill queues, jobs, assets, blueprints, preferences, and structures, unlinking a character is not the same thing as deleting all traces of that character’s data.

The first EVE login in [PR #10](https://github.com/StorminRH/lgi-tools/pull/10) was intentionally small. It proved the basics: start EVE SSO, verify the returned JWT, parse the character identity, upsert a `characters` row, and issue a session. That was the right move for a beta tool that only needed to know who was signed in. It also made an early decision that still holds up: because nothing was reading ESI yet, the first version discarded refresh tokens instead of storing long-lived access before the app had a real need for it.

That changed once live character tools became real. [PR #82](https://github.com/StorminRH/lgi-tools/pull/82) replaced the hand-rolled auth flow with Better Auth and turned the account model into the real spine of the app. The `user` row represents the human LGI.tools account. The `account` row represents a linked EVE character: provider `eve`, account ID equal to the EVE character ID. The old `characters` row stays as the per-character profile and telemetry anchor. Sessions belong to the user, and the active character is a field on the user row, not a separate login.<sup><a href="#code-account-schema">1</a></sup>

That distinction matters. Admin access is per user. A character profile is per character. EVE tokens are per linked character. The UI may show the active character’s portrait, but the account is the human who linked it. The session enrichment resolves that active character every time the app asks for the session, so the header and server gates read the same current identity instead of trusting whichever character happened to sign in last.<sup><a href="#code-account-auth-spine">2</a></sup>

EVE SSO still needed custom handling inside Better Auth. EVE does not provide a separate userinfo endpoint for this flow, so identity comes from the verified access-token JWT. The token exchange also needs CCP-friendly request shape: HTTP Basic client auth, PKCE verifier, and the outbound User-Agent. Better Auth owns the framework-level session and account flow, but LGI.tools still owns the EVE-specific edges: token exchange, JWT verification, scope list, owner-hash reconciliation, and character profile refresh.<sup><a href="#code-account-auth-spine">2</a></sup><sup><a href="#code-account-eve-sso">3</a></sup>

Token custody is where I stopped treating OAuth as a generic checkbox. A refresh token is a long-lived bearer credential for a pilot’s ESI access. The repo encrypts EVE access and refresh tokens before they reach Neon using AES-256-GCM under a dedicated `EVE_TOKEN_ENCRYPTION_KEY`, separate from the Better Auth session secret. Decryption failure means “this character must reconnect,” not “try forwarding the value anyway.” That is an important failure mode: tampered, legacy, or unreadable token material should never become an outbound EVE request.<sup><a href="#code-account-token-crypto">4</a></sup>

The vending path follows the same rule. Features do not read refresh tokens. The token service reads the encrypted account row, decrypts only inside that layer, returns a short-lived access token, and refreshes against EVE only when the stored token is near expiry. The compare-and-swap write is there because two live sync jobs can ask for the same character at the same time. A rotated refresh token must not be overwritten by a slower loser, and an `invalid_grant` from a raced stale token must not wrongly disconnect the pilot.<sup><a href="#code-account-token-service">5</a></sup>

The first real scope mistake came quickly. [PR #83](https://github.com/StorminRH/lgi-tools/pull/83) fixed a sign-in failure caused by asking EVE for a scope name that did not exist. The wrong value was only one namespace off, but EVE rejected the whole authorize request. That changed the rule for scopes: exact strings are not “copy.” They are an integration contract. The requested scope set now lives in one module, with comments explaining every read and the naming traps that have already hurt the project.<sup><a href="#code-account-eve-sso">3</a></sup>

[PR #156](https://github.com/StorminRH/lgi-tools/pull/156) made that scope policy stricter. The site asks for the read-only EVE scopes it actually uses and no write scopes. When features were added later, the scope list grew deliberately, with each scope tied to a shipped consumer. The access-health code is also per-feature capable: a missing scope should degrade the surface that needs it, not make the whole account look broken. The Characters page then shows what each linked character has actually granted, including legacy scopes that were granted earlier but are no longer requested.<sup><a href="#code-account-scopes">6</a></sup><sup><a href="#code-account-characters-page">7</a></sup>

That page is the user-facing version of the model. A signed-in pilot can link another character, switch the active one, reconnect one with missing access, see granted scopes, and unlink a character. The switch route is deliberately boring but security-critical: it never trusts the posted character ID and checks that the account row belongs to the signed-in user. The unlink route guards the last remaining character and repoints the active character if the removed one was active.<sup><a href="#code-account-characters-page">7</a></sup><sup><a href="#code-account-character-routes">8</a></sup>

[PR #85](https://github.com/StorminRH/lgi-tools/pull/85) is the reason that model works for alts instead of only for a single main. Each EVE character is a separate account row under the same user. Linking an alt does not overwrite the user’s display identity, and switching active character changes who the site acts as without changing who owns the LGI.tools account. [PR #86](https://github.com/StorminRH/lgi-tools/pull/86) added the admin recovery tools for the messy transition case: early standalone character accounts could be reassigned or force-unlinked without asking a pilot to solve an account-shape bug manually.<sup><a href="#code-account-linked-queries">9</a></sup>

The most EVE-specific identity fix was owner-hash binding. EVE’s JWT includes a character-owner hash that changes when a character transfers to another EVE account. Without using that claim, a sold character could potentially sign the new human into the old LGI.tools account because the character ID is the same. The reconcile path compares the JWT owner hash against the stored one before Better Auth completes the account lookup. A mismatch purges the prior owner’s credential tier and lets the new owner link fresh.<sup><a href="#code-account-owner-hash">10</a></sup>

That owner-hash work exposed the bigger cleanup problem. By the time the app had skills, jobs, owned blueprints, assets, online status, preferences, telemetry, and structures, there was no longer one obvious place to delete “a character’s data.” [PR #179](https://github.com/StorminRH/lgi-tools/pull/179) added the purge registry so every data-owning slice declares its own teardown. The orchestrator runs credential first, then regenerable caches, then durable app-authored data. That order is deliberate: kill the EVE link and tokens before anything else can re-sync, then clear mirrors, then remove durable user-owned records.<sup><a href="#code-account-purge-types">11</a></sup><sup><a href="#code-account-purge-register">12</a></sup>

The registry also has a build-time gate. It reflects the Drizzle schema, finds user-, character-, or owner-keyed tables, and fails if a table is neither claimed by a purge contributor nor explicitly retained with a reason. That is one of the more important rails in the repo because personal data coverage should not rely on remembering a checklist. If a future AI session adds a new per-character table, the build should ask where its deletion path lives before the feature ships.<sup><a href="#code-account-purge-gate">13</a></sup>

The current account-safety primitives build on that registry. A per-character purge revokes the EVE refresh token at CCP first, then runs the full purge, then either repoints the account to a surviving character or deletes the user if that was the last character. A full account nuke enumerates linked characters, revokes and purges each one, runs the user-level purge, and deletes the user row. The code re-enumerates during account deletion because a character linked concurrently should not be cascade-orphaned with surviving per-character caches.<sup><a href="#code-account-purge-entrypoints">14</a></sup>

So the account surface is not just a Characters page. It is the project’s identity boundary: user versus character, active character versus linked character, granted scope versus requested scope, access token versus refresh token, owner-intrinsic character data versus owner-authored data, unlink versus purge. Those distinctions are easy for AI to flatten. The repo’s job is to make them hard to flatten.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-account-schema" file="src/features/auth/schema.ts" lines="47-81,83-138" lang="ts" -->
```ts
// Better Auth core tables. `user` is the human/main-account row.
// `account` is the EVE link — providerId 'eve', accountId = the character id.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: characterRoleEnum('role').default('USER').notNull(),
  activeCharacterId: bigint('active_character_id', { mode: 'number' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    scope: text('scope'),
    ownerHash: text('owner_hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
  ],
);
```

<!-- uth:code id="code-account-auth-spine" file="src/features/auth/auth.ts" lines="39-77,143-193,197-208,236-249" lang="ts" -->
```ts
function encryptAccountTokens<T extends {
  providerId?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}>(data: T): T {
  if (data.providerId != null && data.providerId !== EVE_PROVIDER_ID) return data;
  const out: T = { ...data };
  if (typeof out.accessToken === 'string' && !out.accessToken.startsWith(CIPHERTEXT_PREFIX)) {
    out.accessToken = encryptToken(out.accessToken);
  }
  if (typeof out.refreshToken === 'string' && !out.refreshToken.startsWith(CIPHERTEXT_PREFIX)) {
    out.refreshToken = encryptToken(out.refreshToken);
  }
  return out;
}

genericOAuth({
  config: [{
    providerId: EVE_PROVIDER_ID,
    authorizationUrl: EVE_AUTHORIZE_URL,
    tokenUrl: EVE_TOKEN_URL,
    scopes: [...EVE_SCOPES],
    pkce: true,
    prompt: 'consent',
    getToken: async ({ code, codeVerifier }) => {
      const token = await exchangeCodeForToken({ code, codeVerifier: codeVerifier ?? '', clientId, clientSecret });
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        scopes: [...EVE_SCOPES],
      };
    },
    getUserInfo: async (tokens) => {
      const claims = await verifyEveJwt(tokens.accessToken);
      const character = claimsToCharacter(claims);
      await reconcileCharacterOwner(character.characterId, claims.owner);
      await upsertCharacterOnLogin(character);
      return { id: String(character.characterId), name: character.name, image: character.portraitUrl, email: syntheticEmail(character.characterId), emailVerified: true };
    },
  }],
});

customSession(async ({ user: u, session: s }) => {
  const active = await resolveActiveCharacter(u.id, u.activeCharacterId ?? null);
  const characterId = active?.characterId ?? null;
  return { user: u, session: s, characterId, name: active?.name ?? u.name, portraitUrl: active?.portraitUrl ?? u.image ?? '', isAdmin: computeIsAdmin(characterId, role) };
}, options);
```

<!-- uth:code id="code-account-eve-sso" file="src/features/auth/eve-sso.ts" lines="18-35,37-101,141-160" lang="ts" -->
```ts
export const EVE_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
export const EVE_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
export const EVE_REVOKE_URL = 'https://login.eveonline.com/v2/oauth/revoke';
export const EVE_AUTHORIZED_APPS_URL = 'https://developers.eveonline.com/authorized-apps';

// The exact scope set the site requests. Strict least privilege: read-only scopes
// tied to shipped features, with naming traps documented in the same place.
export const EVE_SCOPES = [
  'publicData',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
  'esi-characters.read_blueprints.v1',
  'esi-corporations.read_blueprints.v1',
  'esi-assets.read_assets.v1',
  'esi-assets.read_corporation_assets.v1',
  'esi-location.read_online.v1',
  'esi-corporations.read_structures.v1',
] as const;

function buildTokenRequestInit(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): RequestInit {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Host: 'login.eveonline.com',
      'User-Agent': OUTBOUND_USER_AGENT,
    },
    body: body.toString(),
  };
}
```

<!-- uth:code id="code-account-token-crypto" file="src/features/auth/token-crypto.ts" lines="3-13,18-24,28-39,42-63" lang="ts" -->
```ts
// Encryption at rest for EVE OAuth tokens. The access + refresh tokens live in
// the account row, but a refresh token is a long-lived bearer of a pilot's ESI
// access — it must never sit in the database as plaintext and must never leave Neon.

export const TOKEN_CRYPTO_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

function key(): Buffer {
  const raw = requireEnv('EVE_TOKEN_ENCRYPTION_KEY');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length !== KEY_BYTES) throw new Error('EVE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  return decoded;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_CRYPTO_VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptToken(value: string): string | null {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== TOKEN_CRYPTO_VERSION) return null;
  // authenticate + decrypt; return null for tamper/legacy/wrong key
}
```

<!-- uth:code id="code-account-token-service" file="src/features/auth/eve-token-service.ts" lines="3-19,95-122,124-168,170-228" lang="ts" -->
```ts
// Per-character ESI token custody. Reads stored tokens, vends a fresh short-lived
// access token, and re-encrypts + persists the rotated refresh token. The refresh
// token is decrypted, used, and re-encrypted entirely within this layer.

export async function revokeCharacterToken(characterId: number): Promise<void> {
  try {
    const row = await loadAccountRow(characterId);
    const refreshToken = row?.refreshToken ? decryptToken(row.refreshToken) : null;
    if (refreshToken === null) return;
    await revokeEveRefreshToken({ refreshToken, clientId: requireEnv('EVE_CLIENT_ID'), clientSecret: requireEnv('EVE_CLIENT_SECRET') });
  } catch (err) {
    console.error('[eve-token] revoke failed', err);
  }
}

export async function getFreshAccessTokenForCharacter(
  characterId: number,
): Promise<FreshTokenResult> {
  const row = await loadAccountRow(characterId);
  if (!row) return { kind: 'not_found' };

  const refreshCiphertext = row.refreshToken;
  const refreshToken = refreshCiphertext ? decryptToken(refreshCiphertext) : null;
  if (refreshToken === null || refreshCiphertext === null) return { kind: 'reauth_required' };

  if (
    row.accessToken &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - Date.now() > ACCESS_TOKEN_REFRESH_SKEW_MS
  ) {
    const cached = decryptToken(row.accessToken);
    if (cached !== null) {
      return { kind: 'ok', accessToken: cached, expiresAt: row.accessTokenExpiresAt, characterId, scopes };
    }
  }

  const result = await refreshEveToken({ refreshToken, clientId, clientSecret });
  if (result.kind === 'retryable') return { kind: 'upstream_error' };

  if (result.kind === 'dead') {
    const nulled = await db.update(account).set({ accessToken: null, refreshToken: null }).where(
      and(eq(account.id, row.id), eq(account.refreshToken, refreshCiphertext)),
    );
    if (nulled.length === 0) return reflectStoredToken(characterId);
    return { kind: 'reauth_required' };
  }

  const written = await db.update(account).set({
    accessToken: encryptToken(result.access_token),
    refreshToken: encryptToken(result.refresh_token),
    accessTokenExpiresAt: expiresAt,
  }).where(and(eq(account.id, row.id), or(eq(account.refreshToken, refreshCiphertext), isNull(account.refreshToken))));

  if (written.length === 0) return reflectStoredToken(characterId);
  return { kind: 'ok', accessToken: result.access_token, expiresAt, characterId, scopes };
}
```

<!-- uth:code id="code-account-scopes" file="src/features/auth/scope-health.ts" lines="3-19,33-81,83-132" lang="ts" -->
```ts
// Scope health. Given what's stored on a linked account row and a set of REQUIRED
// scopes, decide whether the pilot must reconnect to restore that access.

export function deriveScopeHealth(
  { scope, hasRefreshToken }: { scope: string | null | undefined; hasRefreshToken: boolean },
  required: readonly string[],
): CharacterHealth {
  const granted = parseScopes(scope);
  const missingScopes = required.filter((s) => !granted.has(s));
  return {
    needsReconnect: !hasRefreshToken || missingScopes.length > 0,
    missingScopes,
  };
}

export function deriveCharacterHealth(input: {
  scope: string | null | undefined;
  hasRefreshToken: boolean;
}): CharacterHealth {
  return deriveScopeHealth(input, EVE_SCOPES);
}

// List what a character has ACTUALLY granted, not the ideal set. Active scopes
// come first; legacy scopes follow so old broad grants are visible.
export function listGrantedScopes(scope: string | null | undefined): GrantedScope[] {
  const granted = tokenizeScopes(scope);
  const grantedSet = new Set(granted);
  const activeSet = new Set<string>(EVE_SCOPES);
  const active = EVE_SCOPES.filter((id) => grantedSet.has(id)).map((id) => describeScope(id, 'active'));
  const legacy = granted.filter((id) => !activeSet.has(id)).map((id) => describeScope(id, 'legacy'));
  return [...active, ...legacy];
}
```

<!-- uth:code id="code-account-characters-page" file="src/app/characters/page.tsx" lines="44-64,95-126,131-147,167-203" lang="tsx" -->
```tsx
function CharacterRow({ character, isActive, isOnlyCharacter }: {
  character: LinkedCharacter;
  isActive: boolean;
  isOnlyCharacter: boolean;
}) {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  const scopes = listGrantedScopes(character.scope);

  return (
    <div className="border-t border-border-soft">
      <EntityRow
        name={character.name}
        chips={<><Pill tone="neutral">ID {character.characterId}</Pill>{isActive ? <Chip tone="green">Active</Chip> : null}</>}
        trailing={
          <>
            {health.needsReconnect ? <LinkCharacterButton label="Reconnect" emphasis="reconnect" /> : null}
            {isActive ? null : <SwitchCharacterForm characterId={character.characterId} />}
            <UnlinkCharacterForm characterId={character.characterId} disabled={isOnlyCharacter} />
          </>
        }
      />
      {scopes.length > 0 ? <GrantedScopesList scopes={scopes} /> : null}
    </div>
  );
}

async function CharactersContent({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/?auth_error=login_required');

  const [{ error: rawError }, characters] = await Promise.all([
    searchParams,
    listLinkedCharacters(session.user.id),
  ]);

  return (
    <Card>
      <SectionHeader label="Your characters" hint={`${characters.length} linked`} />
      {characters.map((character) => (
        <CharacterRow
          key={character.characterId}
          character={character}
          isActive={character.characterId === session.characterId}
          isOnlyCharacter={characters.length <= 1}
        />
      ))}
      <LinkCharacterButton label="Link another character" />
      <a href={EVE_AUTHORIZED_APPS_URL}>EVE authorized apps</a>
    </Card>
  );
}
```

<!-- uth:code id="code-account-character-routes" file="src/app/api/account/active-character/route.ts, src/app/api/account/characters/unlink/route.ts" lines="46-52,60-86" lang="ts" -->
```ts
// active-character route: never trust the posted id.
if (!(await accountBelongsToUser(session.user.id, characterId))) {
  return new Response('Character not linked to your account', { status: 400 });
}
await setActiveCharacter(session.user.id, characterId);

// unlink route: clean errors before Better Auth's backstop, then repoint active.
const linked = await listLinkedCharacters(session.user.id);
if (!linked.some((c) => c.characterId === characterId)) {
  return redirectWithError(request, 'not_linked');
}
if (linked.length <= 1) {
  return redirectWithError(request, 'last_character');
}

await auth.api.unlinkAccount({
  body: { providerId: EVE_PROVIDER_ID, accountId: String(characterId) },
  headers: h,
});

const activeCharacterId = await getStoredActiveCharacterId(session.user.id);
if (activeCharacterId === characterId) {
  await repointActiveToOldest(session.user.id);
}
```

<!-- uth:code id="code-account-linked-queries" file="src/features/auth/linked-characters.ts, src/features/auth/admin-users.ts" lines="97-118,175-184,200-248" lang="ts" -->
```ts
// Multi-character platform. A user can link several EVE characters; these helpers
// list them, resolve the active one, and move the active pointer.

export async function listLinkedCharacters(userId: string): Promise<LinkedCharacter[]> {
  const rows = await db.select({ accountId: account.accountId, scope: account.scope, refreshToken: account.refreshToken, createdAt: account.createdAt, name: characters.name, portraitUrl: characters.portraitUrl })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  return rows.map((r) => ({
    characterId: Number(r.accountId),
    name: r.name ?? `Character ${r.accountId}`,
    portraitUrl: r.portraitUrl ?? portraitUrl(Number(r.accountId)),
    scope: r.scope,
    hasRefreshToken: r.refreshToken != null && r.refreshToken.length > 0,
    linkedAt: r.createdAt,
  }));
}

export async function accountBelongsToUser(userId: string, characterId: number): Promise<boolean> {
  const [row] = await db.select({ id: account.id })
    .from(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .limit(1);
  return row != null;
}

export async function deleteLinkedCharacter(userId: string, characterId: number): Promise<boolean> {
  const deleted = await db.delete(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .returning({ id: account.id });
  return deleted.length > 0;
}

export async function reassignCharacter({ characterId, fromUserId, toUserId }: ReassignInput) {
  await db.update(account).set({ userId: toUserId, updatedAt: new Date() }).where(
    and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId)), eq(account.userId, fromUserId)),
  );
  // delete empty source user or repoint its active character
}
```

<!-- uth:code id="code-account-owner-hash" file="src/features/auth/owner-transfer.ts" lines="83-159" lang="ts" -->
```ts
// Owner-hash identity binding. EVE's JWT owner claim is stable for one human
// and changes only when the character is transferred to a different EVE account.

export async function reconcileCharacterOwner(
  characterId: number,
  jwtOwnerHash: string | null | undefined,
): Promise<void> {
  if (!jwtOwnerHash) return;

  const [row] = await db.select({ userId: account.userId, ownerHash: account.ownerHash })
    .from(account)
    .where(and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))))
    .limit(1);

  if (!row) return;
  const action = classifyOwnerReconcile(row.ownerHash, jwtOwnerHash);
  if (action === 'noop') return;
  if (action === 'backfill') {
    await db.update(account).set({ ownerHash: jwtOwnerHash, updatedAt: new Date() });
    return;
  }

  await purgeTransferredCharacter(row.userId, characterId);
}

export async function purgeTransferredCharacter(priorUserId: string, characterId: number): Promise<void> {
  await runPurge({ kind: 'character', userId: priorUserId, characterId }, ['credential']);
  await reconcileAfterCharacterRemoval(priorUserId, characterId);
}
```

<!-- uth:code id="code-account-purge-types" file="src/purge/types.ts" lines="3-20,22-52" lang="ts" -->
```ts
// Each user/character-keyed slice declares one contributor. It claims its tables
// and provides the teardown the orchestrator runs.

export type PurgeTier = 'credential' | 'cache' | 'durable';

export type PurgeSubject =
  | { readonly kind: 'character'; readonly userId: string; readonly characterId: number }
  | { readonly kind: 'user'; readonly userId: string };

export interface RetainedTable {
  readonly table: PgTable;
  readonly reason: string;
}

export interface PurgeContributor {
  readonly name: string;
  readonly tier: PurgeTier;
  readonly claims: readonly PgTable[];
  readonly retained?: readonly RetainedTable[];
  purgeCharacter?(subject: PurgeCharacterSubject): Promise<void>;
  purgeUser?(subject: PurgeUserSubject): Promise<void>;
}
```

<!-- uth:code id="code-account-purge-register" file="src/purge/orchestrator.ts, src/purge/register-all.ts" lines="3-33,23-33" lang="ts" -->
```ts
const TIER_ORDER: readonly PurgeTier[] = ['credential', 'cache', 'durable'];

export async function runPurge(
  subject: PurgeSubject,
  tiers: readonly PurgeTier[] = TIER_ORDER,
): Promise<void> {
  for (const tier of TIER_ORDER) {
    if (tiers.includes(tier)) await runTier(tier, subject);
  }
}

export const PURGE_CONTRIBUTORS: readonly PurgeContributor[] = [
  authPurgeContributor,
  skillQueuePurgeContributor,
  industryJobsPurgeContributor,
  ownedAssetsPurgeContributor,
  ownedBlueprintsPurgeContributor,
  onlineStatusPurgeContributor,
  telemetryPurgeContributor,
  preferencesPurgeContributor,
  customStructuresPurgeContributor,
];
```

<!-- uth:code id="code-account-purge-gate" file="src/purge/registry.test.ts" lines="3-13,28-67,76-95" lang="ts" -->
```ts
// THE PURGE GATE — DB-free, fail-closed. Reflects the Drizzle schema, finds every
// user/character/owner-keyed table, and asserts each is claimed by a purge
// contributor OR declared retained. A new user-data table without a contributor
// fails this test.

const flagged = tables.filter(isUserDataTable).map(tableName);
const claimed = new Set(PURGE_CONTRIBUTORS.flatMap((c) => c.claims.map(tableName)));
const retained = new Set(
  PURGE_CONTRIBUTORS.flatMap((c) => (c.retained ?? []).map((r) => tableName(r.table))),
);

it('every user/character/owner-keyed table is claimed or declared-retained', () => {
  const unclaimed = findUnclaimed(flagged, claimed, retained);
  expect(
    unclaimed,
    `Unclaimed user-data table(s): ${unclaimed.join(', ')}. Declare a purge contributor ` +
      `in the owning slice (claim the table), or a retained entry with a reason.`,
  ).toEqual([]);
});

it('corp_access_audit is declared-retained', () => {
  expect(retained.has('corp_access_audit')).toBe(true);
});
```

<!-- uth:code id="code-account-purge-entrypoints" file="src/features/auth/account-purge.ts" lines="88-95,97-137" lang="ts" -->
```ts
export async function purgeOwnCharacter(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  await revokeCharacterToken(characterId);
  await runPurge({ kind: 'character', userId, characterId });
  return reconcileAfterCharacterRemoval(userId, characterId);
}

export async function nukeAccount(userId: string): Promise<void> {
  let linked = await eveAccountIdsFor(userId);
  while (linked.length > 0) {
    for (const characterId of linked) {
      await revokeCharacterToken(characterId);
      await runPurge({ kind: 'character', userId, characterId });
    }
    linked = await eveAccountIdsFor(userId);
  }

  await runPurge({ kind: 'user', userId });
  await db.delete(user).where(eq(user.id, userId));
}
```
<!-- uth:code-excerpts:end -->
