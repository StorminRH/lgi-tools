import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { __resetEsiGateForTests } from '@/platform/esi';
import { SHEET_SECTION_SCOPES } from '@/features/character-sheet/sync-eligibility';
import { esiResponses } from '@/data/esi-store/schema';
import { identityText, rowIdentity } from '@/data/esi-store/key';
import type { EsiStoreKey } from '@/data/esi-store';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';

const mocks = vi.hoisted(() => ({
  afterCalls: [] as Array<() => unknown>,
  listCharactersWithHealth: vi.fn(),
  readRolesForSync: vi.fn(),
  vendTokenFor: vi.fn(),
  listLinkedCharacters: vi.fn(),
  saveCorpNeedsRole: vi.fn(async () => {}),
  listLinkedCharacterIdsInCorporation: vi.fn(async () => []),
}));

vi.mock('next/server', () => ({ after: (fn: () => unknown) => mocks.afterCalls.push(fn) }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: mocks.listCharactersWithHealth,
  readRolesForSync: mocks.readRolesForSync,
  vendTokenFor: mocks.vendTokenFor,
}));
vi.mock('@/composition/corp-access', () => ({
  resolveUserCorpAccess: vi.fn(async () => ({ characterIdsByCorporation: { 5000: [101] } })),
}));
vi.mock('@/platform/auth/linked-characters', () => ({ listLinkedCharacters: mocks.listLinkedCharacters }));
vi.mock('@/platform/auth/affiliation-store', () => ({
  listLinkedCharacterIdsInCorporation: mocks.listLinkedCharacterIdsInCorporation,
}));
vi.mock('@/data/corp-holdings/queries', () => ({
  getCorpHoldingContext: vi.fn(async () => ({
    hq: { kind: 'unknown' },
    divisionNames: {},
    index: { locations: new Map() },
    containerNames: {},
    structureNames: {},
  })),
  readCorpProfileState: vi.fn(async () => null),
  saveCorpProfile: vi.fn(async () => {}),
  stampCorpProfileFresh: vi.fn(async () => {}),
}));
vi.mock('@/data/eve-data/queries', () => ({ getTypeNameRecord: vi.fn(async () => ({})) }));
vi.mock('@/features/character-sheet/queries', () => ({
  readSheetRow: vi.fn(async () => null),
  mergeSheetSection: vi.fn(async () => {}),
  stampSheetSection: vi.fn(async () => {}),
}));
vi.mock('@/features/industry-jobs/queries', () => ({
  getCorpJobsForUser: vi.fn(async () => new Map()),
  listCorpJobSyncStates: vi.fn(async () => [{ corporationId: 5000, lastRefreshedAt: null, syncError: null }]),
  readCorpJobSyncState: vi.fn(async () => null),
  saveCorpJobs: vi.fn(),
  saveCorpNeedsRole: mocks.saveCorpNeedsRole,
  stampCorpJobsFresh: vi.fn(),
  getJobsForCharacters: vi.fn(async () => new Map()),
  listCharacterJobSyncStates: vi.fn(async () => new Map()),
  readCharacterJobSyncState: vi.fn(async () => null),
  saveCharacterJobs: vi.fn(),
  stampCharacterJobsFresh: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_refusal_refreshing',
  tables: ['esi_responses'],
  steerDbProxy: true,
  env: {
    KV_REST_API_URL: '',
    KV_REST_API_TOKEN: '',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  },
  resetBetweenTests: 'delete',
});

const { getCorpJobsForUserOnView } = await import('./corp-industry-jobs-sync');
const { getJobsForUserOnView } = await import('./industry-jobs-sync');
const { corpJobsKey, characterJobsKey } = await import('@/features/industry-jobs/keys');
const { refreshCharacterSheetsOnView } = await import('./character-sheet-sync');
const { sectionKeys } = await import('@/features/character-sheet/keys');
const { refreshCorpContextOnView } = await import('./corp-context-sync');
const { corpContextKeys } = await import('@/data/corp-holdings/keys');
const { isDue, isDueFor, refusalKeyFor } = await import('@/data/esi-store');

async function rowOf(key: EsiStoreKey) {
  const target = identityText(rowIdentity(key));
  return (await harness.db.select().from(esiResponses)).find((row) => identityText(row) === target);
}

/** Runs what the view scheduled behind its response, as after() would once it closed. */
async function runScheduled(): Promise<void> {
  const scheduled = mocks.afterCalls.splice(0);
  await Promise.all(scheduled.map((fn) => fn()));
}

describe.skipIf(!harness.reachable)('a recorded refusal ends `refreshing` (real Postgres)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetEsiGateForTests();
    mocks.afterCalls.length = 0;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no ESI call is expected'));
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  // The harness owns the env stubs (DATABASE_URL steering included) and clears them after the suite.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a role-less corp member\'s corp jobs as refused with no ETag, so the next view stops refreshing', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(101, { corporationId: 5000 })]);
    mocks.vendTokenFor.mockResolvedValue('tok-101');
    mocks.readRolesForSync.mockResolvedValue([]);

    await expect(getCorpJobsForUserOnView('u1')).resolves.toMatchObject({ refreshing: true });
    const before = Date.now();
    await runScheduled();

    const row = await rowOf(corpJobsKey('u1', 5000));
    expect(row).toMatchObject({ etags: [], body: null });
    expect(row!.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 300_000);
    expect(mocks.saveCorpNeedsRole).toHaveBeenCalledExactlyOnceWith('u1', 5000);

    await expect(getCorpJobsForUserOnView('u1')).resolves.toMatchObject({ refreshing: false });
    await runScheduled();
    expect(mocks.readRolesForSync).toHaveBeenCalledOnce();
  });

  it('records a character whose grant is lost, so its jobs stop refreshing until the refusal expires', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(202)]);
    mocks.listLinkedCharacters.mockResolvedValue([{ characterId: 202 }]);
    mocks.vendTokenFor.mockResolvedValue({ missing: 'lost' });

    await expect(getJobsForUserOnView('u2')).resolves.toMatchObject({ refreshing: true });
    await runScheduled();

    expect(await rowOf(characterJobsKey(202))).toMatchObject({ etags: [], body: null });
    await expect(getJobsForUserOnView('u2')).resolves.toMatchObject({ refreshing: false });
    await runScheduled();
    expect(mocks.vendTokenFor).toHaveBeenCalledOnce();
  });

  it('records nothing for a character whose token service failed for now, so the next view retries', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(204)]);
    mocks.listLinkedCharacters.mockResolvedValue([{ characterId: 204 }]);
    mocks.vendTokenFor.mockResolvedValue({ missing: 'unavailable' });

    await expect(getJobsForUserOnView('u4')).resolves.toMatchObject({ refreshing: true });
    await runScheduled();

    expect(await rowOf(characterJobsKey(204))).toBeUndefined();
    await expect(getJobsForUserOnView('u4')).resolves.toMatchObject({ refreshing: true });
    await runScheduled();
    expect(mocks.vendTokenFor).toHaveBeenCalledTimes(2);
  });

  it('keeps a role-less member\'s refusal of a corporation answer to that member: a Director in the same corporation still reads it', async () => {
    const corp = 6000;
    const keys = corpContextKeys(corp);
    const rosters: Record<string, ReturnType<typeof ownerFixture>[]> = {
      member: [ownerFixture(401, { corporationId: corp })],
      director: [ownerFixture(402, { corporationId: corp })],
    };
    mocks.listCharactersWithHealth.mockImplementation(async (userId: string) => rosters[userId] ?? []);
    mocks.vendTokenFor.mockImplementation(async (characterId: number) => `tok-${characterId}`);
    mocks.readRolesForSync.mockImplementation(async (characterId: number) => (characterId === 402 ? ['Director'] : []));
    fetchSpy.mockImplementation(async () => new Response('{}', { status: 404 }));

    await refreshCorpContextOnView('member');

    expect(fetchSpy).not.toHaveBeenCalled();
    for (const key of keys) {
      expect(await rowOf(key)).toBeUndefined();
      expect(await rowOf(refusalKeyFor('member', key))).toMatchObject({ userId: 'member', etags: [], body: null });
    }
    await expect(isDue(keys)).resolves.toBe(true);
    await expect(isDueFor('director', keys)).resolves.toBe(true);
    await expect(isDueFor('member', keys)).resolves.toBe(false);

    // The member's own view stops re-asking while the refusal stands.
    await refreshCorpContextOnView('member');
    expect(mocks.readRolesForSync).toHaveBeenCalledOnce();

    // The Director's pass is still due and reaches ESI for the corporation.
    await refreshCorpContextOnView('director');
    expect(mocks.readRolesForSync).toHaveBeenLastCalledWith(402, 'tok-402');
    const urls = fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls.some((url: string) => url.includes(`/corporations/${corp}/`))).toBe(true);
  });

  it('records a sheet section ESI refused with a 403 as its answer, until the 403\'s Expires or the spec cache time', async () => {
    const walletScope = 'esi-wallet.read_character_wallet.v1';
    const otherScopes = [...new Set(Object.values(SHEET_SECTION_SCOPES).flat())].filter((scope) => scope !== walletScope);
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(303, { missingScopes: otherScopes })]);
    mocks.vendTokenFor.mockResolvedValue('tok-303');
    const expires = new Date(Math.ceil(Date.now() / 1000) * 1000 + 600_000);
    fetchSpy.mockImplementation(async (input: string | URL | Request) =>
      String(input).includes('/wallet/?') || String(input).endsWith('/wallet/')
        ? new Response('{}', { status: 403, headers: { Expires: expires.toUTCString() } })
        : new Response('{}', { status: 403 }));
    const before = Date.now();

    await refreshCharacterSheetsOnView('u3');

    const [wallet] = sectionKeys(303, 'wallet');
    const [profile] = sectionKeys(303, 'profile');
    expect(await rowOf(wallet!)).toMatchObject({ etags: [], body: null, expiresAt: expires });
    const profileRow = await rowOf(profile!);
    expect(profileRow).toMatchObject({ etags: [], body: null });
    expect(profileRow!.expiresAt!.getTime()).toBeGreaterThan(before);
    await expect(isDue([...sectionKeys(303, 'wallet'), ...sectionKeys(303, 'journal'), ...sectionKeys(303, 'profile')])).resolves.toBe(false);

    const calls = fetchSpy.mock.calls.length;
    await refreshCharacterSheetsOnView('u3');
    expect(fetchSpy.mock.calls.length).toBe(calls);
  });
});
