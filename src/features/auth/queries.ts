import { and, asc, eq, gt, ilike, isNull, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { runPurge } from '@/purge/orchestrator';
import type { AffiliationRow } from './affiliation-source';
import { EVE_PROVIDER_ID, portraitUrl } from './eve-sso';
import { revokeCharacterToken } from './eve-token-service';
import { AFFILIATION_TTL_MS, type CachedAffiliation } from './membership';
import { classifyOwnerReconcile } from './owner-reconcile';
import { account, characters, corpAccessAudit, session, user } from './schema';
import { syntheticEmail } from './synthetic-email';
import type { Character, CharacterRole } from './types';

interface UpsertInput {
  characterId: number;
  name: string;
  portraitUrl: string;
}

// Insert on first login, update name/portrait/lastLoginAt on every subsequent login.
// `role` and `preferences` are deliberately absent from the conflict set: they're
// owned by the admin/preferences UIs once written, and must survive re-logins.
export async function upsertCharacterOnLogin(input: UpsertInput): Promise<Character> {
  const now = new Date();
  const [row] = await db
    .insert(characters)
    .values({
      characterId: input.characterId,
      name: input.name,
      portraitUrl: input.portraitUrl,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: characters.characterId,
      set: {
        name: input.name,
        portraitUrl: input.portraitUrl,
        lastLoginAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return row as Character;
}

// Admin-dashboard row: a user (the unit admin is granted on) joined to its
// linked EVE character's display fields. characterId is null only if a user has
// no EVE account, which shouldn't happen for a real pilot.
export interface AdminUser {
  userId: string;
  characterId: number | null;
  name: string;
  portraitUrl: string;
  role: CharacterRole;
}

const adminUserColumns = {
  userId: user.id,
  name: user.name,
  portraitUrl: user.image,
  role: user.role,
  characterId: account.accountId,
};

function toAdminUser(row: {
  userId: string;
  name: string;
  portraitUrl: string | null;
  role: CharacterRole;
  characterId: string | null;
}): AdminUser {
  const parsed = row.characterId != null ? Number(row.characterId) : null;
  return {
    userId: row.userId,
    name: row.name,
    portraitUrl: row.portraitUrl ?? '',
    role: row.role,
    characterId: parsed !== null && Number.isFinite(parsed) ? parsed : null,
  };
}

// Join the user to exactly ONE linked EVE account — their OLDEST — so a user who
// has linked multiple characters (3.4.2) yields a single admin-list row instead
// of one row per character. The NOT EXISTS keeps only the account with no earlier
// sibling for the same user (created_at, id as the tiebreak). This also makes
// getUserById's single-account pick deterministic. Oldest-first matches the
// session resolver's fallback. getUserByCharacterId is unaffected — it queries
// one specific character, not the fan-out join.
function oldestEveAccountJoin() {
  const older = alias(account, 'older_eve_account');
  return and(
    eq(account.userId, user.id),
    eq(account.providerId, EVE_PROVIDER_ID),
    notExists(
      db
        .select({ one: sql`1` })
        .from(older)
        .where(
          and(
            eq(older.userId, user.id),
            eq(older.providerId, EVE_PROVIDER_ID),
            or(
              lt(older.createdAt, account.createdAt),
              and(eq(older.createdAt, account.createdAt), lt(older.id, account.id)),
            ),
          ),
        ),
    ),
  );
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, oldestEveAccountJoin())
    .where(eq(user.role, 'ADMIN'))
    .orderBy(asc(user.name));

  return rows.map(toAdminUser);
}

export async function getUserById(userId: string): Promise<AdminUser | null> {
  const [row] = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, oldestEveAccountJoin())
    .where(eq(user.id, userId))
    .limit(1);

  return row ? toAdminUser(row) : null;
}

// Resolve the user that owns a given EVE character id — used to map the env
// superadmin (a character id) onto the per-user model for the admin list.
export async function getUserByCharacterId(characterId: number): Promise<AdminUser | null> {
  const [row] = await db
    .select(adminUserColumns)
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))))
    .limit(1);

  return row ? toAdminUser(row) : null;
}

// Cap on rows the admin name search displays. A 1-char query matches a large
// fraction of the table, which only grows; bound the display and let the
// dashboard hint when there's more. Exported so the UI can show "showing first N".
export const CHARACTER_SEARCH_LIMIT = 50;

// Substring ILIKE search over a user's display name (their linked character's
// name). Empty/whitespace-only queries short-circuit to [] so the dashboard's
// empty-q view doesn't fetch the world. Fetches ONE row past the display cap as
// a truncation probe: a caller that gets back CHARACTER_SEARCH_LIMIT + 1 rows
// knows the result was cut off (vs a result that just happens to be exactly the
// cap), so the "showing first N" hint can't false-positive on a naturally
// cap-sized match set.
export async function searchUsersByLinkedCharacterName(query: string): Promise<AdminUser[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const rows = await db
    .select(adminUserColumns)
    .from(user)
    .leftJoin(account, oldestEveAccountJoin())
    .where(ilike(user.name, `%${trimmed}%`))
    .orderBy(asc(user.name))
    .limit(CHARACTER_SEARCH_LIMIT + 1);

  return rows.map(toAdminUser);
}

// Flips a user's role. Returns null when no row matches (i.e. the caller passed
// a userId that isn't in the table).
export async function setUserRole(
  userId: string,
  role: CharacterRole,
): Promise<AdminUser | null> {
  const [row] = await db
    .update(user)
    .set({ role, updatedAt: sql`now()` })
    .where(eq(user.id, userId))
    .returning({ id: user.id });

  if (!row) return null;
  return getUserById(userId);
}

// ---------------------------------------------------------------------------
// Multi-character platform (3.4.2). A user can link several EVE characters
// (each an `account` row); these helpers list them, resolve the active one, and
// move the active pointer. The user↔character join is `account` (providerId
// 'eve', accountId = character id); per-character name/portrait live on
// `characters` and are joined in (LEFT, since a profile row can lag a fresh
// link). Ordered oldest-first by `account.createdAt` so "oldest linked" is
// deterministic — this is the fallback active character and the unlink re-point
// target.
// ---------------------------------------------------------------------------

// account_id is TEXT; characters.character_id is bigint. Cast on the account
// side so the join uses the characters PK. Shared by every account→characters
// join below.
const characterProfileJoin = eq(
  characters.characterId,
  sql`${account.accountId}::bigint`,
);

const eveAccountsForUser = (userId: string) =>
  and(eq(account.userId, userId), eq(account.providerId, EVE_PROVIDER_ID));

export interface LinkedCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  // Raw granted-scope string off the account row (comma-joined). Fed to
  // deriveCharacterHealth — never surfaced to the client verbatim.
  scope: string | null;
  // Whether an encrypted refresh token is still on file. The 3.4.1b "dead"
  // refresh path NULLs the token columns, so a missing token == "reconnect".
  hasRefreshToken: boolean;
  linkedAt: Date;
  // Cached corp affiliation (3.7.3.2). corporationId feeds the Convex corp sync
  // (resolveCorpSubjects reads it instead of an inline ESI call);
  // affiliationRefreshedAt lets the enumeration route stale-gate its on-view
  // refresh. NULL until the first affiliation refresh.
  corporationId: number | null;
  affiliationRefreshedAt: Date | null;
}

// Every EVE character linked to a user, oldest first. The page's data source —
// NOT Better Auth's /list-accounts, which carries neither name/portrait nor the
// token presence this needs (and would leak no useful health signal).
export async function listLinkedCharacters(userId: string): Promise<LinkedCharacter[]> {
  const rows = await db
    .select({
      accountId: account.accountId,
      scope: account.scope,
      refreshToken: account.refreshToken,
      createdAt: account.createdAt,
      name: characters.name,
      portraitUrl: characters.portraitUrl,
      corporationId: characters.corporationId,
      affiliationRefreshedAt: characters.affiliationRefreshedAt,
    })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  return rows
    .map((r) => {
      const characterId = Number(r.accountId);
      return {
        characterId,
        name: r.name ?? `Character ${r.accountId}`,
        portraitUrl: r.portraitUrl ?? portraitUrl(characterId),
        scope: r.scope,
        hasRefreshToken: r.refreshToken != null && r.refreshToken.length > 0,
        linkedAt: r.createdAt,
        corporationId: r.corporationId ?? null,
        affiliationRefreshedAt: r.affiliationRefreshedAt ?? null,
      };
    })
    .filter((r) => Number.isFinite(r.characterId));
}

// ---------------------------------------------------------------------------
// Corp-affiliation cache (3.7.3.2). The Neon read/write half of the membership
// primitive — the pure verdicts live in membership.ts, the orchestration in
// affiliation.ts. Affiliation is character-intrinsic public data on `characters`
// (a sibling of name/portrait), so these reuse the same account→characters join
// helpers as the linked-character readers above.
// ---------------------------------------------------------------------------

// A user's linked characters with their cached corp affiliation. The membership
// helper (isUserCurrentMemberOfCorp) decides over this; an un-refreshed character
// carries a null corp + null refreshedAt and reads fail-closed.
export async function getUserAffiliations(userId: string): Promise<CachedAffiliation[]> {
  const rows = await db
    .select({
      accountId: account.accountId,
      corporationId: characters.corporationId,
      allianceId: characters.allianceId,
      factionId: characters.factionId,
      refreshedAt: characters.affiliationRefreshedAt,
    })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId));

  return rows
    .map((r) => ({
      characterId: Number(r.accountId),
      corporationId: r.corporationId ?? null,
      allianceId: r.allianceId ?? null,
      factionId: r.factionId ?? null,
      refreshedAt: r.refreshedAt ?? null,
    }))
    .filter((r) => Number.isFinite(r.characterId));
}

// One character's cached affiliation (null when the profile row doesn't exist).
export async function getCharacterAffiliation(
  characterId: number,
): Promise<CachedAffiliation | null> {
  const [row] = await db
    .select({
      corporationId: characters.corporationId,
      allianceId: characters.allianceId,
      factionId: characters.factionId,
      refreshedAt: characters.affiliationRefreshedAt,
    })
    .from(characters)
    .where(eq(characters.characterId, characterId))
    .limit(1);
  if (!row) return null;
  return {
    characterId,
    corporationId: row.corporationId ?? null,
    allianceId: row.allianceId ?? null,
    factionId: row.factionId ?? null,
    refreshedAt: row.refreshedAt ?? null,
  };
}

// Linked characters whose affiliation is missing or older than the TTL — the
// nightly cron's work list. DISTINCT because the same character can be linked by
// more than one user; one refresh covers them all (affiliation is per-character).
export async function listStaleLinkedCharacterIds(): Promise<number[]> {
  const cutoff = new Date(Date.now() - AFFILIATION_TTL_MS);
  const rows = await db
    .selectDistinct({ accountId: account.accountId })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(
      and(
        eq(account.providerId, EVE_PROVIDER_ID),
        or(
          isNull(characters.affiliationRefreshedAt),
          lt(characters.affiliationRefreshedAt, cutoff),
        ),
      ),
    );
  return rows.map((r) => Number(r.accountId)).filter((id) => Number.isFinite(id));
}

// Write fetched affiliations onto the `characters` cache. UPDATE (not upsert) —
// the row always exists for a linked/logged-in character (upsertCharacterOnLogin
// created it). Per-row at this scale (one `characters` row per pilot); batch via
// VALUES later if the table ever grows large.
export async function upsertAffiliations(rows: AffiliationRow[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date();
  for (const r of rows) {
    await db
      .update(characters)
      .set({
        corporationId: r.corporationId,
        allianceId: r.allianceId,
        factionId: r.factionId,
        affiliationRefreshedAt: now,
        updatedAt: now,
      })
      .where(eq(characters.characterId, r.characterId));
  }
}

// Append one corp-access decision to the audit ledger (allow AND deny). Accepts
// already-typed values (the gate owns the reason vocabulary, so `reason` is a
// plain string here) and writes only the decision + its subject/corp/provenance —
// never a token or secret.
export async function recordCorpAccessDecision(entry: {
  userId: string;
  corporationId: number;
  characterId: number | null;
  allowed: boolean;
  reason: string;
}): Promise<void> {
  await db.insert(corpAccessAudit).values(entry);
}

export interface ActiveCharacter {
  characterId: number;
  // From the joined `characters` row; null when the profile hasn't been written
  // yet (the caller coalesces to the user's own name/image).
  name: string | null;
  portraitUrl: string | null;
}

// Resolve the user's ACTIVE character for the session: the account named by
// `preferredId` (user.activeCharacterId) when it's still linked, else the oldest
// linked account. One indexed read (account_user_id_idx) + a characters PK join.
// If `preferredId` is set but no longer linked (its character was unlinked
// out-of-band), repoint user.activeCharacterId to the resolved char — fire-and-
// forget so getSession never blocks on a write. Returns null only when the user
// has no linked EVE account at all.
export async function resolveActiveCharacter(
  userId: string,
  preferredId: number | null,
): Promise<ActiveCharacter | null> {
  const rows = await db
    .select({
      accountId: account.accountId,
      name: characters.name,
      portraitUrl: characters.portraitUrl,
    })
    .from(account)
    .leftJoin(characters, characterProfileJoin)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  const linked = rows
    .map((r) => ({
      characterId: Number(r.accountId),
      name: r.name,
      portraitUrl: r.portraitUrl,
    }))
    .filter((r) => Number.isFinite(r.characterId));

  if (linked.length === 0) return null;

  const preferred = preferredId != null ? linked.find((r) => r.characterId === preferredId) : undefined;
  const chosen = preferred ?? linked[0];

  if (preferredId != null && preferred === undefined) {
    void db
      .update(user)
      .set({ activeCharacterId: chosen.characterId, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .catch((err) => console.error('[auth] active-character backfill failed', err));
  }

  return { characterId: chosen.characterId, name: chosen.name, portraitUrl: chosen.portraitUrl };
}

// True when the given character is one of this user's linked EVE accounts. The
// ownership guard the switch/unlink routes gate on — never trust a posted id.
export async function accountBelongsToUser(userId: string, characterId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .limit(1);
  return row != null;
}

// Point the user's active character at the given (already-validated) character.
export async function setActiveCharacter(userId: string, characterId: number): Promise<void> {
  await db
    .update(user)
    .set({ activeCharacterId: characterId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

// Re-point the active character to the user's oldest remaining linked account
// (NULL when none remain). Called after unlinking the active character so the
// session never references a deleted account. Returns the new active id.
export async function repointActiveToOldest(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt))
    .limit(1);

  const parsed = row ? Number(row.accountId) : null;
  const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  await db
    .update(user)
    .set({ activeCharacterId: next, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return next;
}

// The user's CURRENTLY-stored active character id (NULL if none). Read fresh
// from the row — used by unlink to decide whether to re-point, rather than
// trusting the session snapshot captured at the top of the request (which a
// concurrent switch could have made stale).
export async function getStoredActiveCharacterId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.activeCharacterId ?? null;
}

// ---------------------------------------------------------------------------
// Admin character management. These act on an ARBITRARY user (not the caller),
// so they're direct DB writes rather than Better Auth API calls — auth.api
// .unlinkAccount only ever targets the session's own user. Admin gating +
// ownership checks live in the /api/admin/* route handlers; these helpers
// assume already-validated inputs. The encrypted EVE tokens are columns on the
// `account` row, so deleting/moving the row carries them with it.
// ---------------------------------------------------------------------------

// Remove one linked EVE character from a user (admin force-unlink). Returns
// whether a row was actually deleted. Caller re-points the user's active
// character if this was it (mirrors the self-service unlink route).
export async function deleteLinkedCharacter(
  userId: string,
  characterId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(account)
    .where(and(eveAccountsForUser(userId), eq(account.accountId, String(characterId))))
    .returning({ id: account.id });
  return deleted.length > 0;
}

// Force-logout: delete every session row for a user. Returns the count removed.
// Note: with the session cookie cache on, an already-issued cookie can keep a
// user "signed in" until it expires (cookieCache.maxAge) and getSession next
// revalidates against the now-missing row — so revocation isn't instantaneous.
export async function revokeUserSessions(userId: string): Promise<number> {
  const deleted = await db
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });
  return deleted.length;
}

// Count of a user's currently-valid (non-expired) sessions — context for the
// admin force-logout control. Expired rows are pruned lazily by Better Auth, so
// filter them out here rather than counting stale rows.
export async function getActiveSessionCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: session.id })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())));
  return rows.length;
}

// Move a single linked character from one user onto another (admin reassign —
// the one-click merge). The unique key is (providerId, accountId), so changing
// only userId never conflicts. If the source user is left with no EVE accounts
// the source `user` row is deleted (its sessions cascade) — an account-less
// user can never be signed into again, so this is the natural completion of a
// merge, not a separate destructive delete. If the source keeps other
// characters, its active pointer is re-aimed when we moved the active one.
// Writes are sequential (the request-path neon-http client is transaction-free);
// the operation is admin-only and low-rate, so the brief non-atomic window is
// acceptable — same trade-off the self-service unlink route already makes.
export async function reassignCharacter({
  characterId,
  fromUserId,
  toUserId,
}: {
  characterId: number;
  fromUserId: string;
  toUserId: string;
}): Promise<{ sourceDeleted: boolean }> {
  await db
    .update(account)
    .set({ userId: toUserId, updatedAt: new Date() })
    .where(
      and(
        eq(account.providerId, EVE_PROVIDER_ID),
        eq(account.accountId, String(characterId)),
        eq(account.userId, fromUserId),
      ),
    );

  const [remaining] = await db
    .select({ id: account.id })
    .from(account)
    .where(eveAccountsForUser(fromUserId))
    .limit(1);

  if (!remaining) {
    await db.delete(user).where(eq(user.id, fromUserId));
    return { sourceDeleted: true };
  }

  const active = await getStoredActiveCharacterId(fromUserId);
  if (active === characterId) {
    await repointActiveToOldest(fromUserId);
  }
  return { sourceDeleted: false };
}

// ---------------------------------------------------------------------------
// Owner-hash identity binding (3.7.1.3). EVE's JWT `owner` claim
// (CharacterOwnerHash) is stable for one human across logins and changes only
// when the character is transferred to a different EVE account. We store it on
// the account row and reconcile it on every auth (from getUserInfo, BEFORE
// Better Auth's own account lookup), so a transferred character can never sign
// the new human into the prior owner's LGI account.
//
// The verdict (no-op / backfill / purge) is the pure classifyOwnerReconcile in
// owner-reconcile.ts; these helpers act on it against the DB.
// ---------------------------------------------------------------------------

// Compare the JWT's owner hash against the stored one for a character and act on
// the difference. Called once per sign-in/link. Cheap on the common paths: one
// indexed read, plus a single backfill UPDATE the first time a legacy/fresh row
// records its hash.
export async function reconcileCharacterOwner(
  characterId: number,
  jwtOwnerHash: string | null | undefined,
): Promise<void> {
  if (!jwtOwnerHash) return; // no owner claim → no transfer proof, never act

  const [row] = await db
    .select({ userId: account.userId, ownerHash: account.ownerHash })
    .from(account)
    .where(and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))))
    .limit(1);
  // No row yet = this character's first link this request; Better Auth creates
  // the account row AFTER this callback, so there is nothing to compare. The
  // fresh row starts with a NULL owner_hash and backfills on its next auth —
  // identical to a legacy row, never a false purge.
  if (!row) return;

  const action = classifyOwnerReconcile(row.ownerHash, jwtOwnerHash);
  if (action === 'noop') return;
  if (action === 'backfill') {
    await db
      .update(account)
      .set({ ownerHash: jwtOwnerHash, updatedAt: new Date() })
      .where(
        and(eq(account.providerId, EVE_PROVIDER_ID), eq(account.accountId, String(characterId))),
      );
    return;
  }
  // action === 'purge': a different human now controls this character.
  await purgeTransferredCharacter(row.userId, characterId);
}

// Purge a transferred character's prior owner, then let Better Auth create a fresh
// user for the new owner (it finds no account row, so its findOAuthUser email
// fallback no longer re-links to the prior owner). Surface:
//   1–2. credential + owner-authored profile teardown — the purge registry's
//        credential tier (src/features/auth/purge.ts): account row + encrypted
//        tokens, then reset the owner-authored fields on the shared `characters`
//        row (kept — a telemetry FK target). A NEW per-character owner-authored
//        table is covered by claiming it in its slice's purge contributor, not by
//        editing here (the registry is now the home of which tables this touches).
//   3.   the prior owner's user row — reconciled below (delete when account-less,
//        else rebind the identity email + repoint active). Auth-identity logic, so
//        it stays here rather than in a generic contributor.
// ONLY the credential tier runs: the trackers' per-character caches (skills +
// personal/corp jobs, owned assets/blueprints) are regenerable and re-sync under
// the new owner, so they must NOT be torn down; the online-status canary doc is
// reaped by its lazy orphan cleanup in onlineStatus.applySyncResults. Steps are
// sequential, non-atomic neon-http writes (no request-path transaction) — the same
// accepted trade-off as reassignCharacter; a transfer is rare and low-rate.
export async function purgeTransferredCharacter(
  priorUserId: string,
  characterId: number,
): Promise<void> {
  // 1–2. Credential + owner-authored profile teardown via the purge registry.
  await runPurge({ kind: 'character', userId: priorUserId, characterId }, ['credential']);

  // 3. Reconcile the prior owner's user row — delete when account-less, else rebind
  //    the identity email off the freed character + repoint active. Shared with the
  //    self-service character-purge (reconcileAfterCharacterRemoval below).
  await reconcileAfterCharacterRemoval(priorUserId, characterId);
}

// Reconcile a user row after one of its characters has been torn down. Shared by
// the transfer-purge (owner-hash) and the self-service character-purge — the same
// two outcomes either way:
//   - No EVE accounts left ⇒ the user is permanently un-loginable (EVE SSO is the
//     only login), so delete it. Sessions + user_preferences + custom_structures
//     cascade (onDelete:'cascade') — the deliberate completion of the purge,
//     mirroring the admin reassignCharacter precedent.
//   - Siblings remain ⇒ if the freed character was the identity email, rebind it to
//     a surviving character. Better Auth's findOAuthUser falls back to a user.email
//     match when no account row is found, and overrideUserInfo keeps that email
//     tracking the last-signed-in character's synthetic <id>@eve.invalid — so a
//     surviving user.email == the freed character's synthetic address would re-link
//     it. Also repoint the active character if it was the freed one.
// Returns whether the account was emptied (and thus the user deleted) — the signal
// the self-service purge surfaces so the UI knows the session is gone. Sequential,
// non-atomic neon-http writes (no request-path transaction) — the accepted
// reassignCharacter trade-off; a purge is rare and low-rate.
//
// PRECONDITION: the caller must have ALREADY run the credential-tier purge for
// `characterId` (which deletes its `account` row) before calling this — the
// remaining-accounts count below must not still see the removed character, or it
// would count itself a survivor and wrongly return accountEmptied=false. Both
// callers (purgeOwnCharacter, purgeTransferredCharacter) run runPurge first.
async function reconcileAfterCharacterRemoval(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  const remaining = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId))
    .orderBy(asc(account.createdAt));

  if (remaining.length === 0) {
    await db.delete(user).where(eq(user.id, userId));
    return { accountEmptied: true };
  }

  const [u] = await db
    .select({ email: user.email, activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (u?.email === syntheticEmail(characterId)) {
    await db
      .update(user)
      .set({ email: syntheticEmail(Number(remaining[0].accountId)), updatedAt: new Date() })
      .where(eq(user.id, userId));
  }
  if (u?.activeCharacterId === characterId) {
    await repointActiveToOldest(userId);
  }
  return { accountEmptied: false };
}

// ---------------------------------------------------------------------------
// Self-service account safety (ACCOUNT.2). These act on the CALLER's OWN account;
// the route handler owns the session gate + ownership check, these own the
// auth-identity orchestration. Writes are sequential, non-atomic neon-http — the
// reassignCharacter/purgeTransferredCharacter trade-off (a purge is rare).
// ---------------------------------------------------------------------------

// Purge one of the caller's own characters — the destructive counterpart to unlink.
// Where unlink (deleteLinkedCharacter) only detaches the account row, this scrubs
// ALL of the character's derived data and revokes its EVE grant upstream. Order:
//   1. Revoke the EVE refresh token at CCP (best-effort — never aborts the purge),
//      BEFORE the credential tier below deletes the stored token.
//   2. runPurge ALL tiers (credential link+tokens → cache mirrors incl. the Convex
//      online doc → durable), the full per-character sweep.
//   3. Reconcile the user row: a last-character purge empties the account, so the
//      user is deleted (a de-facto nuke) and accountEmptied is true; otherwise the
//      identity email is rebound + active repointed and accountEmptied is false.
// The returned accountEmptied tells the caller/UI whether the account (and session)
// is gone — the D-5 redirect-to-authorized-apps lightbox shows only when emptied.
export async function purgeOwnCharacter(
  userId: string,
  characterId: number,
): Promise<{ accountEmptied: boolean }> {
  await revokeCharacterToken(characterId);
  await runPurge({ kind: 'character', userId, characterId });
  return reconcileAfterCharacterRemoval(userId, characterId);
}

// The character ids of a user's currently-linked EVE accounts.
async function eveAccountIdsFor(userId: string): Promise<number[]> {
  const rows = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(userId));
  return rows.map((r) => Number(r.accountId));
}

// Nuke the caller's entire account. The user-row delete cascades
// session/account/user_preferences/custom_structures, but the per-character caches
// (skills, jobs, owned assets/blueprints, telemetry) key on character_id with no
// user FK, so they do NOT cascade — they must be swept per character first. So:
//   - for each linked character: revoke its EVE grant (best-effort) + runPurge its
//     per-character tiers (credential-first, so nothing can re-sync mid-purge);
//   - runPurge the per-user tiers (the user-keyed tables with no FK — e.g. the corp
//     jobs board — plus the user-axis Convex online teardown);
//   - delete the user row (the cascade finishes the cascading tables).
// "N character purges + 1 user purge + the user-row delete" (src/purge/types.ts).
//
// Re-enumerate until no EVE account remains rather than snapshotting once: a
// character linked concurrently (after an enumeration) would otherwise be
// cascade-orphaned by the final user-row drop — its account row gone, its
// character-keyed caches surviving with no later sync to reap them. Each pass purges
// the linked set (the credential tier deletes those account rows), so the next pass
// sees only a newcomer or nothing; it converges because a pilot cannot complete the
// EVE link flow faster than a pass purges. The neon-http path has no transaction, so
// this shrinks the race to the negligible gap before the delete, not fully closing it.
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
