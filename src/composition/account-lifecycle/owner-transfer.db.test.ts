import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usageLogs } from '@/data/telemetry/schema';
import { mapAccess, maps, pendingMapAccessChanges } from '@/data/maps/schema';
import { netWorthDays } from '@/features/net-worth/schema';
import {
  createDbTestHarness,
  seedCharacter as insertCharacter,
  seedEveAccount as insertEveAccount,
  seedUser as insertUser,
} from '@/db/__tests__/support/db-test-harness';

const mergeDatabase = vi.hoisted(() => ({ current: null as PostgresJsDatabase | null }));
const after = vi.hoisted(() => vi.fn());

vi.mock('next/server', () => ({ after }));
vi.mock('./account-merge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./account-merge')>();
  return {
    ...actual,
    mergeUsers: (request: Parameters<typeof actual.mergeUsers>[0]) =>
      actual.mergeUsers(request, { database: mergeDatabase.current ?? undefined }),
  };
});
vi.mock('@/data/location-tracking/merge', () => ({ snapshotMergeTracking: vi.fn().mockResolvedValue([]) }));
vi.mock('@/platform/auth/eve-token-service', () => ({ revokeStoredCharacterToken: vi.fn() }));
vi.mock('@/lib/convex-http-door', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/convex-http-door')>();
  return {
    ...actual,
    postConvexHttpDoor: (options: Parameters<typeof actual.postConvexHttpDoor>[0]) =>
      options.path === '/purge-user-map-claims'
        ? Promise.resolve(options.schema.parse({ deleted: 1 }))
        : actual.postConvexHttpDoor(options),
  };
});

import { encryptToken } from '@/platform/auth/token-crypto';
import { proveCharacter, purgeTransferredCharacter } from './owner-transfer';
import { account, characters, session, user } from '@/db/auth-schema';
import { syntheticEmail } from '@/platform/auth/synthetic-email';

const harness = await createDbTestHarness({
  schema: 'test_auth_owner_transfer',
  tables: [
    'user',
    'maps',
    'map_access',
    'map_access_changes',
    'account',
    'characters',
    'session',
    'usage_logs',
    'character_skills',
    'corp_access_audit',
    'user_preferences',
    'net_worth_days',
    'corp_industry_jobs',
    'corp_industry_job_syncs',
    'saved_plans',
    'custom_structures',
    'esi_refresh_jobs',
    'pending_tracking_merges',
    'pending_deletions',
  ],
  foreignKeys: [
    { table: 'pending_tracking_merges', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'session', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  env: {
    NEXT_PUBLIC_CONVEX_URL: '',
    CONVEX_SERVICE_SECRET: '',
    EVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  },
  resetBetweenTests: 'truncate',
});

const SOURCE_ID = 'transfer-source';
const TARGET_ID = 'transfer-target';
const MOVED_CHAR = 90000031;
const SURVIVOR_CHAR = 90000032;
const H1 = 'owner-one';
const H2 = 'owner-two';

const eveToken = (owner: string): string =>
  `h.${Buffer.from(JSON.stringify({ sub: `CHARACTER:EVE:${MOVED_CHAR}`, owner })).toString('base64url')}.s`;

describe.skipIf(!harness.reachable)('owner-transfer queries (real Postgres)', () => {
  beforeEach(async () => {
    mergeDatabase.current = harness.db;
    after.mockReset();
    await seedUser(SOURCE_ID, MOVED_CHAR, new Date('2026-02-01T00:00:00Z'));
    await seedUser(TARGET_ID, null, new Date('2026-01-01T00:00:00Z'));
  });

  async function seedUser(id: string, activeCharacterId: number | null, createdAt: Date) {
    await insertUser(harness.db, id, {
      email: syntheticEmail(activeCharacterId ?? 90000999),
      activeCharacterId,
      createdAt,
    });
  }

  async function seedCharacter(characterId: number) {
    await insertCharacter(harness.db, characterId, {
      portraitUrl: `https://images.example/${characterId}`,
    });
  }

  async function seedEveAccount(
    id: string,
    characterId: number,
    userId: string,
    ownerHash: string | null,
    extra: { createdAt?: Date; accessToken?: string | null } = {},
  ) {
    const createdAt = extra.createdAt ?? new Date();
    await insertEveAccount(harness.db, { id, characterId, userId }, {
      ownerHash,
      accessToken: extra.accessToken ?? null,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function readAccount(characterId: number) {
    const [row] = await harness.db
      .select({ ownerHash: account.ownerHash, userId: account.userId })
      .from(account)
      .where(eq(account.accountId, String(characterId)))
      .limit(1);
    return row;
  }

  async function userIds(): Promise<string[]> {
    return (await harness.db.select({ id: user.id }).from(user)).map((row) => row.id).sort();
  }

  it('pins null-claim, first-link, backfill, and matching-hash reconcile branches', async () => {
    await expect(proveCharacter({ characterId: MOVED_CHAR, ownerHash: null, linkingUserId: null })).resolves.toEqual({ kind: 'none' });
    await expect(proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId: null })).resolves.toEqual({ kind: 'none' });
    expect(await readAccount(MOVED_CHAR)).toBeUndefined();

    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, null);
    await proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId: null });
    expect(await readAccount(MOVED_CHAR)).toEqual({ ownerHash: H1, userId: SOURCE_ID });

    await proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId: SOURCE_ID });
    expect(await readAccount(MOVED_CHAR)).toEqual({ ownerHash: H1, userId: SOURCE_ID });
    expect(await userIds()).toEqual([SOURCE_ID, TARGET_ID]);
  });

  it('uses the credential tier on owner mismatch, deleting custody but retaining cache rows', async () => {
    await seedCharacter(MOVED_CHAR);
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, H1);
    await harness.db.insert(session).values({
      id: 'source-session',
      token: 'source-session-token',
      userId: SOURCE_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await harness.sql`
      INSERT INTO character_skills (character_id, total_sp, queue)
      VALUES (${MOVED_CHAR}, 123, '[]'::jsonb)
    `;
    await harness.db.insert(usageLogs).values({
      characterId: MOVED_CHAR,
      action: 'auth_login',
      metadata: { source: 'before-transfer' },
    });
    await harness.db.insert(maps).values({
      id: '11111111-1111-4111-8111-111111111111',
      userId: TARGET_ID,
      name: 'Target map',
    });
    await harness.db.insert(mapAccess).values({
      mapId: '11111111-1111-4111-8111-111111111111',
      ownerType: 'character',
      ownerId: MOVED_CHAR,
      role: 'editor',
    });

    await expect(proveCharacter({ characterId: MOVED_CHAR, ownerHash: H2, linkingUserId: null })).resolves.toEqual({ kind: 'none' });

    expect(await readAccount(MOVED_CHAR)).toBeUndefined();
    expect(await userIds()).toEqual([TARGET_ID]);
    expect(
      await harness.db.select().from(session).where(eq(session.userId, SOURCE_ID)),
    ).toHaveLength(0);
    const [skillRow] = await harness.sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM character_skills
      WHERE character_id = ${MOVED_CHAR}
    `;
    expect(skillRow?.count).toBe(1);
    expect(
      await harness.db.select().from(usageLogs).where(eq(usageLogs.characterId, MOVED_CHAR)),
    ).toHaveLength(1);
    expect(await harness.db.select().from(maps)).toHaveLength(1);
    expect(await harness.db.select().from(mapAccess)).toHaveLength(0);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([
      expect.objectContaining({
        mapId: '11111111-1111-4111-8111-111111111111',
        version: expect.any(String),
      }),
    ]);
    const [profile] = await harness.db
      .select({ characterId: characters.characterId, name: characters.name })
      .from(characters)
      .where(eq(characters.characterId, MOVED_CHAR));
    expect(profile).toEqual({
      characterId: MOVED_CHAR,
      name: `Character ${MOVED_CHAR}`,
    });
  });

  it('keeps a prior owner with siblings, rebinding identity email and active character', async () => {
    await seedCharacter(MOVED_CHAR);
    await seedEveAccount('survivor', SURVIVOR_CHAR, SOURCE_ID, H1, { createdAt: new Date('2026-07-01T00:00:00Z') });
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, H1, { createdAt: new Date('2026-07-02T00:00:00Z') });

    await harness.db.insert(netWorthDays).values([
      { userId: SOURCE_ID, day: '2026-09-26', netWorth: 500, liquidIsk: 500, pilotsIncluded: 1, pilotsTotal: 2,
        pilots: { [MOVED_CHAR]: { netWorth: 500, liquidIsk: 500 } }, recordedAt: new Date() },
      { userId: SOURCE_ID, day: '2026-09-27', netWorth: 200, liquidIsk: 200, pilotsIncluded: 1, pilotsTotal: 2,
        pilots: { [SURVIVOR_CHAR]: { netWorth: 200, liquidIsk: 200 } }, recordedAt: new Date() },
    ]);

    await purgeTransferredCharacter(SOURCE_ID, MOVED_CHAR);

    expect((await harness.db.select().from(netWorthDays)).map((row) => row.day)).toEqual(['2026-09-27']);

    const [source] = await harness.db
      .select({ email: user.email, activeCharacterId: user.activeCharacterId })
      .from(user)
      .where(eq(user.id, SOURCE_ID));
    expect(source).toEqual({
      email: syntheticEmail(SURVIVOR_CHAR),
      activeCharacterId: SURVIVOR_CHAR,
    });
    expect(await readAccount(MOVED_CHAR)).toBeUndefined();
    expect((await readAccount(SURVIVOR_CHAR))?.ownerHash).toBe(H1);
  });

  it('merges a cross-user link proof onto the older user and reports the survivor', async () => {
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, H1);

    await expect(
      proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId: TARGET_ID }),
    ).resolves.toEqual({ kind: 'merged', survivorUserId: TARGET_ID, sourceUserId: SOURCE_ID });

    expect(await readAccount(MOVED_CHAR)).toEqual({ ownerHash: H1, userId: TARGET_ID });
    expect(await userIds()).toEqual([TARGET_ID]);
    expect(after).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      const [event] = await harness.db
        .select()
        .from(usageLogs)
        .where(eq(usageLogs.action, 'auth_merge'))
        .limit(1);
      expect(event).toMatchObject({
        characterId: MOVED_CHAR,
        metadata: { sourceUserId: SOURCE_ID, survivorUserId: TARGET_ID, movedCharacterIds: [MOVED_CHAR] },
      });
    });
  });

  it('derives a null owner hash from the stored token: a match backfills and merges', async () => {
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, null, { accessToken: encryptToken(eveToken(H1)) });

    await expect(
      proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId: TARGET_ID }),
    ).resolves.toEqual({ kind: 'merged', survivorUserId: TARGET_ID, sourceUserId: SOURCE_ID });
    expect(await readAccount(MOVED_CHAR)).toEqual({ ownerHash: H1, userId: TARGET_ID });
    expect(await userIds()).toEqual([TARGET_ID]);
  });

  it.each(
    [null, TARGET_ID].flatMap((linkingUserId) =>
      ['id', 'user', 'owner', 'token'].map((changed) => ({ linkingUserId, changed })),
    ),
  )('does not backfill changed evidence ($changed, linking user $linkingUserId)', async ({ linkingUserId, changed }) => {
    const originalToken = encryptToken(eveToken(H1));
    const replacementToken = encryptToken(eveToken(H2));
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, null, { accessToken: originalToken });
    const blocker = await harness.sql.reserve();
    let proof: ReturnType<typeof proveCharacter> | undefined;
    try {
      await blocker`BEGIN`;
      await blocker`SET LOCAL idle_in_transaction_session_timeout = '10s'`;
      await blocker`
        UPDATE account SET
          id = CASE WHEN ${changed} = 'id' THEN 'replacement' ELSE id END,
          user_id = CASE WHEN ${changed} = 'user' THEN ${TARGET_ID} ELSE user_id END,
          owner_hash = CASE WHEN ${changed} = 'owner' THEN ${H2} ELSE owner_hash END,
          access_token = CASE WHEN ${changed} = 'token' THEN ${replacementToken} ELSE access_token END
        WHERE id = 'moved'
      `;
      const [holder] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      // The proof sees the committed legacy row, then waits to backfill behind the changed row.
      proof = proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId });
      await expect.poll(async () => {
        const [row] = await harness.sql<{ count: number }[]>`
          SELECT count(*)::integer AS count FROM pg_stat_activity
          WHERE ${holder!.pid} = ANY(pg_blocking_pids(pid))
        `;
        return row?.count;
      }, { timeout: 3_000, interval: 20 }).toBe(1);
      await blocker`COMMIT`;
      await expect(proof).resolves.toEqual({ kind: 'none' });
      const [stored] = await harness.db.select().from(account);
      expect(stored).toMatchObject({
        id: changed === 'id' ? 'replacement' : 'moved',
        userId: changed === 'user' ? TARGET_ID : SOURCE_ID,
        ownerHash: changed === 'owner' ? H2 : null,
        accessToken: changed === 'token' ? replacementToken : originalToken,
      });
      expect(await userIds()).toEqual([SOURCE_ID, TARGET_ID]);
      expect(after).not.toHaveBeenCalled();
    } finally {
      await blocker`ROLLBACK`;
      blocker.release();
      await proof;
    }
  });

  it('derives a null owner hash from the stored token: a mismatch purges the sold character', async () => {
    await seedCharacter(MOVED_CHAR);
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, null, { accessToken: encryptToken(eveToken(H2)) });

    await expect(
      proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId: TARGET_ID }),
    ).resolves.toEqual({ kind: 'none' });
    expect(await readAccount(MOVED_CHAR)).toBeUndefined();
    expect(await userIds()).toEqual([TARGET_ID]);
    expect(after).not.toHaveBeenCalled();
  });

  it('neither merges nor purges a cross-user link when the row has no owner evidence', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, null, { accessToken: null });

    await expect(
      proveCharacter({ characterId: MOVED_CHAR, ownerHash: H1, linkingUserId: TARGET_ID }),
    ).resolves.toEqual({ kind: 'none' });
    expect(await readAccount(MOVED_CHAR)).toEqual({ ownerHash: null, userId: SOURCE_ID });
    expect(await userIds()).toEqual([SOURCE_ID, TARGET_ID]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
