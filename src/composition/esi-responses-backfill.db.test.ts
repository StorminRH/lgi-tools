import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDbTestHarness, seedCharacter } from '@/db/__tests__/support/db-test-harness';
import { corpMemberRoles } from '@/db/auth-schema';
import { corpContextKeys } from '@/data/corp-holdings/keys';
import { corpProfiles } from '@/data/corp-holdings/schema';
import { identityText, rowIdentity } from '@/data/esi-store/key';
import { esiResponses } from '@/data/esi-store/schema';
import type { EsiStoreKey } from '@/data/esi-store/types';
import { historyKey } from '@/data/market-history/keys';
import { marketHistoryMeta } from '@/data/market-history/schema';
import { priceKey } from '@/data/market-prices/keys';
import { marketPrices } from '@/data/market-prices/schema';
import { sheetEndpointKey } from '@/features/character-sheet/keys';
import { characterSheets } from '@/features/character-sheet/schema';
import type { SheetSections } from '@/features/character-sheet/types';
import { characterJobsKey, corpJobsKey } from '@/features/industry-jobs/keys';
import { characterIndustryJobSyncs, corpIndustryJobSyncs } from '@/features/industry-jobs/schema';
import { ownedAssetsKey } from '@/features/owned-assets/keys';
import { ownedAssetSyncs } from '@/features/owned-assets/schema';
import { ownedBlueprintsKey } from '@/features/owned-blueprints/keys';
import { ownedBlueprintSyncs } from '@/features/owned-blueprints/schema';
import { corpStructuresKey } from '@/features/owned-structures/keys';
import { corpStructureSyncs } from '@/features/owned-structures/schema';
import { skillQueueKey, skillsKey } from '@/features/skill-queue/keys';
import { characterSkillSyncs } from '@/features/skill-queue/schema';
import { affiliationKey } from '@/platform/auth/affiliation-key';
import { characterRolesKey } from '@/platform/auth/roles-key';

const MIGRATION = 'drizzle/0086_backfill_esi_responses.sql';

const harness = await createDbTestHarness({
  schema: 'test_esi_responses_backfill',
  tables: [
    'characters',
    'corp_member_roles',
    'character_skill_syncs',
    'character_industry_job_syncs',
    'corp_industry_job_syncs',
    'owned_asset_syncs',
    'owned_blueprint_syncs',
    'corp_structure_syncs',
    'corp_profiles',
    'character_sheets',
    'market_prices',
    'market_history_meta',
    'esi_responses',
  ],
  resetBetweenTests: 'truncate',
});

const CHARACTER = 91;
const OTHER_CHARACTER = 92;
const CORPORATION = 98;
const USER = 'u1';
const STAMP = new Date('2026-10-01T12:00:00.000Z');
const FUTURE = new Date(Date.now() + 3_600_000);
const PAST = new Date(Date.now() - 3_600_000);

/** Runs the migration's statements in order inside one transaction, as drizzle's migrator does. */
async function applyMigration(): Promise<void> {
  const statements = readFileSync(MIGRATION, 'utf8').split('--> statement-breakpoint');
  await harness.sql.begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement);
  });
}

interface Carried {
  expiresAt: number | null;
  etags: string[];
  checkedAt: number;
}

async function carriedRows(): Promise<Map<string, Carried>> {
  const rows = await harness.db.select().from(esiResponses);
  return new Map(rows.map((row) => [
    identityText(row),
    { expiresAt: row.expiresAt?.getTime() ?? null, etags: row.etags, checkedAt: row.checkedAt.getTime() },
  ]));
}

const after = (seconds: number, from: Date = STAMP): number => from.getTime() + seconds * 1000;

const carried = (ttlSeconds: number, etags: string[] = []): Carried => ({
  expiresAt: after(ttlSeconds),
  etags,
  checkedAt: STAMP.getTime(),
});

const keyText = (key: EsiStoreKey): string => identityText(rowIdentity(key));

/** The sheet rows as the old code wrote them: a stamp, an ETag per part, and `denied` on a section the token could not read. */
function oldSheetSections(): SheetSections {
  const sections = {
    profile: { data: { character: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.3 } }, refreshedAt: STAMP.toISOString(), etags: { character: '"p1"' } },
    status: {
      data: { location: { solarSystemId: 30000142, stationId: null, structureId: null }, ship: { shipTypeId: 1, shipItemId: 2, shipName: 'x' }, online: { online: true, lastLogin: null, lastLogout: null } },
      refreshedAt: STAMP.toISOString(),
      etags: { location: '"l1"', ship: null, online: '"o1"' },
    },
    wallet: { data: { balance: 5 }, refreshedAt: STAMP.toISOString(), etags: { balance: '"w1"' } },
    journal: { data: { journal: { windowStart: STAMP.toISOString(), inflow: 0, outflow: 0, series: [], recent: [] } }, refreshedAt: STAMP.toISOString(), etags: { journal: '"j1"' } },
    orders: { data: null, denied: true, refreshedAt: STAMP.toISOString(), etags: {} },
    structures: { data: { names: {} }, refreshedAt: STAMP.toISOString(), etags: {} },
  };
  return sections as unknown as SheetSections;
}

async function seedOwnerSyncs(): Promise<void> {
  await harness.db.insert(characterSkillSyncs).values({ characterId: CHARACTER, lastRefreshedAt: STAMP, queueEtag: '"q1"', skillsEtag: null });
  await harness.db.insert(characterIndustryJobSyncs).values({ characterId: CHARACTER, lastRefreshedAt: STAMP, jobsEtag: '"cj1"' });
  await harness.db.insert(corpIndustryJobSyncs).values({ userId: USER, corporationId: CORPORATION, lastRefreshedAt: STAMP, jobsEtag: '"kj1"' });
  await harness.db.insert(ownedAssetSyncs).values([
    { ownerType: 'character', ownerId: CHARACTER, lastRefreshedAt: STAMP, pageEtags: ['"a1"', '"a2"'] },
    { ownerType: 'corporation', ownerId: CORPORATION, lastRefreshedAt: STAMP, pageEtags: [] },
  ]);
  await harness.db.insert(ownedBlueprintSyncs).values({ ownerType: 'corporation', ownerId: CORPORATION, lastRefreshedAt: STAMP, pageEtags: ['"b1"'] });
  await harness.db.insert(corpStructureSyncs).values({ corporationId: CORPORATION, lastRefreshedAt: STAMP, pageEtags: ['"s1"'] });
  await harness.db.insert(corpProfiles).values({ corporationId: CORPORATION, hqStationId: null, divisionNames: {}, containerNames: {}, structureNames: {}, lastRefreshedAt: STAMP });
}

async function seedCharacterRows(): Promise<void> {
  await seedCharacter(harness.db, CHARACTER, { affiliationRefreshedAt: STAMP });
  await seedCharacter(harness.db, OTHER_CHARACTER, { affiliationRefreshedAt: null });
  await harness.db.insert(corpMemberRoles).values({ characterId: CHARACTER, corporationId: CORPORATION, roles: [], rolesAtHq: [], rolesAtBase: [], rolesAtOther: [], fetchedAt: STAMP });
  await harness.db.insert(characterSheets).values({ characterId: CHARACTER, sections: oldSheetSections(), lastRefreshedAt: STAMP });
}

async function seedGlobalRows(): Promise<void> {
  await harness.db.insert(marketPrices).values([
    { typeId: 34, updatedAt: STAMP, staleAfter: FUTURE, source: 'esi' },
    { typeId: 35, updatedAt: STAMP, staleAfter: PAST, source: 'esi' },
    { typeId: 36, updatedAt: STAMP, staleAfter: new Date(0), source: 'esi' },
  ]);
  await harness.db.insert(marketHistoryMeta).values([
    { typeId: 34, updatedAt: STAMP, staleAfter: FUTURE, source: 'esi' },
    { typeId: 35, updatedAt: STAMP, staleAfter: PAST, source: 'esi' },
  ]);
}

describe.skipIf(!harness.reachable)('0086 esi_responses backfill (real Postgres)', () => {
  it('carries every stored answer under the key the store reads it by, with the old window and ETags', async () => {
    await seedOwnerSyncs();
    await seedCharacterRows();
    await seedGlobalRows();
    // A row the store already wrote wins over the backfill.
    await harness.db.insert(esiResponses).values({ ...rowIdentity(skillsKey(CHARACTER)), expiresAt: FUTURE, etags: ['"live"'], checkedAt: FUTURE });

    await applyMigration();

    const rows = await carriedRows();
    const expected: Record<string, Carried> = {
      [keyText(skillsKey(CHARACTER))]: { expiresAt: FUTURE.getTime(), etags: ['"live"'], checkedAt: FUTURE.getTime() },
      [keyText(skillQueueKey(CHARACTER))]: carried(120, ['"q1"']),
      [keyText(characterJobsKey(CHARACTER))]: carried(300, ['"cj1"']),
      [keyText(corpJobsKey(USER, CORPORATION))]: carried(300, ['"kj1"']),
      [keyText(ownedAssetsKey({ ownerType: 'character', ownerId: CHARACTER }))]: carried(3600, ['"a1"', '"a2"']),
      [keyText(ownedAssetsKey({ ownerType: 'corporation', ownerId: CORPORATION }))]: carried(3600),
      [keyText(ownedBlueprintsKey({ ownerType: 'corporation', ownerId: CORPORATION }))]: carried(3600, ['"b1"']),
      [keyText(corpStructuresKey(CORPORATION))]: carried(3600, ['"s1"']),
      ...Object.fromEntries(corpContextKeys(CORPORATION).map((key) => [keyText(key), carried(3600)])),
      [keyText(characterRolesKey(CHARACTER))]: carried(3600),
      [keyText(affiliationKey(CHARACTER))]: carried(3600),
      [keyText(sheetEndpointKey(CHARACTER, 'character'))]: carried(86400, ['"p1"']),
      [keyText(sheetEndpointKey(CHARACTER, 'location'))]: carried(120, ['"l1"']),
      [keyText(sheetEndpointKey(CHARACTER, 'ship'))]: carried(120),
      [keyText(sheetEndpointKey(CHARACTER, 'online'))]: carried(120, ['"o1"']),
      [keyText(sheetEndpointKey(CHARACTER, 'wallet'))]: carried(120, ['"w1"']),
      [keyText(sheetEndpointKey(CHARACTER, 'journal'))]: carried(3600),
      [keyText(priceKey(34))]: { expiresAt: FUTURE.getTime(), etags: [], checkedAt: STAMP.getTime() },
      [keyText(historyKey(34))]: { expiresAt: FUTURE.getTime(), etags: [], checkedAt: STAMP.getTime() },
    };
    expect(Object.fromEntries(rows)).toEqual(expected);

    // Left out: the denied orders section, the character never affiliated, and the expired price and history rows.
    expect(rows.has(keyText(sheetEndpointKey(CHARACTER, 'orders')))).toBe(false);
    expect(rows.has(keyText(affiliationKey(OTHER_CHARACTER)))).toBe(false);
    for (const typeId of [35, 36]) {
      expect(rows.has(keyText(priceKey(typeId)))).toBe(false);
      expect(rows.has(keyText(historyKey(typeId)))).toBe(false);
    }

    await applyMigration();
    expect(await carriedRows()).toEqual(rows);
  });

  it('is a no-op on empty tables', async () => {
    await applyMigration();
    expect(await carriedRows()).toEqual(new Map());
  });
});
