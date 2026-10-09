import { eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { usageLogs } from '@/data/telemetry/schema';
import { userPreferences } from '@/data/preferences/schema';
import { mapAccess, maps } from '@/data/maps/schema';
import {
  createDbTestHarness,
  seedCharacter as insertCharacter,
  seedEveAccount as insertEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';

const jobDatabase = vi.hoisted(() => ({ current: null as PostgresJsDatabase | null }));
vi.mock('@/db/deletion-client', () => ({ deletionDatabase: () => jobDatabase.current }));
const discovery = vi.hoisted(() => ({ original: undefined as undefined | ((limit: number) => Promise<DeletionJob[]>), read: vi.fn() }));
vi.mock('@/platform/auth/deletion-jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/auth/deletion-jobs')>();
  discovery.original = actual.readDeletionJobs;
  return { ...actual, readDeletionJobs: discovery.read };
});

const revokeMock = vi.hoisted(() => vi.fn());
const mapPurge = vi.hoisted(() => ({
  purgeMapChain: vi.fn().mockResolvedValue({ deleted: 0, remaining: false }),
}));
vi.mock('@/platform/auth/eve-token-service', () => ({
  revokeStoredCharacterToken: (ciphertext: string | null) => revokeMock(ciphertext),
}));
vi.mock('@/composition/map-purge', () => ({
  purgeMapChain: mapPurge.purgeMapChain,
}));

import { finishPendingDeletion, nukeAccount, purgeOwnCharacter, retryRequestedDeletions } from './account-purge';
import { enqueueDeletion, requestDeletion, readDeletionJobs, type DeletionJob } from '@/platform/auth/deletion-jobs';
import { pendingDeletions } from '@/platform/auth/deletion-schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { account, characters, corpAccessAudit, session, user } from '@/db/auth-schema';
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { deleteUserIfUnlinked, reconcileAfterCharacterRemoval } from '@/platform/auth/account-purge';
import { reassignCharacter } from '@/platform/auth/admin-users';

const SCHEMA = 'test_auth_account_purge';
const USER_ID = 'purge-user';
const FIRST_CHAR = 90000041;
const SECOND_CHAR = 90000042;

const TABLE_NAMES = [
  'user',
  'maps',
  'map_access',
  'map_blocks',
  'map_block_accounts',
  'map_access_changes',
  'account',
  'characters',
  'session',
  'corp_access_audit',
  'character_skills',
  'character_skill_syncs',
  'character_sheets',
  'character_industry_jobs',
  'character_industry_job_syncs',
  'corp_member_roles',
  'corp_member_bases',
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
  'industry_profiles',
  'net_worth_days',
  'pending_tracking_merges',
  'pending_deletions',
  'verification',
  'jwks',
] as const;

const harness = await createDbTestHarness({
  schema: SCHEMA,
  tables: TABLE_NAMES,
  foreignKeys: [
    { table: 'pending_tracking_merges', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    {
      table: 'maps',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'map_access',
      column: 'map_id',
      refTable: 'maps',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'map_blocks',
      column: 'map_id',
      refTable: 'maps',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'map_block_accounts',
      column: 'block_id',
      refTable: 'map_blocks',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'map_access_changes',
      column: 'map_id',
      refTable: 'maps',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'account',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'session',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'net_worth_days',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  steerDbProxy: true,
  env: {
    NEXT_PUBLIC_CONVEX_URL: '',
    CONVEX_SERVICE_SECRET: '',
    BETTER_AUTH_SECRET: 'account-purge-runtime-test-secret-32chars',
    BETTER_AUTH_URL: 'http://localhost:3000',
    EVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  },
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('account-purge queries (real Postgres)', () => {
  beforeEach(async () => {
    jobDatabase.current = harness.db;
    discovery.read.mockReset().mockImplementation(discovery.original!);
    revokeMock.mockReset();
    revokeMock.mockResolvedValue(undefined);
    mapPurge.purgeMapChain.mockReset().mockResolvedValue({
      deleted: 0,
      remaining: false,
    });
    await seedUser(harness.db, USER_ID, {
      name: 'Purge Pilot',
      email: syntheticEmail(FIRST_CHAR),
      activeCharacterId: FIRST_CHAR,
    });
  });

  async function seedCharacter(characterId: number) {
    await insertCharacter(harness.db, characterId, {
      portraitUrl: `https://images.example/${characterId}`,
    });
  }

  async function seedEveAccount(
    id: string,
    characterId: number,
    createdAt: Date,
  ) {
    await insertEveAccount(harness.db, { id, characterId, userId: USER_ID }, {
      createdAt,
      updatedAt: createdAt,
      refreshToken: `grant-${characterId}`,
    });
  }

  async function seedCharacterCache(characterId: number) {
    await harness.sql`
      INSERT INTO character_skills (character_id, total_sp, queue)
      VALUES (${characterId}, ${characterId}, '[]'::jsonb)
    `;
    await harness.sql`
      INSERT INTO character_industry_jobs (character_id, jobs)
      VALUES (${characterId}, '[]'::jsonb)
    `;
    await harness.sql`
      INSERT INTO character_sheets (character_id, sections, last_refreshed_at)
      VALUES (${characterId}, '{}'::jsonb, now())
    `;
    await harness.sql`
      INSERT INTO corp_member_roles (character_id, corporation_id, roles, roles_at_hq, roles_at_base, roles_at_other, fetched_at)
      VALUES (${characterId}, 98000001, '{Director}', '{}', '{}', '{}', now())
    `;
    await harness.sql`
      INSERT INTO corp_member_bases (character_id, corporation_id, base_id)
      VALUES (${characterId}, 98000001, 60003760)
    `;
    await harness.db.insert(usageLogs).values({
      characterId,
      action: 'auth_login',
      metadata: { seeded: true },
    });
  }

  async function seedUserData() {
    await harness.sql`
      INSERT INTO net_worth_days (user_id, day, net_worth, liquid_isk, pilots_included, pilots_total, pilots, recorded_at)
      VALUES (${USER_ID}, '2026-09-27', 1, 1, 1, 1, '{}'::jsonb, now())
    `;
    await harness.db.insert(maps).values({
      id: '11111111-1111-4111-8111-111111111111',
      userId: USER_ID,
      name: 'Purge map',
    });
    await harness.db.insert(mapAccess).values([
      {
        mapId: '11111111-1111-4111-8111-111111111111',
        ownerType: 'character',
        ownerId: FIRST_CHAR,
        role: 'editor',
      },
      {
        mapId: '11111111-1111-4111-8111-111111111111',
        ownerType: 'corporation',
        ownerId: 98000041,
        role: 'viewer',
      },
    ]);
    await harness.db.insert(userPreferences).values({
      userId: USER_ID,
      key: 'planner.default',
      value: { region: 10000002 },
    });
    await harness.sql`
      INSERT INTO custom_structures
        (id, user_id, name, structure_type_id, rig_type_ids)
      VALUES
        ('custom-structure', ${USER_ID}, 'Private Structure', 35825, '[]'::jsonb)
    `;
    await harness.sql`
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
    await harness.sql`
      INSERT INTO corp_industry_jobs (user_id, corporation_id, jobs)
      VALUES (${USER_ID}, 98000041, '[]'::jsonb)
    `;
  }

  async function seedRetainedAudit() {
    await harness.db.insert(corpAccessAudit).values({
      userId: USER_ID,
      characterId: FIRST_CHAR,
      corporationId: 98000041,
      allowed: false,
      reason: 'retained-denial',
    });
  }

  async function countClonedRows(table: string, where = 'TRUE'): Promise<number> {
    const rows = await harness.sql.unsafe<{ count: number }[]>(
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
    await harness.db.insert(usageLogs).values({
      characterId: null,
      action: 'page_view',
      metadata: { anonymous: true },
    });
    await seedUserData();
    await seedRetainedAudit();

    let accountPresentDuringRevoke = false;
    revokeMock.mockImplementationOnce(async () => {
      const rows = await harness.db
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
      await harness.db.select().from(account).where(eq(account.accountId, String(FIRST_CHAR))),
    ).toHaveLength(0);
    expect(await countClonedRows('character_skills', `character_id = ${FIRST_CHAR}`)).toBe(0);
    expect(await countClonedRows('character_industry_jobs', `character_id = ${FIRST_CHAR}`)).toBe(
      0,
    );
    expect(await countClonedRows('character_sheets', `character_id = ${FIRST_CHAR}`)).toBe(0);
    expect(await countClonedRows('corp_member_roles', `character_id = ${FIRST_CHAR}`)).toBe(0);
    expect(await countClonedRows('corp_member_bases', `character_id = ${FIRST_CHAR}`)).toBe(0);
    expect(
      await harness.db.select().from(usageLogs).where(eq(usageLogs.characterId, FIRST_CHAR)),
    ).toHaveLength(0);
    expect(
      await harness.db.select().from(usageLogs).where(isNull(usageLogs.characterId)),
    ).toHaveLength(1);
    const [profile] = await harness.db
      .select({ characterId: characters.characterId, name: characters.name })
      .from(characters)
      .where(eq(characters.characterId, FIRST_CHAR));
    expect(profile).toEqual({
      characterId: FIRST_CHAR,
      name: `Character ${FIRST_CHAR}`,
    });
    const [remainingUser] = await harness.db
      .select({ email: user.email, activeCharacterId: user.activeCharacterId })
      .from(user)
      .where(eq(user.id, USER_ID));
    expect(remainingUser).toEqual({
      email: syntheticEmail(SECOND_CHAR),
      activeCharacterId: SECOND_CHAR,
    });
    expect(await harness.db.select().from(userPreferences)).toHaveLength(1);
    expect(await countClonedRows('custom_structures')).toBe(1);
    expect(await countClonedRows('saved_plans')).toBe(1);
    expect(await countClonedRows('net_worth_days')).toBe(1);
    expect(await harness.db.select().from(maps)).toHaveLength(1);
    expect(await harness.db.select().from(mapAccess)).toMatchObject([
      { ownerType: 'corporation', ownerId: 98000041 },
    ]);
    expect(await harness.db.select().from(corpAccessAudit)).toHaveLength(1);
  });

  it('deletes a last-character user only after the credential row is gone', async () => {
    await seedCharacter(FIRST_CHAR);
    await seedEveAccount('only', FIRST_CHAR, new Date('2026-07-01T00:00:00Z'));
    await harness.db.insert(session).values({
      id: 'purge-session',
      token: 'purge-session-token',
      userId: USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(purgeOwnCharacter(USER_ID, FIRST_CHAR)).resolves.toEqual({
      accountEmptied: true,
    });

    expect(await harness.db.select().from(account)).toHaveLength(0);
    expect(await harness.db.select().from(user)).toHaveLength(0);
    expect(await harness.db.select().from(session)).toHaveLength(0);
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
    await harness.db.insert(session).values({
      id: 'nuke-session',
      token: 'nuke-session-token',
      userId: USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await nukeAccount(USER_ID);

    expect(mapPurge.purgeMapChain).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(revokeMock.mock.calls).toEqual([[`grant-${FIRST_CHAR}`], [`grant-${SECOND_CHAR}`]]);
    expect(await harness.db.select().from(account)).toHaveLength(0);
    expect(await countClonedRows('character_skills')).toBe(0);
    expect(await countClonedRows('character_industry_jobs')).toBe(0);
    expect(await countClonedRows('character_sheets')).toBe(0);
    expect(await countClonedRows('corp_member_roles')).toBe(0);
    expect(await countClonedRows('corp_member_bases')).toBe(0);
    expect(await harness.db.select().from(usageLogs)).toHaveLength(0);
    expect(await countClonedRows('corp_industry_jobs')).toBe(0);
    expect(await harness.db.select().from(userPreferences)).toHaveLength(0);
    expect(await countClonedRows('custom_structures')).toBe(0);
    expect(await countClonedRows('saved_plans')).toBe(0);
    expect(await countClonedRows('net_worth_days')).toBe(0);
    expect(await harness.db.select().from(maps)).toHaveLength(0);
    expect(await harness.db.select().from(mapAccess)).toHaveLength(0);
    expect(await harness.db.select().from(session)).toHaveLength(0);
    expect(await harness.db.select().from(user)).toHaveLength(0);
    expect(await harness.db.select().from(corpAccessAudit)).toHaveLength(1);

    await expect(nukeAccount(USER_ID)).resolves.toBeUndefined();
    expect(revokeMock.mock.calls).toEqual([[`grant-${FIRST_CHAR}`], [`grant-${SECOND_CHAR}`]]);
    expect(await harness.db.select().from(corpAccessAudit)).toHaveLength(1);
  });

  function gate() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
  }

  async function createFreshAuthLink() {
    const { createAuth } = await import('@/platform/auth/auth');
    const auth = createAuth({
      runners: {
        runBeforeUserDelete: async () => {},
        runBeforeCharacterUnlink: async () => [],
        runAfterFailedCharacterUnlink: async () => {},
        runAfterCharacterUnlink: async () => {},
        runAfterCharacterLinkChanged: async () => {},
      },
      proveCharacter: async () => ({ kind: 'none' }),
      refreshCharacterAffiliations: async () => {},
    });
    await (await auth.$context).internalAdapter.createAccount({
      userId: USER_ID, providerId: 'eve', accountId: String(SECOND_CHAR), refreshToken: 'fresh-grant',
    });
    const [fresh] = await harness.db.select().from(account).where(eq(account.accountId, String(SECOND_CHAR)));
    expect(fresh?.refreshToken).toBeTruthy();
    expect(fresh?.refreshToken).not.toBe('fresh-grant');
    return fresh!.refreshToken;
  }

  it('purges a fresh Better Auth link committed after whole-user deletion finishes enumerating links', async () => {
    await seedEveAccount('old', FIRST_CHAR, new Date());
    await seedUserData();
    await seedCharacter(SECOND_CHAR);
    const entered = gate();
    const resume = gate();
    mapPurge.purgeMapChain.mockImplementationOnce(async () => {
      entered.release();
      await resume.promise;
      return { deleted: 0, remaining: false };
    });
    const deletion = nukeAccount(USER_ID);
    await entered.promise;
    let freshGrant: string | null | undefined;
    try {
      freshGrant = await createFreshAuthLink();
      await seedCharacterCache(SECOND_CHAR);
    } finally {
      resume.release();
    }
    await deletion;
    expect(revokeMock).toHaveBeenCalledWith(freshGrant);
    expect(await countClonedRows('character_skills', `character_id = ${SECOND_CHAR}`)).toBe(0);
    expect(await harness.db.select().from(user)).toHaveLength(0);
    expect(await harness.db.select().from(pendingDeletions)).toHaveLength(0);
  });

  it.each([false, true])('keeps fresh-link reconciliation separate from explicit whole-user intent (requested: %s)', async (requested) => {
    const request = requested ? await requestDeletion(USER_ID) : null;
    const entered = gate();
    const resume = gate();
    const afterLink = vi.fn().mockResolvedValue(undefined);
    const reconciliation = reconcileAfterCharacterRemoval(USER_ID, FIRST_CHAR, {
      runBeforeUserDelete: async () => { entered.release(); await resume.promise; },
      runBeforeCharacterUnlink: async () => [],
      runAfterFailedCharacterUnlink: async () => {},
      runAfterCharacterUnlink: async () => {},
      runAfterCharacterLinkChanged: afterLink,
    });
    await entered.promise;
    let freshGrant: string | null | undefined;
    try {
      freshGrant = await createFreshAuthLink();
    } finally {
      resume.release();
    }
    expect(await reconciliation).toEqual({ accountEmptied: false });
    expect((await harness.db.select().from(account))[0]?.refreshToken).toBe(freshGrant);
    expect((await harness.db.select().from(user))[0]).toMatchObject({
      email: syntheticEmail(SECOND_CHAR), activeCharacterId: SECOND_CHAR,
      deletionRequestedAt: request?.requestedAt ?? null,
    });
    expect(afterLink).toHaveBeenCalledExactlyOnceWith({ userId: USER_ID, characterId: SECOND_CHAR });
    expect(revokeMock).not.toHaveBeenCalled();
    expect(await retryRequestedDeletions(Date.now() + 60000)).toEqual({ retried: requested ? 1 : 0, failed: 0 });
    expect(await harness.db.select().from(user)).toHaveLength(requested ? 0 : 1);
    if (requested) expect(revokeMock).toHaveBeenCalledWith(freshGrant);
    else expect(revokeMock).not.toHaveBeenCalled();
  });

  it('preserves a fresh Better Auth link that arrives during admin reassignment cleanup through the daily retry', async () => {
    await seedEveAccount('moved', FIRST_CHAR, new Date());
    await seedCharacter(SECOND_CHAR);
    await seedUser(harness.db, 'admin-target');
    const entered = gate();
    const resume = gate();
    const afterLink = vi.fn().mockResolvedValue(undefined);
    const reassignment = reassignCharacter({
      fromUserId: USER_ID, toUserId: 'admin-target', characterId: FIRST_CHAR,
      runners: {
        runBeforeUserDelete: async () => { entered.release(); await resume.promise; },
        runBeforeCharacterUnlink: async () => [],
        runAfterFailedCharacterUnlink: async () => {},
        runAfterCharacterUnlink: async () => {},
        runAfterCharacterLinkChanged: afterLink,
      },
    });
    await entered.promise;
    let freshGrant: string | null | undefined;
    try {
      freshGrant = await createFreshAuthLink();
    } finally {
      resume.release();
    }
    expect(await reassignment).toEqual({ sourceDeleted: false });
    expect((await harness.db.select().from(user).where(eq(user.id, USER_ID)))[0]).toMatchObject({
      email: syntheticEmail(SECOND_CHAR), activeCharacterId: SECOND_CHAR, deletionRequestedAt: null,
    });
    expect(afterLink).toHaveBeenCalledWith({ userId: USER_ID, characterId: SECOND_CHAR });
    expect(await retryRequestedDeletions(Date.now() + 60000)).toEqual({ retried: 0, failed: 0 });
    expect((await harness.db.select().from(account).where(eq(account.userId, USER_ID)))[0]?.refreshToken).toBe(freshGrant);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('waits for an in-flight account FK insert before deciding whether the user is empty', async () => {
    const inserted = gate();
    const commit = gate();
    const insertion = harness.db.transaction(async (tx) => {
      await insertEveAccount(tx, { id: 'in-flight', userId: USER_ID, characterId: SECOND_CHAR });
      inserted.release();
      await commit.promise;
    });
    await inserted.promise;
    const deletion = deleteUserIfUnlinked(USER_ID);
    let blocked = false;
    try {
      for (let pass = 0; pass < 100; pass += 1) {
        const [row] = await harness.sql<{ n: number }[]>`select count(*)::int n from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0 and query like '%for update%'`;
        if (row!.n > 0) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      commit.release();
    }
    await insertion;
    expect(await deletion).toBe(false);
    expect(blocked).toBe(true);
    expect(await harness.db.select().from(user)).toHaveLength(1);
    expect(await harness.db.select().from(account)).toHaveLength(1);
  });

  it('retains whole-user deletion for retry when a malformed EVE link cannot be purged', async () => {
    await insertEveAccount(harness.db, { id: 'malformed', userId: USER_ID, characterId: FIRST_CHAR });
    await harness.db.update(account).set({ accountId: 'not-a-character' }).where(eq(account.id, 'malformed'));
    await expect(nukeAccount(USER_ID)).rejects.toThrow('Cannot purge malformed EVE character identifier');
    expect(await harness.db.select().from(user)).toHaveLength(1);
    expect(await harness.db.select().from(account)).toHaveLength(1);
    expect(await harness.db.select().from(pendingDeletions)).toHaveLength(1);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  async function queueCharacter(characterId: number, userId = USER_ID) {
    const request = await requestDeletion(userId, characterId);
    expect(request).not.toBeNull();
    return enqueueDeletion(request!);
  }

  it('ignores a stale discovered job after OAuth completes deletion and the same user relinks fresh data', async () => {
    await seedEveAccount('old', FIRST_CHAR, new Date());
    await seedEveAccount('other', SECOND_CHAR, new Date());
    await seedCharacterCache(FIRST_CHAR);
    await queueCharacter(FIRST_CHAR);
    const captured = gate();
    const resume = gate();
    discovery.read.mockImplementationOnce(async (limit: number) => {
      const rows = await discovery.original!(limit);
      captured.release();
      await resume.promise;
      return rows;
    });
    const cron = retryRequestedDeletions(Date.now() + 60000);
    await captured.promise;
    await finishPendingDeletion(FIRST_CHAR);
    await insertEveAccount(harness.db, { id: 'fresh', characterId: FIRST_CHAR, userId: USER_ID }, { refreshToken: 'fresh-grant' });
    await seedCharacterCache(FIRST_CHAR);
    resume.release();
    expect(await cron).toEqual({ retried: 0, failed: 0 });
    expect(await harness.db.select().from(account).where(eq(account.id, 'fresh'))).toMatchObject([{ refreshToken: 'fresh-grant', deletionRequestedAt: null }]);
    expect(await countClonedRows('character_skills', `character_id = ${FIRST_CHAR}`)).toBe(1);
    expect(revokeMock).not.toHaveBeenCalledWith('fresh-grant');
  });

  it('serializes duplicate finishers on the real job row and revokes the original grant once', async () => {
    await seedEveAccount('old', FIRST_CHAR, new Date());
    await seedEveAccount('other', SECOND_CHAR, new Date());
    await queueCharacter(FIRST_CHAR);
    const entered = gate();
    const resume = gate();
    revokeMock.mockImplementationOnce(async () => { entered.release(); await resume.promise; });
    const cron = retryRequestedDeletions(Date.now() + 60000);
    await entered.promise;
    const oauth = finishPendingDeletion(FIRST_CHAR);
    let blocked = false;
    for (let pass = 0; pass < 100; pass += 1) {
      const [row] = await harness.sql<{ n: number }[]>`select count(*)::int n from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0 and query like '%pending_deletions%'`;
      if (row!.n > 0) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    resume.release();
    await Promise.all([cron, oauth]);
    expect(blocked).toBe(true);
    expect(revokeMock).toHaveBeenCalledExactlyOnceWith(`grant-${FIRST_CHAR}`);
    expect(await harness.db.select().from(pendingDeletions)).toHaveLength(0);
  });

  it('retains the independent receipt after unlink and resumes reconciliation without another character purge', async () => {
    await seedEveAccount('old', FIRST_CHAR, new Date());
    await seedUserData();
    mapPurge.purgeMapChain.mockRejectedValueOnce(new Error('Convex unavailable'));
    await expect(purgeOwnCharacter(USER_ID, FIRST_CHAR)).rejects.toThrow('Convex unavailable');
    expect(await harness.db.select().from(account)).toHaveLength(0);
    expect(await harness.db.select().from(pendingDeletions)).toHaveLength(1);
    expect((await harness.db.select().from(user))[0]?.deletionRequestedAt).toBeNull();
    await finishPendingDeletion(FIRST_CHAR);
    expect(revokeMock).toHaveBeenCalledOnce();
    expect(await harness.db.select().from(user)).toHaveLength(0);
    expect(await harness.db.select().from(pendingDeletions)).toHaveLength(0);
  });

  it('keeps incoming whole-user intent while a character job fails, then drains both scopes', async () => {
    await seedEveAccount('old', FIRST_CHAR, new Date());
    await seedEveAccount('other', SECOND_CHAR, new Date());
    await queueCharacter(FIRST_CHAR);
    revokeMock.mockRejectedValueOnce(new Error('fixture purge unavailable'));
    await expect(nukeAccount(USER_ID)).rejects.toThrow('fixture purge unavailable');
    expect((await harness.db.select().from(user))[0]?.deletionRequestedAt).not.toBeNull();
    expect((await harness.db.select().from(pendingDeletions))[0]?.scope).toBe('character');
    await finishPendingDeletion(SECOND_CHAR);
    expect(await harness.db.select().from(account)).toHaveLength(0);
    expect(await harness.db.select().from(user)).toHaveLength(0);
    expect(await harness.db.select().from(pendingDeletions)).toHaveLength(0);
  });

  it('moves failed old jobs behind a newly queued request without changing their request identity', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    await seedEveAccount('old', FIRST_CHAR, old);
    const first = await queueCharacter(FIRST_CHAR);
    await harness.db.update(pendingDeletions).set({ queuedAt: old }).where(eq(pendingDeletions.id, first!.id));
    revokeMock.mockRejectedValueOnce(new Error('fixture failure'));
    const error = silenceConsolePrefixes('error', ['[account-purge] requested deletion retry failed']);
    expect(await retryRequestedDeletions(Date.now() + 60000)).toEqual({ retried: 0, failed: 1 });
    error.mockRestore();
    const [retained] = await harness.db.select().from(pendingDeletions);
    expect(retained!.id).toBe(first!.id);
    expect(retained!.requestedAt).toEqual(first!.requestedAt);
    expect(retained!.queuedAt.getTime()).toBeGreaterThan(old.getTime());
    await seedUser(harness.db, 'new-owner');
    await insertEveAccount(harness.db, { id: 'new-link', characterId: 90000099, userId: 'new-owner' });
    const newer = await queueCharacter(90000099, 'new-owner');
    await harness.db.update(pendingDeletions).set({ queuedAt: old }).where(eq(pendingDeletions.id, newer!.id));
    expect((await readDeletionJobs(1))[0]?.id).toBe(newer!.id);
  });

});
