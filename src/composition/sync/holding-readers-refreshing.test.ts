import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiStoreKey } from '@/data/esi-store';
import { compileReadScope } from '@/platform/auth/corp-visibility';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  isDueFor: vi.fn<(userId: string, keys: readonly EsiStoreKey[]) => Promise<boolean>>(),
  listCharactersWithHealth: vi.fn(),
  resolveCorpViewer: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/composition/corp-viewer', () => ({ resolveCorpViewer: mocks.resolveCorpViewer }));
vi.mock('@/data/esi-store', () => ({ isDueFor: mocks.isDueFor, recordRefusalFor: vi.fn() }));
vi.mock('@/data/esi-store/session', () => ({ openReadSession: vi.fn() }));
vi.mock('@/data/eve-data/entity-names', () => ({ resolveEntityNames: vi.fn(async () => new Map()) }));
vi.mock('@/data/eve-data/queries', () => ({ getTypeNameRecord: vi.fn(async () => ({})) }));
vi.mock('@/platform/auth/linked-characters', () => ({ listLinkedCharacters: vi.fn() }));
vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: mocks.listCharactersWithHealth,
  readRolesForSync: vi.fn(),
  vendTokenFor: vi.fn(),
}));
vi.mock('./owned-assets-source-save', () => ({ saveOwnedAssetsFromSource: vi.fn() }));
vi.mock('@/features/owned-assets/queries', () => ({
  getCorpAssetEvidence: vi.fn(async () => null),
  getOwnedAssetMap: vi.fn(async () => new Map()),
  readOwnerSyncState: vi.fn(),
  stampOwnerFresh: vi.fn(),
}));
vi.mock('@/features/owned-assets/refresh', () => ({
  refreshCharacterOwnedAssetsForUser: vi.fn(),
  refreshOwnedAssetsForUser: vi.fn(),
}));
vi.mock('@/features/owned-blueprints/queries', () => ({
  getOwnedBlueprintMap: vi.fn(async () => new Map()),
  readBlueprintSyncState: vi.fn(),
  saveOwnedBlueprints: vi.fn(),
  stampBlueprintFresh: vi.fn(),
}));
vi.mock('@/features/owned-blueprints/refresh', () => ({ refreshOwnedBlueprintsForUser: vi.fn() }));

import { getOwnedAssetDetailOnView } from './owned-assets-sync';
import { getOwnedBlueprintDetailOnView } from './owned-blueprints-sync';

const CORP = 98_000_001;
const DIVISIONS_ROUTE = '/corporations/{corporation_id}/divisions/';

/** A due check where only the corporation's divisions answer has expired: the holdings themselves are fresh. */
const onlyDivisionsDue = async (_userId: string, keys: readonly EsiStoreKey[]) =>
  keys.some((key) => key.route === DIVISIONS_ROUTE && key.holder.kind === 'corporation' && key.holder.id === CORP);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(1, { corporationId: CORP })]);
  mocks.resolveCorpViewer.mockResolvedValue({ scope: compileReadScope([1], []), corporations: [] });
});

describe.each([
  ['owned assets', (userId: string) => getOwnedAssetDetailOnView(userId, [34])],
  ['owned blueprints', (userId: string) => getOwnedBlueprintDetailOnView(userId, [34])],
])('the %s detail reader', (_name, read) => {
  it('says refreshing while the corp context the viewer refreshes behind it is due, though the holdings are fresh', async () => {
    mocks.isDueFor.mockImplementation(onlyDivisionsDue);

    await expect(read('u1')).resolves.toMatchObject({ refreshing: true });

    const [userId, keys] = mocks.isDueFor.mock.calls[0]!;
    expect(userId).toBe('u1');
    expect(keys.filter((key) => key.holder.kind === 'corporation' && key.holder.id === CORP).map((key) => key.route)).toEqual(
      expect.arrayContaining([
        '/corporations/{corporation_id}/',
        DIVISIONS_ROUTE,
        '/corporations/{corporation_id}/membertracking/',
      ]),
    );
  });

  it('says not refreshing once neither the holdings nor the corp context are due for this user', async () => {
    mocks.isDueFor.mockResolvedValue(false);

    await expect(read('u1')).resolves.toMatchObject({ refreshing: false });
  });

  it('asks about no corp context for a member who cannot run the context pass', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([
      ownerFixture(1, { corporationId: CORP, missingScopes: ['esi-corporations.read_divisions.v1'] }),
    ]);
    mocks.isDueFor.mockImplementation(onlyDivisionsDue);

    await expect(read('u1')).resolves.toMatchObject({ refreshing: false });
  });
});
