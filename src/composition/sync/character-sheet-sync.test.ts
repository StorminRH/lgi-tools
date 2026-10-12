import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiStoreKey } from '@/data/esi-store';
import type { EsiReadSession } from '@/data/esi-store/session';
import { SHEET_ROUTES, STRUCTURE_LOOKUP_ROUTE } from '@/features/character-sheet/keys';
import type { SheetSections } from '@/features/character-sheet/types';
import { ESI_DATASET_ENTRIES } from '@/lib/esi-datasets/entries';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';

const mocks = vi.hoisted(() => ({
  listCharactersWithHealth: vi.fn(),
  vendTokenFor: vi.fn(),
  isDue: vi.fn<(keys: unknown) => Promise<boolean>>(async () => true),
  readAuthed: vi.fn(),
  readPassThrough: vi.fn(),
  commit: vi.fn(async () => {}),
  readSheetRow: vi.fn(),
  mergeSheetSection: vi.fn(),
  stampSheetSection: vi.fn(),
}));

vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: mocks.listCharactersWithHealth,
  vendTokenFor: mocks.vendTokenFor,
}));

vi.mock('@/data/esi-store', () => ({ isDue: (keys: unknown) => mocks.isDue(keys) }));

vi.mock('@/data/esi-store/session', () => ({
  openReadSession: (): EsiReadSession => ({
    readAuthed: (key, accessToken) => mocks.readAuthed(key, accessToken),
    readPaged: vi.fn(),
    readPassThrough: (route, params, accessToken) => mocks.readPassThrough(route, params, accessToken),
    postPassThrough: vi.fn(),
    discardBodies: vi.fn(),
    commit: mocks.commit,
  }),
}));

vi.mock('@/features/character-sheet/queries', () => ({
  readSheetRow: mocks.readSheetRow,
  mergeSheetSection: mocks.mergeSheetSection,
  stampSheetSection: mocks.stampSheetSection,
}));

import { makeSheetPort, refreshCharacterSheetsOnView } from './character-sheet-sync';

const TIER_ENTRIES = ['character_sheet_live', 'character_sheet_hourly', 'character_sheet_daily'];

const registryRoutes = new Set<string>(
  ESI_DATASET_ENTRIES.filter((entry) => TIER_ENTRIES.includes(entry.name)).flatMap((entry) =>
    entry.routes.map((declaration) => declaration.route),
  ),
);

const BODIES: Record<string, unknown> = {
  '/characters/{character_id}/': { birthday: '2014-03-11T09:42:00Z' },
  '/characters/{character_id}/location/': { solar_system_id: 30000142 },
  '/characters/{character_id}/ship/': { ship_type_id: 1, ship_item_id: 1, ship_name: 'x' },
  '/characters/{character_id}/online/': { online: false },
  '/characters/{character_id}/attributes/': { charisma: 17, intelligence: 17, memory: 17, perception: 17, willpower: 17 },
  '/characters/{character_id}/implants/': [],
  '/characters/{character_id}/clones/': { jump_clones: [] },
  '/characters/{character_id}/wallet/': 1,
  '/characters/{character_id}/wallet/journal/': [],
  '/characters/{character_id}/orders/': [],
};

const characterKey = (characterId: number, route: string) => ({ route, holder: { kind: 'character', id: characterId } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDue.mockResolvedValue(true);
  mocks.readSheetRow.mockResolvedValue(null);
  mocks.mergeSheetSection.mockResolvedValue(undefined);
  mocks.stampSheetSection.mockResolvedValue(undefined);
  mocks.readAuthed.mockImplementation(async (key: EsiStoreKey) => {
    const body = BODIES[key.route];
    return body === undefined ? { kind: 'error', code: 'esi_404' } : { kind: 'fresh', body, etag: null };
  });
  mocks.readPassThrough.mockResolvedValue({ kind: 'fresh', body: { name: 'Fort' }, etag: null });
});

describe('SHEET_ROUTES', () => {
  it('declares every read route inside the three registry tier entries', () => {
    const routes = [...Object.values(SHEET_ROUTES), STRUCTURE_LOOKUP_ROUTE];
    for (const route of routes) {
      expect(registryRoutes.has(route), `${route} missing from the registry`).toBe(true);
    }
    expect(routes).toHaveLength(registryRoutes.size);
  });
});

describe('makeSheetPort', () => {
  it('reads the roster once and vends once per character per run so concurrent sections never race the refresh-token rotation', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(1), ownerFixture(2)]);
    mocks.vendTokenFor.mockImplementation(async (characterId: number) => `token-${characterId}`);

    await refreshCharacterSheetsOnView('user-1');

    expect(mocks.listCharactersWithHealth).toHaveBeenCalledTimes(1);
    expect(mocks.vendTokenFor.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
    expect(mocks.readAuthed).toHaveBeenCalledWith(characterKey(1, '/characters/{character_id}/wallet/'), 'token-1');
    expect(mocks.readAuthed).toHaveBeenCalledWith(characterKey(2, '/characters/{character_id}/wallet/journal/'), 'token-2');
    expect(mocks.readAuthed).toHaveBeenCalledTimes(20);
  });

  it('asks the store whether each section is due by every key the section is built from', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(1)]);
    mocks.vendTokenFor.mockResolvedValue('token');
    mocks.isDue.mockResolvedValue(false);

    await refreshCharacterSheetsOnView('user-1');

    expect(mocks.isDue).toHaveBeenCalledWith([
      characterKey(1, '/characters/{character_id}/location/'),
      characterKey(1, '/characters/{character_id}/ship/'),
      characterKey(1, '/characters/{character_id}/online/'),
    ]);
    expect(mocks.isDue).toHaveBeenCalledWith([characterKey(1, '/characters/{character_id}/')]);
    expect(mocks.readAuthed).not.toHaveBeenCalled();
    expect(mocks.vendTokenFor).not.toHaveBeenCalled();
  });

  it('starts a fresh memo for every run', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([]);

    await refreshCharacterSheetsOnView('user-1');
    await refreshCharacterSheetsOnView('user-1');

    expect(mocks.listCharactersWithHealth).toHaveBeenCalledTimes(2);
  });

  it('reads structures through the pass-through lookup and routes storage through the queries', async () => {
    const sheet: SheetSections = { wallet: { data: { balance: 1 }, refreshedAt: '2026-09-27T00:00:00.000Z' } };
    mocks.readSheetRow.mockResolvedValue(sheet);
    const port = makeSheetPort();
    const session = port.openSession();

    await port.readStructure(session, 1099000000001, 'token');
    await expect(port.readSheet(7)).resolves.toBe(sheet);
    await expect(port.readSheet(7)).resolves.toBe(sheet);
    expect(mocks.readSheetRow).toHaveBeenCalledTimes(2);
    await port.mergeSection(7, 'wallet', sheet.wallet!);
    await port.stampSection(7, 'wallet');

    expect(mocks.readPassThrough).toHaveBeenCalledWith(STRUCTURE_LOOKUP_ROUTE, { structure_id: 1099000000001 }, 'token');
    expect(mocks.mergeSheetSection).toHaveBeenCalledWith(7, 'wallet', sheet.wallet);
    expect(mocks.stampSheetSection).toHaveBeenCalledWith(7, 'wallet');
  });

  it('commits each section\'s session after its merge', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(1)]);
    mocks.vendTokenFor.mockResolvedValue('token');

    await refreshCharacterSheetsOnView('user-1');

    // Eight direct sections each committed once; the structures pass found nothing to resolve.
    expect(mocks.commit).toHaveBeenCalledTimes(8);
    expect(Math.min(...mocks.commit.mock.invocationCallOrder)).toBeGreaterThan(
      Math.min(...mocks.mergeSheetSection.mock.invocationCallOrder),
    );
  });
});

describe('character sheet budget refusal', () => {
  const target = { ownerType: 'character' as const, ownerId: 1 };
  const budget = new EsiBudgetExhaustedError(12, 'rate_limited', 900, '/characters/1/wallet/');

  beforeEach(() => {
    mocks.listCharactersWithHealth.mockResolvedValue([ownerFixture(1), ownerFixture(2)]);
    mocks.vendTokenFor.mockResolvedValue('token');
  });

  it('reports the blocked section for its character and finishes the other sections', async () => {
    mocks.readAuthed.mockImplementation(async (key: EsiStoreKey) => {
      if (key.route === '/characters/{character_id}/wallet/' && key.holder.kind === 'character' && key.holder.id === 1) throw budget;
      return { kind: 'fresh', body: BODIES[key.route], etag: null };
    });

    const results = await refreshCharacterSheetsOnView('user-1');

    expect(results.filter((result) => result.kind !== 'succeeded')).toEqual([
      { kind: 'deferred_for_budget', target, error: budget },
    ]);
    expect(mocks.mergeSheetSection).toHaveBeenCalledWith(2, 'wallet', expect.anything());
    expect(mocks.mergeSheetSection).not.toHaveBeenCalledWith(1, 'wallet', expect.anything());
  });
});
