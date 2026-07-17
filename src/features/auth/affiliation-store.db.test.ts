import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter as insertCharacter,
  seedEveAccount as insertEveAccount,
  seedUser,
} from '@/db/test-support/db-test-harness';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import {
  getCharacterAffiliation,
  getUserAffiliations,
  listStaleLinkedCharacterIds,
  recordCorpAccessDecision,
  upsertAffiliations,
} from './affiliation-store';
import { characters, corpAccessAudit } from './schema';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;
const harness = await createDbTestHarness({
  schema: 'test_auth_affiliation_store',
  tables: ['user', 'account', 'characters', 'corp_access_audit'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const USER_ID = 'affiliation-user';
const FIRST_CHAR = 90000011;
const SECOND_CHAR = 90000012;

describe.skipIf(!harness.reachable)('affiliation-store queries (real Postgres)', () => {
  beforeEach(async () => {
    await seedUser(harness.db, USER_ID, {
      name: 'Affiliation Pilot',
      email: `${USER_ID}@eve.invalid`,
    });
  });

  async function seedCharacter(
    characterId: number,
    overrides: Partial<typeof characters.$inferInsert> = {},
  ) {
    await insertCharacter(harness.db, characterId, {
      portraitUrl: `https://images.example/${characterId}`,
      ...overrides,
    });
  }

  async function seedEveAccount(id: string, characterId: number) {
    await insertEveAccount(harness.db, { id, characterId, userId: USER_ID });
  }

  it('returns joined affiliation rows and fails closed across missing profile fields', async () => {
    const refreshedAt = new Date('2026-07-15T12:00:00Z');
    await seedCharacter(FIRST_CHAR, {
      corporationId: 98000011,
      allianceId: 99000011,
      factionId: 500011,
      affiliationRefreshedAt: refreshedAt,
    });
    await seedEveAccount('first', FIRST_CHAR);
    await seedEveAccount('second', SECOND_CHAR);

    await expect(getUserAffiliations(USER_ID)).resolves.toEqual([
      {
        characterId: FIRST_CHAR,
        corporationId: 98000011,
        allianceId: 99000011,
        factionId: 500011,
        refreshedAt,
      },
      {
        characterId: SECOND_CHAR,
        corporationId: null,
        allianceId: null,
        factionId: null,
        refreshedAt: null,
      },
    ]);
    await expect(getCharacterAffiliation(FIRST_CHAR)).resolves.toMatchObject({
      corporationId: 98000011,
      refreshedAt,
    });
    await expect(getCharacterAffiliation(99999999)).resolves.toBeNull();
  });

  it('returns only missing or older-than-TTL linked characters without duplicates', async () => {
    const now = Date.now();
    await seedCharacter(FIRST_CHAR, {
      affiliationRefreshedAt: new Date(now - AFFILIATION_WINDOW_MS - 1000),
    });
    await seedCharacter(SECOND_CHAR, {
      affiliationRefreshedAt: new Date(now - AFFILIATION_WINDOW_MS + 60_000),
    });
    await seedEveAccount('first', FIRST_CHAR);
    await seedEveAccount('second', SECOND_CHAR);
    await seedEveAccount('missing-profile', 90000013);

    const stale = await listStaleLinkedCharacterIds();

    expect(stale.sort((a, b) => a - b)).toEqual([FIRST_CHAR, 90000013]);
    expect(new Set(stale).size).toBe(stale.length);
  });

  it('updates existing character rows, creates no missing row, and treats empty input as a no-op', async () => {
    await seedCharacter(FIRST_CHAR);

    await upsertAffiliations([
      {
        characterId: FIRST_CHAR,
        corporationId: 98000021,
        allianceId: 99000021,
        factionId: null,
      },
      {
        characterId: SECOND_CHAR,
        corporationId: 98000022,
        allianceId: null,
        factionId: null,
      },
    ]);
    await upsertAffiliations([]);

    const rows = await harness.db.select().from(characters).orderBy(asc(characters.characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      characterId: FIRST_CHAR,
      corporationId: 98000021,
      allianceId: 99000021,
      factionId: null,
    });
    expect(rows[0]?.affiliationRefreshedAt).toBeInstanceOf(Date);
  });

  it('records the complete allow and deny decision provenance', async () => {
    await recordCorpAccessDecision({
      userId: USER_ID,
      corporationId: 98000031,
      characterId: FIRST_CHAR,
      allowed: true,
      reason: 'member',
    });
    await recordCorpAccessDecision({
      userId: USER_ID,
      corporationId: 98000031,
      characterId: null,
      allowed: false,
      reason: 'no_current_member',
    });

    const rows = await harness.db
      .select()
      .from(corpAccessAudit)
      .where(eq(corpAccessAudit.userId, USER_ID))
      .orderBy(asc(corpAccessAudit.id));
    expect(rows).toHaveLength(2);
    expect(rows.map(({ allowed, characterId, corporationId, reason }) => ({
      allowed,
      characterId,
      corporationId,
      reason,
    }))).toEqual([
      {
        allowed: true,
        characterId: FIRST_CHAR,
        corporationId: 98000031,
        reason: 'member',
      },
      {
        allowed: false,
        characterId: null,
        corporationId: 98000031,
        reason: 'no_current_member',
      },
    ]);
  });
});
