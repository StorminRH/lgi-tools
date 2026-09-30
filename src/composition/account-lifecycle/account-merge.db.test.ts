import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PURGE_CONTRIBUTORS } from '@/composition/purge/register-all';
import { snapshotMergeTracking } from '@/data/location-tracking/merge';
import { pendingTrackingMerges } from '@/data/location-tracking/schema';
import { esiRefreshJobs } from '@/data/esi-refresh-jobs/schema';
import { mapAccess, maps, pendingMapAccessChanges } from '@/data/maps/schema';
import { userPreferences } from '@/data/preferences/schema';
import { usageLogs } from '@/data/telemetry/schema';
import { account, corpAccessAudit, session, user } from '@/db/auth-schema';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { customStructures } from '@/features/custom-structures/schema';
import { corpIndustryJobs, corpIndustryJobSyncs } from '@/features/industry-jobs/schema';
import { savedPlans } from '@/features/industry-planner/schema';
import { netWorthDays } from '@/features/net-worth/schema';
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { MergeIncompleteError } from '@/platform/purge/merge';
import type { PurgeContributor } from '@/platform/purge/types';
import { mergeUsers, type MergeRequest } from './account-merge';

vi.mock('@/data/location-tracking/merge', () => ({ snapshotMergeTracking: vi.fn() }));

beforeEach(() => {
  vi.mocked(snapshotMergeTracking).mockReset().mockResolvedValue([]);
});

const harness = await createDbTestHarness({
  schema: 'test_account_merge',
  tables: [
    'user',
    'characters',
    'account',
    'session',
    'corp_access_audit',
    'maps',
    'map_access',
    'map_access_changes',
    'user_preferences',
    'net_worth_days',
    'corp_industry_jobs',
    'corp_industry_job_syncs',
    'saved_plans',
    'custom_structures',
    'esi_refresh_jobs',
    'usage_logs',
    'pending_tracking_merges',
    'pending_deletions',
  ],
  foreignKeys: [
    { table: 'pending_tracking_merges', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'session', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'user_preferences', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'net_worth_days', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'saved_plans', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'custom_structures', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const OLD = 'user-old';
const NEW = 'user-new';
const OLD_CHAR = 90000041;
const NEW_CHAR = 90000042;
const NEW_ALT = 90000043;
const CORP = 98000001;
const H = 'owner-hash';
const OLD_MAP = '11111111-1111-4111-8111-111111111111';
const NEW_MAP = '22222222-2222-4222-8222-222222222222';
const CORP_MAP = '33333333-3333-4333-8333-333333333333';

const OLD_AT = new Date('2026-01-01T00:00:00Z');
const NEW_AT = new Date('2026-06-01T00:00:00Z');

function request(over: Partial<MergeRequest> = {}): MergeRequest {
  return {
    linkingUserId: NEW,
    otherUserId: OLD,
    provenCharacterId: OLD_CHAR,
    jwtOwnerHash: H,
    ...over,
  };
}

async function merge(req: MergeRequest, contributors?: readonly PurgeContributor[]) {
  const before = await harness.db.select().from(usageLogs).where(eq(usageLogs.action, 'auth_merge'));
  const outcome = await mergeUsers(req, { database: harness.db, contributors });
  // Settle the post-commit audit write before the next fixture truncates its tables.
  if (outcome.kind === 'merged') {
    await vi.waitFor(async () => {
      const after = await harness.db.select().from(usageLogs).where(eq(usageLogs.action, 'auth_merge'));
      expect(after).toHaveLength(before.length + 1);
    });
  }
  return outcome;
}

async function seedPair(
  overrides: { oldCreatedAt?: Date; newCreatedAt?: Date; oldRole?: 'USER' | 'ADMIN'; newRole?: 'USER' | 'ADMIN' } = {},
) {
  await seedUser(harness.db, OLD, {
    email: syntheticEmail(OLD_CHAR),
    activeCharacterId: OLD_CHAR,
    createdAt: overrides.oldCreatedAt ?? OLD_AT,
    role: overrides.oldRole ?? 'USER',
  });
  await seedUser(harness.db, NEW, {
    email: syntheticEmail(NEW_CHAR),
    activeCharacterId: NEW_CHAR,
    createdAt: overrides.newCreatedAt ?? NEW_AT,
    role: overrides.newRole ?? 'USER',
  });
  await seedCharacter(harness.db, OLD_CHAR);
  await seedCharacter(harness.db, NEW_CHAR, { corporationId: CORP });
  await seedCharacter(harness.db, NEW_ALT);
  await seedEveAccount(harness.db, { id: 'acct-old', characterId: OLD_CHAR, userId: OLD }, { ownerHash: H });
  await seedEveAccount(harness.db, { id: 'acct-new', characterId: NEW_CHAR, userId: NEW }, { ownerHash: H });
  await seedEveAccount(harness.db, { id: 'acct-new-alt', characterId: NEW_ALT, userId: NEW }, { ownerHash: H });
}

async function seedUserData() {
  const expiresAt = new Date(Date.now() + 60_000);
  await harness.db.insert(session).values([
    { id: 'sess-old', token: 'token-old', userId: OLD, expiresAt },
    { id: 'sess-new', token: 'token-new', userId: NEW, expiresAt },
    { id: 'sess-new-phone', token: 'token-new-phone', userId: NEW, expiresAt },
  ]);
  await harness.db.insert(corpAccessAudit).values([
    { userId: OLD, corporationId: CORP, allowed: true, reason: 'old' },
    { userId: NEW, corporationId: CORP, allowed: false, reason: 'new' },
  ]);
  await harness.db.insert(userPreferences).values([
    { userId: OLD, key: 'theme', value: 'dark' },
    { userId: NEW, key: 'theme', value: 'light' },
    { userId: NEW, key: 'lang', value: 'fr' },
  ]);
  const worth = { netWorth: 1, liquidIsk: 1, pilotsIncluded: 1, pilotsTotal: 1, pilots: {}, recordedAt: NEW_AT };
  await harness.db.insert(netWorthDays).values([
    { userId: OLD, day: '2026-09-01', ...worth, netWorth: 100 },
    { userId: NEW, day: '2026-09-01', ...worth, netWorth: 200 },
    { userId: NEW, day: '2026-09-02', ...worth, netWorth: 300 },
  ]);
  await harness.db.insert(corpIndustryJobs).values([
    { userId: OLD, corporationId: CORP, jobs: [] },
    { userId: NEW, corporationId: CORP, jobs: [] },
    { userId: NEW, corporationId: CORP + 1, jobs: [] },
  ]);
  await harness.db.insert(corpIndustryJobSyncs).values([
    { userId: NEW, corporationId: CORP, lastRefreshedAt: NEW_AT },
    { userId: NEW, corporationId: CORP + 1, lastRefreshedAt: NEW_AT },
  ]);
  await harness.db.insert(savedPlans).values({
    id: 'plan-new',
    userId: NEW,
    name: 'Plan',
    blueprintTypeId: 1,
    productTypeId: 2,
    productName: 'Thing',
    snapshot: {} as never,
  });
  await harness.db.insert(customStructures).values({
    id: 'structure-new',
    userId: NEW,
    name: 'Fort',
    structureTypeId: 3,
  });
  await harness.db.insert(esiRefreshJobs).values({
    dataset: 'skills',
    userId: NEW,
    ownerType: 'character',
    ownerId: NEW_CHAR,
    resource: 'skills',
    idempotencyKey: `skills|${NEW}|character|${NEW_CHAR}|skills`,
  });
  await harness.db.insert(maps).values([
    { id: OLD_MAP, userId: OLD, name: 'Old map' },
    { id: NEW_MAP, userId: NEW, name: 'New map' },
    { id: CORP_MAP, userId: OLD, name: 'Corp map' },
  ]);
  await harness.db.insert(mapAccess).values({
    mapId: CORP_MAP,
    ownerType: 'corporation',
    ownerId: CORP,
    role: 'viewer',
  });
}

async function userIds(): Promise<string[]> {
  return (await harness.db.select({ id: user.id }).from(user)).map((row) => row.id).sort();
}

async function ownersOf<T extends { userId: string }>(rows: Promise<T[]>): Promise<string[]> {
  return (await rows).map((row) => row.userId);
}

describe.skipIf(!harness.reachable)('mergeUsers (real Postgres, one transaction)', () => {
  it('moves everything onto the older user, keeps its values on conflicts, takes the higher role, and deletes the source last', async () => {
    await seedPair({ newRole: 'ADMIN' });
    await seedUserData();

    const result = await merge(request());

    expect(result).toEqual({
      kind: 'merged',
      survivorUserId: OLD,
      sourceUserId: NEW,
      movedCharacterIds: [NEW_CHAR, NEW_ALT],
      captured: expect.arrayContaining([
        expect.objectContaining({ mapId: NEW_MAP }),
        expect.objectContaining({ mapId: CORP_MAP }),
      ]),
    });
    expect(result.kind === 'merged' && result.captured).toHaveLength(2);
    expect(await userIds()).toEqual([OLD]);
    const [survivor] = await harness.db.select().from(user).where(eq(user.id, OLD));
    expect(survivor).toMatchObject({
      email: syntheticEmail(OLD_CHAR),
      activeCharacterId: OLD_CHAR,
      role: 'ADMIN',
    });

    expect(
      (await harness.db.select({ accountId: account.accountId, userId: account.userId }).from(account).orderBy(asc(account.accountId))),
    ).toEqual([
      { accountId: String(OLD_CHAR), userId: OLD },
      { accountId: String(NEW_CHAR), userId: OLD },
      { accountId: String(NEW_ALT), userId: OLD },
    ]);
    expect(
      (await harness.db.select({ token: session.token, userId: session.userId }).from(session).orderBy(asc(session.token))),
    ).toEqual([
      { token: 'token-new', userId: OLD },
      { token: 'token-new-phone', userId: OLD },
      { token: 'token-old', userId: OLD },
    ]);
    expect(await ownersOf(harness.db.select().from(corpAccessAudit))).toEqual([OLD, OLD]);
    expect(
      await harness.db.select({ key: userPreferences.key, value: userPreferences.value, userId: userPreferences.userId }).from(userPreferences).orderBy(asc(userPreferences.key)),
    ).toEqual([
      { key: 'lang', value: 'fr', userId: OLD },
      { key: 'theme', value: 'dark', userId: OLD },
    ]);
    expect(
      await harness.db.select({ day: netWorthDays.day, netWorth: netWorthDays.netWorth, userId: netWorthDays.userId }).from(netWorthDays).orderBy(asc(netWorthDays.day)),
    ).toEqual([
      { day: '2026-09-01', netWorth: 100, userId: OLD },
      { day: '2026-09-02', netWorth: 300, userId: OLD },
    ]);
    expect(
      await harness.db.select({ corporationId: corpIndustryJobs.corporationId, userId: corpIndustryJobs.userId }).from(corpIndustryJobs).orderBy(asc(corpIndustryJobs.corporationId)),
    ).toEqual([
      { corporationId: CORP, userId: OLD },
      { corporationId: CORP + 1, userId: OLD },
    ]);
    expect(
      await harness.db.select({ corporationId: corpIndustryJobSyncs.corporationId, userId: corpIndustryJobSyncs.userId }).from(corpIndustryJobSyncs),
    ).toEqual([{ corporationId: CORP + 1, userId: OLD }]);
    expect(await ownersOf(harness.db.select().from(savedPlans))).toEqual([OLD]);
    expect(await ownersOf(harness.db.select().from(customStructures))).toEqual([OLD]);
    expect(await harness.db.select().from(esiRefreshJobs)).toEqual([]);
    expect(
      await harness.db.select({ id: maps.id, userId: maps.userId }).from(maps).orderBy(asc(maps.id)),
    ).toEqual([
      { id: OLD_MAP, userId: OLD },
      { id: NEW_MAP, userId: OLD },
      { id: CORP_MAP, userId: OLD },
    ]);
    expect(
      (await harness.db.select({ mapId: pendingMapAccessChanges.mapId }).from(pendingMapAccessChanges)).map((row) => row.mapId).sort(),
    ).toEqual([NEW_MAP, CORP_MAP].sort());
    await vi.waitFor(async () => {
      const [event] = await harness.db.select().from(usageLogs).where(eq(usageLogs.action, 'auth_merge'));
      expect(event).toMatchObject({
        characterId: OLD_CHAR,
        metadata: { sourceUserId: NEW, survivorUserId: OLD, movedCharacterIds: [NEW_CHAR, NEW_ALT] },
      });
    });
  });

  it('persists the tracking snapshot with the merge even after the source user is deleted', async () => {
    await seedPair();
    const selections = [{ mapId: NEW_MAP, characterId: NEW_CHAR }];
    vi.mocked(snapshotMergeTracking).mockResolvedValueOnce(selections);

    await merge(request());

    expect(snapshotMergeTracking).toHaveBeenCalledWith(NEW);
    expect(await userIds()).toEqual([OLD]);
    expect(await harness.db.select().from(pendingTrackingMerges)).toEqual([
      expect.objectContaining({ userId: OLD, sourceUserId: NEW, selections }),
    ]);
  });

  it('does not merge or delete anything when the tracking snapshot cannot be captured', async () => {
    await seedPair();
    await seedUserData();
    vi.mocked(snapshotMergeTracking).mockRejectedValueOnce(new Error('Convex unavailable'));

    await expect(merge(request())).rejects.toThrow('Convex unavailable');

    expect(await userIds()).toEqual([NEW, OLD].sort());
    expect(await ownersOf(harness.db.select().from(account).orderBy(asc(account.accountId)))).toEqual([OLD, NEW, NEW]);
    expect(await ownersOf(harness.db.select().from(session).orderBy(asc(session.token)))).toEqual([NEW, NEW, OLD]);
    expect(await harness.db.select().from(pendingTrackingMerges)).toEqual([]);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([]);
  });

  it('rekeys an earlier pending transfer when its survivor is merged again', async () => {
    await seedPair();
    const selections = [{ mapId: NEW_MAP, characterId: NEW_ALT }];
    const [earlier] = await harness.db.insert(pendingTrackingMerges).values({
      userId: NEW, sourceUserId: 'previously-deleted-user', selections,
    }).returning();

    await merge(request());

    const rows = await harness.db.select().from(pendingTrackingMerges);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(expect.objectContaining({
      id: earlier!.id, userId: OLD, sourceUserId: 'previously-deleted-user', selections,
    }));
    expect(rows).toContainEqual(expect.objectContaining({ userId: OLD, sourceUserId: NEW, selections: [] }));
  });

  it('keeps the linking user when it is the older one and moves the proven character onto it', async () => {
    await seedPair({ oldCreatedAt: NEW_AT, newCreatedAt: OLD_AT, oldRole: 'ADMIN' });
    await seedUserData();

    await expect(merge(request())).resolves.toMatchObject({
      kind: 'merged',
      survivorUserId: NEW,
      sourceUserId: OLD,
      movedCharacterIds: [OLD_CHAR],
    });
    expect(await userIds()).toEqual([NEW]);
    const [survivor] = await harness.db.select().from(user).where(eq(user.id, NEW));
    expect(survivor).toMatchObject({ email: syntheticEmail(NEW_CHAR), activeCharacterId: NEW_CHAR, role: 'ADMIN' });
    expect(
      await harness.db.select({ key: userPreferences.key, value: userPreferences.value }).from(userPreferences).orderBy(asc(userPreferences.key)),
    ).toEqual([
      { key: 'lang', value: 'fr' },
      { key: 'theme', value: 'light' },
    ]);
    expect(await ownersOf(harness.db.select().from(session))).toEqual([NEW, NEW, NEW]);
    expect(
      (await harness.db.select({ mapId: pendingMapAccessChanges.mapId }).from(pendingMapAccessChanges)).map((row) => row.mapId).sort(),
    ).toEqual([OLD_MAP, CORP_MAP].sort());
  });

  it('breaks a creation-time tie by the smaller id', async () => {
    await seedPair({ oldCreatedAt: OLD_AT, newCreatedAt: OLD_AT });
    await expect(merge(request())).resolves.toMatchObject({ survivorUserId: NEW, sourceUserId: OLD });
    expect(await userIds()).toEqual([NEW]);
  });

  it('rolls everything back when a rule leaves source rows behind, so the cascade never eats data', async () => {
    await seedPair();
    await seedUserData();
    const leaking = PURGE_CONTRIBUTORS.map((contributor) =>
      contributor.name === 'preferences'
        ? { ...contributor, merge: [{ tables: contributor.claims, rule: 'custom' as const, reason: 'leak', merge: async () => undefined }] }
        : contributor,
    );

    await expect(merge(request(), leaking)).rejects.toEqual(new MergeIncompleteError(['user_preferences']));

    expect(await userIds()).toEqual([NEW, OLD].sort());
    expect(await ownersOf(harness.db.select().from(account).orderBy(asc(account.accountId)))).toEqual([OLD, NEW, NEW]);
    expect(await ownersOf(harness.db.select().from(userPreferences).orderBy(asc(userPreferences.userId)))).toEqual([NEW, NEW, OLD]);
    expect(await harness.db.select().from(esiRefreshJobs)).toHaveLength(1);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([]);
    expect(await harness.db.select().from(usageLogs)).toEqual([]);
  });

  it('rolls everything back when a rule throws mid-way', async () => {
    await seedPair();
    await seedUserData();
    const exploding = PURGE_CONTRIBUTORS.map((contributor) =>
      contributor.name === 'net-worth'
        ? {
            ...contributor,
            merge: [{ tables: contributor.claims, rule: 'custom' as const, reason: 'boom', merge: async () => { throw new Error('boom'); } }],
          }
        : contributor,
    );

    await expect(merge(request(), exploding)).rejects.toThrow('boom');
    expect(await userIds()).toEqual([NEW, OLD].sort());
    expect(await ownersOf(harness.db.select().from(session).orderBy(asc(session.token)))).toEqual([NEW, NEW, OLD]);
    expect(await harness.db.select().from(pendingMapAccessChanges)).toEqual([]);
  });

  it('converges: a re-run after commit and every changed picture under the lock are noops', async () => {
    await seedPair();
    await expect(merge(request())).resolves.toMatchObject({ kind: 'merged' });
    await expect(merge(request())).resolves.toEqual({ kind: 'noop', reason: 'source-gone' });
    expect(await userIds()).toEqual([OLD]);

    await harness.sql`TRUNCATE TABLE "user", account, characters CASCADE`;
    await seedPair();
    await expect(merge(request({ jwtOwnerHash: 'someone-else' }))).resolves.toEqual({
      kind: 'noop',
      reason: 'owner-unverified',
    });
    await expect(merge(request({ provenCharacterId: NEW_CHAR }))).resolves.toEqual({
      kind: 'noop',
      reason: 'same-user',
    });
    await expect(merge(request({ provenCharacterId: 1 }))).resolves.toEqual({
      kind: 'noop',
      reason: 'character-moved',
    });
    await seedUser(harness.db, 'user-third', { email: 'third@example.test' });
    await harness.db.update(account).set({ userId: 'user-third' }).where(eq(account.accountId, String(OLD_CHAR)));
    await expect(merge(request())).resolves.toEqual({ kind: 'noop', reason: 'character-moved' });
    expect(await userIds()).toEqual([NEW, OLD, 'user-third'].sort());
  });
});
