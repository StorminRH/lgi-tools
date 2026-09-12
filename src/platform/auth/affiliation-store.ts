import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { AffiliationRow } from './affiliation-source';
import { characterProfileJoin, eveAccountsForUser, parseLinkedAccountId } from './eve-account-shared';
import { EVE_PROVIDER_ID } from './eve-sso';
import type { CachedAffiliation } from './membership';
import { account, characters, corpAccessAudit } from '@/db/auth-schema';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

function rowToCachedAffiliation(
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

  return rows.flatMap((r) => {
    const characterId = parseLinkedAccountId(r.accountId);
    return characterId === null ? [] : [rowToCachedAffiliation(characterId, r)];
  });
}

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
  return rows.flatMap((r) => {
    const characterId = parseLinkedAccountId(r.accountId);
    return characterId === null ? [] : [characterId];
  });
}

export async function updateAffiliations(
  rows: AffiliationRow[],
): Promise<readonly number[]> {
  if (rows.length === 0) return [];

  const characterIds = [...new Set(rows.map((row) => row.characterId))];
  const previousRows = await db
    .select({
      characterId: characters.characterId,
      corporationId: characters.corporationId,
    })
    .from(characters)
    .where(inArray(characters.characterId, characterIds));
  const previousCorporationIdByCharacter = new Map(
    previousRows.map((row) => [row.characterId, row.corporationId] as const),
  );

  const now = new Date();
  const changedCorporationIds = new Set<number>();
  for (const r of rows) {
    const previousCorporationId = previousCorporationIdByCharacter.get(r.characterId);
    if (previousCorporationId !== undefined && previousCorporationId !== r.corporationId) {
      if (previousCorporationId !== null) {
        changedCorporationIds.add(previousCorporationId);
      }
      changedCorporationIds.add(r.corporationId);
    }
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
  return [...changedCorporationIds].sort((left, right) => left - right);
}

export async function recordCorpAccessDecision(entry: {
  userId: string;
  corporationId: number;
  characterId: number | null;
  allowed: boolean;
  reason: string;
}): Promise<void> {
  await db.insert(corpAccessAudit).values(entry);
}

export async function pruneCorpAccessAudit(
  database: AnyPgDb,
  retentionDays: number,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database.delete(corpAccessAudit).where(lt(corpAccessAudit.decidedAt, cutoff));
}
