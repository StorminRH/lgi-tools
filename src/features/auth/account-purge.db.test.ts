import { eq, isNull } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { usageLogs } from '@/data/telemetry/schema';
import { userPreferences } from '@/data/preferences/schema';
import {
  addForeignKey,
  canReachDb,
  dropDisposableSchema,
  LOCAL_DB_URL,
  schemaUrl,
  setupDisposableSchema,
} from '@/db/test-support/db-coverage-harness';

const revokeMock = vi.hoisted(() => vi.fn());
vi.mock('./eve-token-service', () => ({
  revokeCharacterToken: (characterId: number) => revokeMock(characterId),
}));

import { nukeAccount, purgeOwnCharacter } from './account-purge';
import { account, characters, corpAccessAudit, session, user } from './schema';
import { syntheticEmail } from './synthetic-email';

const SCHEMA = 'test_auth_account_purge';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);

const USER_ID = 'purge-user';
const FIRST_CHAR = 90000041;
const SECOND_CHAR = 90000042;

const TABLE_NAMES = [
  'user',
  'account',
  'characters',
  'session',
  'corp_access_audit',
  'character_skills',
  'character_skill_syncs',
  'character_industry_jobs',
  'character_industry_job_syncs',
  'corp_industry_jobs',
  'corp_industry_job_syncs',
  'owned_assets',
  'owned_asset_syncs',
  'owned_blueprints',
  'owned_blueprint_syncs',
  'esi_snapshots',
  'esi_refresh_jobs',
  'usage_logs',
  'user_preferences',
  'custom_structures',
  'saved_plans',
] as const;

describe.skipIf(!reachable)('account-purge queries (real Postgres)', () => {
  let adminClient: ReturnType<typeof postgres>;
  let seedDb: ReturnType<typeof drizzlePg>;

  beforeAll(async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, SCHEMA));
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');

    adminClient = postgres(schemaUrl(baseUrl, SCHEMA), { max: 4, onnotice: () => {} });
    await setupDisposableSchema(adminClient, SCHEMA, TABLE_NAMES);
    await addForeignKey(adminClient, SCHEMA, {
      table: 'account',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    });
    await addForeignKey(adminClient, SCHEMA, {
      table: 'session',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    });
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
    revokeMock.mockReset();
    revokeMock.mockResolvedValue(undefined);
    const tables = TABLE_NAMES.map((table) => `"${SCHEMA}"."${table}"`).join(', ');
    await adminClient.unsafe(`TRUNCATE TABLE ${tables} CASCADE`);
    await seedDb.insert(user).values({
      id: USER_ID,
      name: 'Purge Pilot',
      email: syntheticEmail(FIRST_CHAR),
      activeCharacterId: FIRST_CHAR,
    });
  });

  async function seedCharacter(characterId: number) {
    await seedDb.insert(characters).values({
      characterId,
      name: `Character ${characterId}`,
      portraitUrl: `https://images.example/${characterId}`,
      preferences: { privateNote: `note-${characterId}` },
    });
  }

  async function seedEveAccount(
    id: string,
    characterId: number,
    createdAt: Date,
  ) {
    await seedDb.insert(account).values({
      id,
      accountId: String(characterId),
      providerId: 'eve',
      userId: USER_ID,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function seedCharacterCache(characterId: number) {
    await adminClient`
      INSERT INTO character_skills (character_id, total_sp, queue)
      VALUES (${characterId}, ${characterId}, '[]'::jsonb)
    `;
    await adminClient`
      INSERT INTO character_industry_jobs (character_id, jobs)
      VALUES (${characterId}, '[]'::jsonb)
    `;
    await seedDb.insert(usageLogs).values({
      characterId,
      action: 'auth_login',
      metadata: { seeded: true },
    });
  }

  async function seedUserData() {
    await seedDb.insert(userPreferences).values({
      userId: USER_ID,
      key: 'planner.default',
      value: { region: 10000002 },
    });
    await adminClient`
      INSERT INTO custom_structures
        (id, user_id, name, structure_type_id, rig_type_ids)
      VALUES
        ('custom-structure', ${USER_ID}, 'Private Structure', 35825, '[]'::jsonb)
    `;
    await adminClient`
      INSERT INTO saved_plans
        (id, user_id, name, blueprint_type_id, product_type_id, product_name, snapshot)
      VALUES
        (
          'saved-plan',
          ${USER_ID},
          'Private Plan',
          100,
          200,
          'Test Product',
          '{"v":1,"blueprintTypeId":100}'::jsonb
        )
    `;
    await adminClient`
      INSERT INTO corp_industry_jobs (user_id, corporation_id, jobs)
      VALUES (${USER_ID}, 98000041, '[]'::jsonb)
    `;
  }

  async function seedRetainedAudit() {
    await seedDb.insert(corpAccessAudit).values({
      userId: USER_ID,
      characterId: FIRST_CHAR,
      corporationId: 98000041,
      allowed: false,
      reason: 'retained-denial',
    });
  }

  async function countClonedRows(table: string, where = 'TRUE'): Promise<number> {
    const rows = await adminClient.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "${SCHEMA}"."${table}" WHERE ${where}`,
    );
    return rows[0]?.count ?? 0;
  }

  it('revokes before credential deletion and fully purges one character while retaining the user', async () => {
    await seedCharacter(FIRST_CHAR);
    await seedCharacter(SECOND_CHAR);
    await seedEveAccount('first', FIRST_CHAR, new Date('2026-07-01T00:00:00Z'));
    await seedEveAccount('second', SECOND_CHAR, new Date('2026-07-02T00:00:00Z'));
    await seedCharacterCache(FIRST_CHAR);
    await seedDb.insert(usageLogs).values({
      characterId: null,
      action: 'page_view',
      metadata: { anonymous: true },
    });
    await seedUserData();
    await seedRetainedAudit();

    let accountPresentDuringRevoke = false;
    revokeMock.mockImplementationOnce(async () => {
      const rows = await seedDb
        .select()
        .from(account)
        .where(eq(account.accountId, String(FIRST_CHAR)));
      accountPresentDuringRevoke = rows.length === 1;
    });

    await expect(purgeOwnCharacter(USER_ID, FIRST_CHAR)).resolves.toEqual({
      accountEmptied: false,
    });

    expect(accountPresentDuringRevoke).toBe(true);
    expect(
      await seedDb.select().from(account).where(eq(account.accountId, String(FIRST_CHAR))),
    ).toHaveLength(0);
    expect(await countClonedRows('character_skills', `character_id = ${FIRST_CHAR}`)).toBe(0);
    expect(await countClonedRows('character_industry_jobs', `character_id = ${FIRST_CHAR}`)).toBe(
      0,
    );
    expect(
      await seedDb.select().from(usageLogs).where(eq(usageLogs.characterId, FIRST_CHAR)),
    ).toHaveLength(0);
    expect(
      await seedDb.select().from(usageLogs).where(isNull(usageLogs.characterId)),
    ).toHaveLength(1);
    const [profile] = await seedDb
      .select({ preferences: characters.preferences })
      .from(characters)
      .where(eq(characters.characterId, FIRST_CHAR));
    expect(profile?.preferences).toEqual({});
    const [remainingUser] = await seedDb
      .select({ email: user.email, activeCharacterId: user.activeCharacterId })
      .from(user)
      .where(eq(user.id, USER_ID));
    expect(remainingUser).toEqual({
      email: syntheticEmail(SECOND_CHAR),
      activeCharacterId: SECOND_CHAR,
    });
    expect(await seedDb.select().from(userPreferences)).toHaveLength(1);
    expect(await countClonedRows('custom_structures')).toBe(1);
    expect(await countClonedRows('saved_plans')).toBe(1);
    expect(await seedDb.select().from(corpAccessAudit)).toHaveLength(1);
  });

  it('deletes a last-character user only after the credential row is gone', async () => {
    await seedCharacter(FIRST_CHAR);
    await seedEveAccount('only', FIRST_CHAR, new Date('2026-07-01T00:00:00Z'));
    await seedDb.insert(session).values({
      id: 'purge-session',
      token: 'purge-session-token',
      userId: USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(purgeOwnCharacter(USER_ID, FIRST_CHAR)).resolves.toEqual({
      accountEmptied: true,
    });

    expect(await seedDb.select().from(account)).toHaveLength(0);
    expect(await seedDb.select().from(user)).toHaveLength(0);
    expect(await seedDb.select().from(session)).toHaveLength(0);
  });

  it('nukes every character and user tier, retains the audit trail, and is idempotent', async () => {
    await seedCharacter(FIRST_CHAR);
    await seedCharacter(SECOND_CHAR);
    await seedEveAccount('first', FIRST_CHAR, new Date('2026-07-01T00:00:00Z'));
    await seedEveAccount('second', SECOND_CHAR, new Date('2026-07-02T00:00:00Z'));
    await seedCharacterCache(FIRST_CHAR);
    await seedCharacterCache(SECOND_CHAR);
    await seedUserData();
    await seedRetainedAudit();
    await seedDb.insert(session).values({
      id: 'nuke-session',
      token: 'nuke-session-token',
      userId: USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await nukeAccount(USER_ID);

    expect(revokeMock.mock.calls).toEqual([[FIRST_CHAR], [SECOND_CHAR]]);
    expect(await seedDb.select().from(account)).toHaveLength(0);
    expect(await countClonedRows('character_skills')).toBe(0);
    expect(await countClonedRows('character_industry_jobs')).toBe(0);
    expect(await seedDb.select().from(usageLogs)).toHaveLength(0);
    expect(await countClonedRows('corp_industry_jobs')).toBe(0);
    expect(await seedDb.select().from(userPreferences)).toHaveLength(0);
    expect(await countClonedRows('custom_structures')).toBe(0);
    expect(await countClonedRows('saved_plans')).toBe(0);
    expect(await seedDb.select().from(session)).toHaveLength(0);
    expect(await seedDb.select().from(user)).toHaveLength(0);
    expect(await seedDb.select().from(corpAccessAudit)).toHaveLength(1);

    await expect(nukeAccount(USER_ID)).resolves.toBeUndefined();
    expect(revokeMock.mock.calls).toEqual([[FIRST_CHAR], [SECOND_CHAR]]);
    expect(await seedDb.select().from(corpAccessAudit)).toHaveLength(1);
  });
});
