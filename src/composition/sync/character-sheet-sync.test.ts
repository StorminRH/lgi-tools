import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import type { SheetSections } from '@/features/character-sheet/types';
import { EsiBudgetExhaustedError } from '@/platform/esi';

const mocks = vi.hoisted(() => ({
  listCharactersWithHealth: vi.fn(),
  vendTokenFor: vi.fn(),
  readSingleEndpoint: vi.fn(),
  readSheetRow: vi.fn(),
  mergeSheetSection: vi.fn(),
  stampSheetSection: vi.fn(),
  enqueueEsiRefreshJob: vi.fn(async () => 1),
}));

vi.mock('@/data/esi-refresh-jobs/queries', () => ({
  enqueueEsiRefreshJob: mocks.enqueueEsiRefreshJob,
}));

vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: mocks.listCharactersWithHealth,
  vendTokenFor: mocks.vendTokenFor,
  readSingleEndpoint: mocks.readSingleEndpoint,
}));

vi.mock('@/features/character-sheet/queries', () => ({
  readSheetRow: mocks.readSheetRow,
  mergeSheetSection: mocks.mergeSheetSection,
  stampSheetSection: mocks.stampSheetSection,
}));

import {
  makeSheetPort,
  refreshCharacterSheetsOnView,
  runCharacterSheetRefreshJob,
  SHEET_ESI_PATHS,
  STRUCTURE_ESI_PATH,
} from './character-sheet-sync';

const TIER_ENTRIES = ['character_sheet_live', 'character_sheet_hourly', 'character_sheet_daily'];

const registrySpecPaths = new Set<string>(
  ESI_DATASET_ENTRIES.filter((entry) => TIER_ENTRIES.includes(entry.name)).flatMap((entry) =>
    entry.upstream.kind === 'esi' ? [...entry.upstream.specPaths] : [],
  ),
);

const BODIES: Record<string, unknown> = {
  '/characters/1/': { birthday: '2014-03-11T09:42:00Z' },
  '/characters/1/location/': { solar_system_id: 30000142 },
  '/characters/1/ship/': { ship_type_id: 1, ship_item_id: 1, ship_name: 'x' },
  '/characters/1/online/': { online: false },
  '/characters/1/attributes/': { charisma: 17, intelligence: 17, memory: 17, perception: 17, willpower: 17 },
  '/characters/1/implants/': [],
  '/characters/1/clones/': { jump_clones: [] },
  '/characters/1/wallet/': 1,
  '/characters/1/wallet/journal/': [],
  '/characters/1/orders/': [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSheetRow.mockResolvedValue(null);
  mocks.mergeSheetSection.mockResolvedValue(undefined);
  mocks.stampSheetSection.mockResolvedValue(undefined);
  mocks.readSingleEndpoint.mockImplementation(async (path: string) => {
    const body = BODIES[path.replace(/^\/characters\/\d+\//, '/characters/1/')];
    return body === undefined
      ? { kind: 'error', code: 'esi_404' }
      : { kind: 'fresh', body, etag: null };
  });
});

describe('SHEET_ESI_PATHS', () => {
  it('declares every read path inside the three registry tier entries', () => {
    const templates = Object.values(SHEET_ESI_PATHS).map((path) =>
      path(123).replace('/characters/123/', '/characters/{character_id}/'),
    );
    templates.push(STRUCTURE_ESI_PATH(456).replace('/456/', '/{structure_id}/'));
    for (const template of templates) {
      expect(registrySpecPaths.has(template), `${template} missing from the registry`).toBe(true);
    }
    expect(templates).toHaveLength(registrySpecPaths.size);
  });
});

describe('makeSheetPort', () => {
  it('reads the roster once and vends once per character per run so concurrent sections never race the refresh-token rotation', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([
      { characterId: 1, corporationId: null, hasRefreshToken: true, missingScopes: [] },
      { characterId: 2, corporationId: null, hasRefreshToken: true, missingScopes: [] },
    ]);
    mocks.vendTokenFor.mockImplementation(async (characterId: number) => `token-${characterId}`);

    await refreshCharacterSheetsOnView('user-1');

    expect(mocks.listCharactersWithHealth).toHaveBeenCalledTimes(1);
    expect(mocks.vendTokenFor.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
    expect(mocks.readSingleEndpoint).toHaveBeenCalledWith('/characters/1/wallet/', 'token-1', null);
    expect(mocks.readSingleEndpoint).toHaveBeenCalledWith('/characters/2/wallet/journal/', 'token-2', null);
    expect(mocks.readSingleEndpoint).toHaveBeenCalledTimes(20);
  });

  it('starts a fresh memo for every run', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([]);

    await refreshCharacterSheetsOnView('user-1');
    await refreshCharacterSheetsOnView('user-1');

    expect(mocks.listCharactersWithHealth).toHaveBeenCalledTimes(2);
  });

  it('reads structures without a held ETag and routes storage through the queries', async () => {
    const sheet: SheetSections = { wallet: { data: { balance: 1 }, refreshedAt: '2026-09-27T00:00:00.000Z', etags: {} } };
    mocks.readSheetRow.mockResolvedValue(sheet);
    const port = makeSheetPort();

    await port.readStructure(1099000000001, 'token');
    await expect(port.readSheet(7)).resolves.toBe(sheet);
    await port.mergeSection(7, 'wallet', sheet.wallet!);
    await port.stampSection(7, 'wallet');

    expect(mocks.readSingleEndpoint).toHaveBeenCalledWith('/universe/structures/1099000000001/', 'token', null);
    expect(mocks.mergeSheetSection).toHaveBeenCalledWith(7, 'wallet', sheet.wallet);
    expect(mocks.stampSheetSection).toHaveBeenCalledWith(7, 'wallet');
  });
});

describe('character sheet budget recovery', () => {
  const target = { ownerType: 'character' as const, ownerId: 1 };
  const budget = new EsiBudgetExhaustedError(12, 'rate_limited', 900, '/characters/1/wallet/');

  beforeEach(() => {
    mocks.listCharactersWithHealth.mockResolvedValue([
      { characterId: 1, corporationId: null, hasRefreshToken: true, missingScopes: [] },
      { characterId: 2, corporationId: null, hasRefreshToken: true, missingScopes: [] },
    ]);
    mocks.vendTokenFor.mockResolvedValue('token');
  });

  it('queues a budget-blocked section with its character target and resource', async () => {
    mocks.readSingleEndpoint.mockImplementation(async (path: string) => {
      if (path === budget.resource) throw budget;
      return { kind: 'fresh', body: BODIES[path.replace('/characters/2/', '/characters/1/')], etag: null };
    });

    await refreshCharacterSheetsOnView('user-1');

    expect(mocks.enqueueEsiRefreshJob).toHaveBeenCalledExactlyOnceWith({
      dataset: 'character_sheet', userId: 'user-1', target, error: budget,
    });
  });

  it('keeps the queued job deferred when another section succeeded or failed permanently', async () => {
    mocks.readSingleEndpoint.mockImplementation(async (path: string) => {
      if (path === budget.resource) throw budget;
      if (path === '/characters/1/implants/') return { kind: 'error', code: 'contract_error' };
      return { kind: 'fresh', body: BODIES[path], etag: null };
    });

    await expect(runCharacterSheetRefreshJob('user-1', target)).resolves.toEqual({
      kind: 'deferred_for_budget', target, error: budget,
    });
    expect(mocks.enqueueEsiRefreshJob).not.toHaveBeenCalled();
    expect(mocks.vendTokenFor).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.readSingleEndpoint.mock.calls.every(([path]) => !String(path).includes('/characters/2/'))).toBe(true);
  });

  it('keeps a retryable section ahead of successful or permanently failed sections', async () => {
    mocks.readSingleEndpoint.mockImplementation(async (path: string) => {
      if (path === '/characters/1/wallet/') return { kind: 'error', code: 'esi_server_error' };
      if (path === '/characters/1/implants/') return { kind: 'error', code: 'contract_error' };
      return { kind: 'fresh', body: BODIES[path], etag: null };
    });
    await expect(runCharacterSheetRefreshJob('user-1', target)).resolves.toEqual({
      kind: 'failed_retryable', target, code: 'esi_server_error',
    });
  });

  it('settles success only when every eligible section completed', async () => {
    await expect(runCharacterSheetRefreshJob('user-1', target)).resolves.toEqual({ kind: 'succeeded', target });
  });

  it('reports a remaining permanent failure after the other sections complete', async () => {
    mocks.readSingleEndpoint.mockImplementation(async (path: string) =>
      path === '/characters/1/wallet/'
        ? { kind: 'error', code: 'contract_error' }
        : { kind: 'fresh', body: BODIES[path], etag: null },
    );
    await expect(runCharacterSheetRefreshJob('user-1', target)).resolves.toEqual({
      kind: 'failed_permanent', target, code: 'contract_error',
    });
  });

  it.each([
    { ownerType: 'character' as const, ownerId: 99 },
    { ownerType: 'corporation' as const, ownerId: 1 },
  ])('does not refresh an unavailable target %j', async (unavailable) => {
    await expect(runCharacterSheetRefreshJob('user-1', unavailable)).resolves.toEqual({
      kind: 'failed_permanent', target: unavailable, code: 'owner_unavailable',
    });
    expect(mocks.vendTokenFor).not.toHaveBeenCalled();
    expect(mocks.readSingleEndpoint).not.toHaveBeenCalled();
  });
});
