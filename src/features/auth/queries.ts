import { and, asc, eq, gt, ilike, isNull, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { purgeConvexCharacterProjections } from '@/data/convex/purge';
import { db } from '@/db';
import type { AffiliationRow } from './affiliation-source';
import { EVE_PROVIDER_ID, portraitUrl } from './eve-sso';
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

// Purge a transferred character's prior owner across the DEFINED purge surface,
// then let Better Auth create a fresh user for the new owner (it finds no account
// row, so its findOAuthUser email fallback no longer re-links to the prior owner).
// Surface (keep in sync with the 3.7.14 hardening note when new per-character /
// per-user owner-authored data lands):
//   1. account row + encrypted tokens — the existing delete path, reused.
//   2. per-character owner-authored profile fields on the shared `characters` row.
//   3. Convex projections (skills + industry jobs) — prompt teardown.
//   4. the prior owner's user row — only when it's left account-less.
export async function purgeTransferredCharacter(
  priorUserId: string,
  characterId: number,
): Promise<void> {
  // 1. Account row + encrypted tokens (reuse the existing delete path).
  await deleteLinkedCharacter(priorUserId, characterId);

  // 2. Reset the per-character owner-authored fields on the shared `characters`
  //    row. The row is kept (it's a telemetry FK target) and the
  //    character-intrinsic name/portrait are refreshed by the new owner's login;
  //    only preferences (owner-authored) are cleared. Defensive today — nothing
  //    writes characters.preferences yet — but it pins the purge surface for the
  //    per-character owner-authored data 3.7.10 will add.
  await db
    .update(characters)
    .set({ preferences: {}, updatedAt: new Date() })
    .where(eq(characters.characterId, characterId));

  // 3. Prompt Convex projection teardown (best-effort — never throws; the lazy
  //    orphan cleanup in applySyncResults is the safety net).
  await purgeConvexCharacterProjections(priorUserId, characterId);

  // 4. Reconcile the prior owner's user row. Better Auth's findOAuthUser falls
  //    back to a user.email match when no account row is found, and
  //    overrideUserInfo keeps that email tracking the last-signed-in character's
  //    synthetic <id>@eve.invalid — so a surviving user.email == the freed
  //    character's synthetic address would re-link it to the prior owner.
  const remaining = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(eveAccountsForUser(priorUserId))
    .orderBy(asc(account.createdAt));

  if (remaining.length === 0) {
    // Account-less ⇒ permanently un-loginable (EVE SSO is the only login) ⇒
    // delete it. Sessions + user_preferences cascade (onDelete:'cascade') — the
    // deliberate completion of the purge, mirroring the admin reassignCharacter
    // precedent. NB: steps 1–4 are sequential, non-atomic neon-http writes (no
    // request-path transaction) — the same accepted trade-off as
    // reassignCharacter; an actual transfer is rare and low-rate.
    await db.delete(user).where(eq(user.id, priorUserId));
    return;
  }

  // The prior owner keeps other characters. If the freed character was their
  // identity email, rebind it to a surviving character so the freed synthetic
  // address can't email-match this user on the new owner's sign-in.
  const [u] = await db
    .select({ email: user.email, activeCharacterId: user.activeCharacterId })
    .from(user)
    .where(eq(user.id, priorUserId))
    .limit(1);
  if (u?.email === syntheticEmail(characterId)) {
    await db
      .update(user)
      .set({ email: syntheticEmail(Number(remaining[0].accountId)), updatedAt: new Date() })
      .where(eq(user.id, priorUserId));
  }
  if (u?.activeCharacterId === characterId) {
    await repointActiveToOldest(priorUserId);
  }
}
