import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { AffiliationRow } from './affiliation-source';
import { characterProfileJoin, eveAccountsForUser } from './eve-account-shared';
import { EVE_PROVIDER_ID } from './eve-sso';
import type { CachedAffiliation } from './membership';
import { account, characters, corpAccessAudit } from '@/db/auth-schema';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

// ---------------------------------------------------------------------------
// Corp-affiliation cache (3.7.3.2). The Neon read/write half of the membership
// primitive — the pure verdicts live in membership.ts, the orchestration in
// affiliation.ts. Affiliation is character-intrinsic public data on `characters`
// (a sibling of name/portrait), so these reuse the same account→characters join
// helpers (eve-account-shared) as the linked-character readers.
// ---------------------------------------------------------------------------

/**
 * One account→characters row shaped into the cached-affiliation record, loosely
 * coalescing every field to null (an un-refreshed character reads fail-closed).
 * Shared by the per-user and per-character affiliation reads. Pure.
 */
export function rowToCachedAffiliation(
  characterId: number,
  row: {
    corporationId: number | null;
    allianceId: number | null;
    factionId: number | null;
    refreshedAt: Date | null;
  },
): CachedAffiliation {
  return {
    characterId,
    corporationId: row.corporationId ?? null,
    allianceId: row.allianceId ?? null,
    factionId: row.factionId ?? null,
    refreshedAt: row.refreshedAt ?? null,
  };
}

/**
 * A user's linked characters with their cached corp affiliation. The membership
 * helper (isUserCurrentMemberOfCorp) decides over this; an un-refreshed character
 * carries a null corp + null refreshedAt and reads fail-closed.
 */
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
    .map((r) => rowToCachedAffiliation(Number(r.accountId), r))
    .filter((r) => Number.isFinite(r.characterId));
}

/** One character's cached affiliation (null when the profile row doesn't exist). */
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
  return rowToCachedAffiliation(characterId, row);
}

/**
 * Linked characters whose affiliation is missing or older than the TTL — the
 * nightly cron's work list. DISTINCT because the same character can be linked by
 * more than one user; one refresh covers them all (affiliation is per-character).
 */
export async function listStaleLinkedCharacterIds(): Promise<number[]> {
  const cutoff = new Date(Date.now() - AFFILIATION_FRESHNESS.ttlMs);
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

/**
 * Write fetched affiliations onto the `characters` cache. UPDATE (not upsert) —
 * the row always exists for a linked/logged-in character (upsertCharacterOnLogin
 * created it). Per-row at this scale (one `characters` row per pilot); batch via
 * VALUES later if the table ever grows large.
 */
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

/**
 * Append one corp-access decision to the audit ledger (allow AND deny). Accepts
 * already-typed values (the gate owns the reason vocabulary, so `reason` is a
 * plain string here) and writes only the decision + its subject/corp/provenance —
 * never a token or secret.
 */
export async function recordCorpAccessDecision(entry: {
  userId: string;
  corporationId: number;
  characterId: number | null;
  allowed: boolean;
  reason: string;
}): Promise<void> {
  await db.insert(corpAccessAudit).values(entry);
}

/** Deletes corporation-access audit rows older than the retention cutoff. */
export async function pruneCorpAccessAudit(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(corpAccessAudit).where(lt(corpAccessAudit.decidedAt, cutoff));
}
