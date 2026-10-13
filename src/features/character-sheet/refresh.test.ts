import { describe, expect, it, vi } from 'vitest';
import type { EsiReadSession } from '@/data/esi-store/session';
import type { SingleOwnerRead } from '@/platform/owner-sync';
import { NO_STATEMENTS, ownerFixture, readSessionFake } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { refreshCharacterSheetForUser } from './refresh';
import { digestJournalBody } from './plan';
import type {
  DirectSectionKey,
  SectionEnvelope,
  SheetEndpoint,
  SheetPort,
  SheetSectionKey,
  SheetSections,
} from './types';

const NOW = new Date('2026-09-27T12:00:00Z');
const NOW_ISO = NOW.toISOString();
const FRESH_STAMP = new Date(NOW.getTime() - 30_000).toISOString();
const STALE_STAMP = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

const BODIES: Record<SheetEndpoint, unknown> = {
  character: { birthday: '2014-03-11T09:42:00Z', security_status: 2.3 },
  location: { solar_system_id: 30001363, structure_id: 1099000000001 },
  ship: { ship_type_id: 29984, ship_item_id: 1, ship_name: 'Quiet Ledger' },
  online: { online: true },
  attributes: { charisma: 17, intelligence: 27, memory: 21, perception: 17, willpower: 17 },
  implants: [10217],
  clones: {
    home_location: { location_id: 1099000000002, location_type: 'structure' },
    jump_clones: [],
  },
  wallet: 12.5,
  journal: [],
  orders: [],
};

const reader = (answer: (endpoint: SheetEndpoint) => SingleOwnerRead) =>
  vi.fn(async (_session: EsiReadSession, _id: number, endpoint: SheetEndpoint): Promise<SingleOwnerRead> => answer(endpoint));

interface FakePort extends SheetPort {
  sheets: Map<number, SheetSections>;
  sessions: EsiReadSession[];
}

/** A session fake that records whether the plan discarded its bodies, in the order against its commit. */
function sheetSessionFake(): EsiReadSession {
  return { ...readSessionFake<EsiReadSession>(), discardBodies: vi.fn() };
}

/**
 * A port whose direct sections are all due unless named in `unexpired`: the
 * response store, not the section stamp, decides that in production.
 */
function makePort(
  overrides: Partial<SheetPort> = {},
  sheets = new Map<number, SheetSections>(),
  unexpired: readonly DirectSectionKey[] = [],
): FakePort {
  const sessions: EsiReadSession[] = [];
  const port: FakePort = {
    sheets,
    sessions,
    now: () => NOW,
    listCharacters: vi.fn(async () => [ownerFixture(1)]),
    vendToken: vi.fn(async () => 'token'),
    isSectionDue: vi.fn(async (_id: number, key: DirectSectionKey) => !unexpired.includes(key)),
    openSession: () => {
      const session = sheetSessionFake();
      sessions.push(session);
      return session;
    },
    readEndpoint: reader((endpoint) => ({ kind: 'fresh', body: BODIES[endpoint], etag: `"${endpoint}"` })),
    readStructure: vi.fn(
      async (_session, structureId): Promise<SingleOwnerRead> => ({ kind: 'fresh', body: { name: `Structure ${structureId}` }, etag: null }),
    ),
    readSheet: vi.fn(async (id) => sheets.get(id) ?? null),
    mergeSection: vi.fn((id, key, envelope) => {
      sheets.set(id, { ...(sheets.get(id) ?? {}), [key]: envelope });
      return NO_STATEMENTS;
    }),
    stampSection: vi.fn(async () => {}),
    recordSectionRefusal: vi.fn(async () => {}),
    ...overrides,
  };
  return port;
}

const endpointsRead = (port: SheetPort) =>
  vi.mocked(port.readEndpoint).mock.calls.map(([, , endpoint]) => endpoint).sort();
const sectionsSaved = (port: SheetPort) =>
  vi.mocked(port.mergeSection).mock.calls.map(([, key]) => key);

function freshSheet(keys: SheetSectionKey[], refreshedAt = FRESH_STAMP): SheetSections {
  const sheet: SheetSections = {};
  for (const key of keys) {
    (sheet as Record<string, SectionEnvelope<SheetSectionKey>>)[key] = {
      data: { names: {} },
      refreshedAt,
    };
  }
  return sheet;
}

const DIRECT_KEYS: DirectSectionKey[] = [
  'profile', 'status', 'attributes', 'implants', 'clones', 'wallet', 'journal', 'orders',
];
const ALL_KEYS: SheetSectionKey[] = [...DIRECT_KEYS, 'structures'];

describe('refreshCharacterSheetForUser', () => {
  it('reads every endpoint once and saves all eight sections for a never-synced character', async () => {
    const port = makePort();

    const results = await refreshCharacterSheetForUser(port, 'u1');

    expect(endpointsRead(port)).toEqual([
      'attributes', 'character', 'clones', 'implants', 'journal', 'location', 'online', 'orders', 'ship', 'wallet',
    ]);
    expect(sectionsSaved(port).sort()).toEqual([...ALL_KEYS].sort());
    expect(results).toHaveLength(9);
    expect(results.every((result) => result.kind === 'succeeded')).toBe(true);
    expect(port.sheets.get(1)?.wallet).toEqual({ data: { balance: 12.5 }, refreshedAt: NOW_ISO });
  });

  it('resolves structures only after status and clones have saved their ids', async () => {
    const port = makePort();

    await refreshCharacterSheetForUser(port, 'u1');

    const structureReads = vi.mocked(port.readStructure).mock.calls.map(([, id]) => id).sort();
    expect(structureReads).toEqual([1099000000001, 1099000000002]);
    const saveOrder = vi.mocked(port.mergeSection).mock.invocationCallOrder;
    const saveKeys = sectionsSaved(port);
    const firstStructureRead = Math.min(...vi.mocked(port.readStructure).mock.invocationCallOrder);
    expect(saveOrder[saveKeys.indexOf('status')]).toBeLessThan(firstStructureRead);
    expect(saveOrder[saveKeys.indexOf('clones')]).toBeLessThan(firstStructureRead);
    expect(port.sheets.get(1)?.structures?.data).toEqual({
      names: {
        '1099000000001': { kind: 'named', name: 'Structure 1099000000001' },
        '1099000000002': { kind: 'named', name: 'Structure 1099000000002' },
      },
    });
  });

  it('reads the sheet once for the direct phase and once for structures', async () => {
    const sheetReads = (port: SheetPort) => vi.mocked(port.readSheet).mock.calls.map(([id]) => id).sort();

    const neverSynced = makePort();
    await refreshCharacterSheetForUser(neverSynced, 'u1');
    expect(sheetReads(neverSynced)).toEqual([1, 1]);
    expect(neverSynced.sheets.get(1)?.structures?.data?.names).toHaveProperty('1099000000001');

    const twoPilots = makePort({ listCharacters: vi.fn(async () => [ownerFixture(1), ownerFixture(2)]) });
    await refreshCharacterSheetForUser(twoPilots, 'u1');
    expect(sheetReads(twoPilots)).toEqual([1, 1, 2, 2]);

    const allFresh = makePort({}, new Map([[1, freshSheet(ALL_KEYS)]]), DIRECT_KEYS);
    await refreshCharacterSheetForUser(allFresh, 'u1');
    expect(sheetReads(allFresh)).toEqual([1]);
    expect(allFresh.readEndpoint).not.toHaveBeenCalled();
  });

  it('makes no vend and no read while every section\'s stored answers are unexpired', async () => {
    const port = makePort({}, new Map([[1, freshSheet(ALL_KEYS)]]), DIRECT_KEYS);

    await refreshCharacterSheetForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readEndpoint).not.toHaveBeenCalled();
    expect(port.readStructure).not.toHaveBeenCalled();
    expect(port.mergeSection).not.toHaveBeenCalled();
  });

  it('refreshes only the sections whose stored answers have expired', async () => {
    const sheet: SheetSections = {
      ...freshSheet(['status', 'attributes', 'implants', 'clones', 'wallet', 'journal', 'orders', 'structures']),
      profile: { data: { character: { birthday: '2014-03-11T09:42:00Z', securityStatus: null } }, refreshedAt: STALE_STAMP },
    };
    const port = makePort({}, new Map([[1, sheet]]), DIRECT_KEYS.filter((key) => key !== 'profile'));

    await refreshCharacterSheetForUser(port, 'u1');

    expect(endpointsRead(port)).toEqual(['character']);
    expect(sectionsSaved(port)).toEqual(['profile']);
  });

  it('skips the sections behind a missing scope and a character without a token', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [
        ownerFixture(1, { missingScopes: ['esi-wallet.read_character_wallet.v1'] }),
        ownerFixture(2, { hasRefreshToken: false }),
      ]),
    });

    await refreshCharacterSheetForUser(port, 'u1');

    expect(endpointsRead(port)).not.toContain('wallet');
    expect(endpointsRead(port)).not.toContain('journal');
    expect(vi.mocked(port.readEndpoint).mock.calls.every(([, id]) => id === 1)).toBe(true);
    expect(sectionsSaved(port).sort()).toEqual(['attributes', 'clones', 'implants', 'orders', 'profile', 'status', 'structures']);
  });

  it('records each direct section of a character whose token is gone as refused, and leaves structures to its own due check', async () => {
    const port = makePort({ vendToken: vi.fn(async () => ({ missing: 'lost' as const })) });

    await refreshCharacterSheetForUser(port, 'u1');

    expect(port.readEndpoint).not.toHaveBeenCalled();
    expect(vi.mocked(port.recordSectionRefusal).mock.calls.map(([id, key, expiresAt]) => [id, key, expiresAt]).sort()).toEqual(
      ['attributes', 'clones', 'implants', 'journal', 'orders', 'profile', 'status', 'wallet'].map((key) => [1, key, null]),
    );
  });

  it('stamps a section whose answer came back unchanged and saves the ones that did not', async () => {
    const sheet: SheetSections = {
      wallet: { data: { balance: 1 }, refreshedAt: STALE_STAMP },
    };
    const port = makePort(
      {
        listCharacters: vi.fn(async () => [ownerFixture(1, { missingScopes: ['esi-location.read_online.v1', 'esi-skills.read_skills.v1', 'esi-clones.read_implants.v1', 'esi-clones.read_clones.v1', 'esi-universe.read_structures.v1', 'esi-markets.read_character_orders.v1'] })]),
        readEndpoint: reader((endpoint) =>
          endpoint === 'wallet' ? { kind: 'unchanged' } : { kind: 'fresh', body: BODIES[endpoint], etag: null },
        ),
      },
      new Map([[1, sheet]]),
    );

    await refreshCharacterSheetForUser(port, 'u1');

    expect(port.readEndpoint).toHaveBeenCalledWith(expect.anything(), 1, 'wallet', 'token');
    expect(port.readEndpoint).toHaveBeenCalledWith(expect.anything(), 1, 'journal', 'token');
    expect(port.readEndpoint).toHaveBeenCalledWith(expect.anything(), 1, 'character', 'token');
    expect(port.stampSection).toHaveBeenCalledWith(1, 'wallet');
    expect(sectionsSaved(port).sort()).toEqual(['journal', 'profile']);
  });

  it('stores a denied envelope on 403 and keeps other sections flowing', async () => {
    const port = makePort({
      readEndpoint: reader((endpoint) =>
        endpoint === 'wallet' ? { kind: 'error', code: 'esi_403' } : { kind: 'fresh', body: BODIES[endpoint], etag: null },
      ),
    });

    await refreshCharacterSheetForUser(port, 'u1');

    expect(port.sheets.get(1)?.wallet).toEqual({ data: null, refreshedAt: NOW_ISO, denied: true });
    expect(port.sheets.get(1)?.journal?.data).toBeDefined();
  });

  it('discards the bodies of a section saved as denied before its session commits, and keeps them for the sections that saved data', async () => {
    const port = makePort({
      readEndpoint: reader((endpoint) =>
        endpoint === 'ship' ? { kind: 'error', code: 'esi_403' } : { kind: 'fresh', body: BODIES[endpoint], etag: `"${endpoint}"` },
      ),
    });

    await refreshCharacterSheetForUser(port, 'u1');

    const discarded = port.sessions.filter((session) => vi.mocked(session.discardBodies).mock.calls.length > 0);
    expect(discarded).toHaveLength(1);
    const [session] = discarded;
    expect(vi.mocked(session!.commit)).toHaveBeenCalledOnce();
    expect(vi.mocked(session!.discardBodies).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(session!.commit).mock.invocationCallOrder[0]!,
    );
    expect(port.sheets.get(1)?.status).toEqual({ data: null, refreshedAt: NOW_ISO, denied: true });
  });

  it('retries hidden structure names once the lookup route\'s published cache time has passed, leaving named entries cached', async () => {
    let now = NOW;
    const port = makePort({
      now: () => now,
      readStructure: vi.fn(async (_session, id): Promise<SingleOwnerRead> =>
        id === 1099000000001 && now === NOW
          ? { kind: 'error', code: 'esi_403' }
          : { kind: 'fresh', body: { name: `Recovered ${id}` }, etag: null },
      ),
    });
    await refreshCharacterSheetForUser(port, 'u1');
    expect(port.sheets.get(1)?.structures?.data?.names['1099000000001']).toEqual({ kind: 'hidden' });
    vi.mocked(port.readStructure).mockClear();

    now = new Date(NOW.getTime() + 30 * 60_000);
    await refreshCharacterSheetForUser(port, 'u1');
    expect(port.readStructure).not.toHaveBeenCalled();

    now = new Date(NOW.getTime() + 60 * 60_000 + 1);
    await refreshCharacterSheetForUser(port, 'u1');
    expect(vi.mocked(port.readStructure).mock.calls.map(([, id]) => id)).toEqual([1099000000001]);
    expect(port.sheets.get(1)?.structures?.data?.names['1099000000001'])
      .toEqual({ kind: 'named', name: 'Recovered 1099000000001' });
  });

  it('reads unseen structures immediately without retrying a still-fresh hidden entry', async () => {
    const port = makePort({
      readStructure: vi.fn(async (_session, id): Promise<SingleOwnerRead> =>
        id === 1099000000001
          ? { kind: 'error', code: 'esi_403' }
          : { kind: 'fresh', body: { name: `Structure ${id}` }, etag: null },
      ),
    });
    await refreshCharacterSheetForUser(port, 'u1');
    const sheet = port.sheets.get(1)!;
    delete sheet.structures!.data!.names['1099000000002'];
    vi.mocked(port.readStructure).mockClear();

    await refreshCharacterSheetForUser(port, 'u1');
    expect(vi.mocked(port.readStructure).mock.calls.map(([, id]) => id)).toEqual([1099000000002]);
    expect(port.sheets.get(1)?.structures?.data?.names['1099000000001']).toEqual({ kind: 'hidden' });
  });

  it('fetches a full journal body to advance an unchanged empty window', async () => {
    const earlier = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000);
    const sheet: SheetSections = {
      ...freshSheet(ALL_KEYS),
      journal: {
        data: { journal: digestJournalBody([], earlier)! },
        refreshedAt: earlier.toISOString(),
      },
    };
    const port = makePort({}, new Map([[1, sheet]]), DIRECT_KEYS.filter((key) => key !== 'journal'));
    await refreshCharacterSheetForUser(port, 'u1');
    expect(port.readEndpoint).toHaveBeenCalledExactlyOnceWith(expect.anything(), 1, 'journal', 'token');
    expect(port.sheets.get(1)?.journal?.data?.journal.windowStart)
      .toBe(new Date(NOW.getTime() - 30 * 24 * 60 * 60_000).toISOString());
    expect(port.stampSection).not.toHaveBeenCalled();
  });

  it('returns a retryable failure for an unexpected journal 304 without saving or stamping', async () => {
    const sheet: SheetSections = {
      ...freshSheet(ALL_KEYS),
      journal: {
        data: { journal: digestJournalBody([], new Date(STALE_STAMP))! },
        refreshedAt: STALE_STAMP,
      },
    };
    const port = makePort(
      { readEndpoint: reader(() => ({ kind: 'unchanged' })) },
      new Map([[1, sheet]]),
      DIRECT_KEYS.filter((key) => key !== 'journal'),
    );

    const results = await refreshCharacterSheetForUser(port, 'u1');

    expect(results.filter((result) => result.kind !== 'succeeded')).toEqual([
      { kind: 'failed_retryable', target: { ownerType: 'character', ownerId: 1 }, code: 'esi_server_error' },
    ]);
    expect(port.readEndpoint).toHaveBeenCalledExactlyOnceWith(expect.anything(), 1, 'journal', 'token');
    expect(port.mergeSection).not.toHaveBeenCalled();
    expect(port.stampSection).not.toHaveBeenCalled();
    expect(port.sheets.get(1)?.journal?.refreshedAt).toBe(STALE_STAMP);
  });

  it('reports a retryable failure for a server error without saving or stamping that section', async () => {
    const port = makePort({
      readEndpoint: reader((endpoint) =>
        endpoint === 'ship' ? { kind: 'error', code: 'esi_server_error' } : { kind: 'fresh', body: BODIES[endpoint], etag: null },
      ),
    });

    const results = await refreshCharacterSheetForUser(port, 'u1');

    expect(port.sheets.get(1)?.status).toBeUndefined();
    expect(sectionsSaved(port)).not.toContain('status');
    expect(results.filter((result) => result.kind !== 'succeeded')).toEqual([
      { kind: 'failed_retryable', target: { ownerType: 'character', ownerId: 1 }, code: 'esi_server_error' },
    ]);
  });
});
