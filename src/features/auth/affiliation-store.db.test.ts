import { asc, eq } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canReachDb,
  dropDisposableSchema,
  LOCAL_DB_URL,
  schemaUrl,
  setupDisposableSchema,
} from '@/db/test-support/db-coverage-harness';
import { AFFILIATION_TTL_MS } from './membership';
import {
  getCharacterAffiliation,
  getUserAffiliations,
  listStaleLinkedCharacterIds,
  recordCorpAccessDecision,
  upsertAffiliations,
} from './affiliation-store';
import { account, characters, corpAccessAudit, user } from './schema';

const SCHEMA = 'test_auth_affiliation_store';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);

const USER_ID = 'affiliation-user';
const FIRST_CHAR = 90000011;
const SECOND_CHAR = 90000012;

describe.skipIf(!reachable)('affiliation-store queries (real Postgres)', () => {
  let adminClient: ReturnType<typeof postgres>;
  let seedDb: ReturnType<typeof drizzlePg>;

  beforeAll(async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, SCHEMA));

    adminClient = postgres(schemaUrl(baseUrl, SCHEMA), { max: 4, onnotice: () => {} });
    await setupDisposableSchema(adminClient, SCHEMA, [
      'user',
      'account',
      'characters',
      'corp_access_audit',
    ]);
    seedDb = drizzlePg(adminClient);
  });

  afterAll(async () => {
    const proxyClient = (
      (await import('@/db')).db as unknown as { $client: ReturnType<typeof postgres> }
    ).$client;
    await proxyClient.end({ timeout: 5 }).catch(() => {});
    await dropDisposableSchema(adminClient, SCHEMA);
    await adminClient.end({ timeout: 5 }).catch(() => {});
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await adminClient.unsafe('DELETE FROM corp_access_audit');
    await adminClient.unsafe('DELETE FROM account');
    await adminClient.unsafe('DELETE FROM characters');
    await adminClient.unsafe('DELETE FROM "user"');
    await seedDb.insert(user).values({
      id: USER_ID,
      name: 'Affiliation Pilot',
      email: `${USER_ID}@eve.invalid`,
    });
  });

  async function seedCharacter(
    characterId: number,
    overrides: Partial<typeof characters.$inferInsert> = {},
  ) {
    await seedDb.insert(characters).values({
      characterId,
      name: `Character ${characterId}`,
      portraitUrl: `https://images.example/${characterId}`,
      ...overrides,
    });
  }

  async function seedEveAccount(id: string, characterId: number) {
    await seedDb.insert(account).values({
      id,
      accountId: String(characterId),
      providerId: 'eve',
      userId: USER_ID,
    });
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
      affiliationRefreshedAt: new Date(now - AFFILIATION_TTL_MS - 1000),
    });
    await seedCharacter(SECOND_CHAR, {
      affiliationRefreshedAt: new Date(now - AFFILIATION_TTL_MS + 60_000),
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

    const rows = await seedDb.select().from(characters).orderBy(asc(characters.characterId));
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

    const rows = await seedDb
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
