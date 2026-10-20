import { expect, test } from 'vitest';
import type { SectionEnvelope, SheetSections } from '@/features/character-sheet/types';
import { industryJob } from '@/features/industry-jobs/__tests__/job-fixture';
import { BOARD_GAPS, type BoardCharacter, type BoardHistoryDay } from './api-contract';
import {
  assembleBoard,
  assembleBoardCharacter,
  type BoardRaw,
  collectNameIds,
  collectValuationTypeIds,
  type NameBook,
  netWorthSnapshot,
  toHistoryDay,
  type Valuation,
} from './board-assemble';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const REFRESHED = '2026-09-27T11:58:00.000Z';
const REFRESHED_MS = Date.parse(REFRESHED);

const envelope = <K extends keyof SheetSections>(data: NonNullable<SheetSections[K]>['data']): SectionEnvelope<K> =>
  ({ data, refreshedAt: REFRESHED }) as SectionEnvelope<K>;

const FULL_SHEET: SheetSections = {
  profile: envelope<'profile'>({ character: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.31 } }),
  status: envelope<'status'>({
    location: { solarSystemId: 30000142, stationId: 60003760, structureId: null },
    ship: { shipTypeId: 29984, shipItemId: 1, shipName: 'Quiet Ledger' },
    online: { online: true, lastLogin: '2026-09-27T09:00:00Z', lastLogout: null },
  }),
  attributes: envelope<'attributes'>({
    attributes: {
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      charisma: 17,
      bonusRemaps: 1,
      lastRemapDate: null,
      accruedRemapCooldownDate: '2027-03-11T00:00:00Z',
    },
  }),
  implants: envelope<'implants'>({ implants: [10222, 10217] }),
  clones: envelope<'clones'>({
    clones: {
      home: { locationId: 60003760, locationType: 'station' },
      jumpClones: [
        {
          jumpCloneId: 7,
          location: { locationId: 1099000000001, locationType: 'structure' },
          implantTypeIds: [10216, 10208],
          name: 'Away clone',
        },
      ],
      lastCloneJumpDate: '2026-09-18T12:00:00Z',
    },
  }),
  wallet: envelope<'wallet'>({ balance: 3204115882.15 }),
  journal: envelope<'journal'>({
    journal: {
      windowStart: '2026-08-28T12:00:00.000Z',
      inflow: 100,
      outflow: 40,
      series: [{ t: 1, balance: 60 }],
      recent: [{ id: 9, date: '2026-09-26T00:00:00Z', refType: 'bounty_prizes', amount: 100, balance: 60, description: 'b' }],
    },
  }),
  structures: envelope<'structures'>({ names: { '1099000000001': { kind: 'named', name: 'Sobaseki - Driftwood Anchorage' } } }),
  orders: envelope<'orders'>({
    orders: {
      open: [
        { typeId: 29984, volumeRemain: 2, isBuyOrder: false, escrow: 0 },
        { typeId: 34, volumeRemain: 500, isBuyOrder: true, escrow: 1_750 },
      ],
    },
  }),
};

const NAMES: NameBook = {
  types: new Map([
    [29984, { name: 'Tengu', implantSlot: null, attributeBonus: {} }],
    [10217, { name: 'Ocular Filter - Improved', implantSlot: 1, attributeBonus: { perception: 5 } }],
    [10222, { name: 'Cybernetic Subprocessor - Improved', implantSlot: 4, attributeBonus: { intelligence: 5 } }],
  ]),
  systems: new Map([[30000142, { name: 'Jita', security: 0.945913, secClass: 'high' }]]),
  npcStations: new Map([[60003760, { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: 30000142 }]]),
  entities: { '1000035': 'Caldari Navy' },
  skillCatalog: [{ groupId: 257, name: 'Spaceship Command', skills: [{ typeId: 3327, name: 'Spaceship Command', rank: 1 }] }],
};

const VALUATION: Valuation = {
  prices: new Map([
    [34, { jitaMid: 4, average: 3.5 }],
    [29984, { jitaMid: 228_000_000, average: 224_000_000 }],
    [10217, { jitaMid: 90_000_000, average: 97_000_000 }],
    [10222, { jitaMid: 90_000_000, average: 97_000_000 }],
    [10216, { jitaMid: null, average: 18_000_000 }],
    [10208, { jitaMid: null, average: 18_000_000 }],
    [44992, { jitaMid: 1, average: 4_690_000 }],
    [787, { jitaMid: 2_000_000, average: 2_900_000 }],
  ]),
  categories: new Map([[34, 4], [29984, 6], [10217, 20], [10222, 20], [10216, 20], [10208, 20], [44992, 5], [787, 9]]),
};

const ASSET_ROWS = [
  { typeId: 34, quantity: 1_000_000, locationFlag: 'Hangar' },
  { typeId: 29984, quantity: 1, locationFlag: 'Hangar' },
  { typeId: 44992, quantity: 10, locationFlag: 'Hangar' },
  { typeId: 787, quantity: 1, locationFlag: 'Hangar' },
];

function raw(overrides: Partial<BoardRaw> = {}): BoardRaw {
  return {
    identity: { characterId: 9900000001, name: 'Aurel Vantesse', portraitUrl: 'https://p/1', corporationId: 1000035, allianceId: null },
    health: { hasRefreshToken: true, missingScopes: [] },
    sheet: FULL_SHEET,
    skills: {
      data: { totalSp: 41_512_880, unallocatedSp: 405_000, entries: [{ skill_id: 3334, queue_position: 0, finished_level: 5 }] },
      levels: { '3327': 5, '3334': 4, '3387': 4 },
      refreshedAt: REFRESHED_MS,
    },
    jobs: {
      data: {
        jobs: [
          { job_id: 1, activity_id: 1, blueprint_type_id: 1002, runs: 1, status: 'active', start_date: '2026-09-27T00:00:00Z', end_date: new Date(NOW + HOUR).toISOString() },
          { job_id: 2, activity_id: 1, blueprint_type_id: 1002, runs: 1, status: 'active', start_date: '2026-09-26T00:00:00Z', end_date: new Date(NOW - HOUR).toISOString() },
          { job_id: 3, activity_id: 1, blueprint_type_id: 1002, runs: 1, status: 'delivered', start_date: '2026-09-20T00:00:00Z', end_date: '2026-09-21T00:00:00Z' },
        ],
      },
      refreshedAt: REFRESHED_MS,
    },
    assets: { rows: ASSET_ROWS, refreshedAt: REFRESHED_MS - HOUR },
    ...overrides,
  };
}

const SECTION_KEYS = ['skills', 'profile', 'status', 'attributes', 'implants', 'clones', 'wallet', 'journal', 'industry', 'netWorth'] as const;
const states = (character: BoardCharacter) =>
  Object.fromEntries(SECTION_KEYS.map((key) => [key, character[key].state]));

test('section states: reconnect without a token, per missing scope, pending before a sync, and reconnect for a denied section', () => {
  const noToken = assembleBoardCharacter(raw({ health: { hasRefreshToken: false, missingScopes: [] } }), NAMES, NOW);
  expect(Object.values(states(noToken))).toEqual(SECTION_KEYS.map(() => 'reconnect'));
  expect(noToken.gaps).toEqual([...BOARD_GAPS]);

  const health = { hasRefreshToken: true, missingScopes: ['esi-wallet.read_character_wallet.v1'] };
  const noWallet = assembleBoardCharacter(raw({ health }), NAMES, NOW);
  expect(states(noWallet)).toEqual({
    skills: 'ready',
    profile: 'ready',
    status: 'ready',
    attributes: 'ready',
    implants: 'ready',
    clones: 'ready',
    wallet: 'reconnect',
    journal: 'reconnect',
    industry: 'ready',
    netWorth: 'reconnect',
  });
  expect(noWallet.gaps).toEqual(['wallet']);

  const unsynced = assembleBoardCharacter(
    raw({
      sheet: null,
      skills: { data: null, levels: null, refreshedAt: null },
      jobs: { data: null, refreshedAt: null },
      assets: { rows: null, refreshedAt: null },
    }),
    NAMES,
    NOW,
  );
  expect(Object.values(states(unsynced))).toEqual(SECTION_KEYS.map(() => 'pending'));
  expect(unsynced.gaps).toEqual([]);

  // A denied section never serves its data.
  const sheet: SheetSections = {
    ...FULL_SHEET,
    wallet: { ...FULL_SHEET.wallet!, denied: true },
    implants: { data: null, refreshedAt: REFRESHED, denied: true },
  };
  const denied = assembleBoardCharacter(raw({ sheet }), NAMES, NOW);
  expect(denied.wallet).toEqual({ state: 'reconnect' });
  expect(denied.implants).toEqual({ state: 'reconnect' });
  expect(denied.journal.state).toBe('ready');
  expect(denied.gaps).toEqual(['wallet', 'implants']);
  expect(denied.attributes).toMatchObject({
    data: { values: expect.arrayContaining([{ key: 'intelligence', base: 27, implant: 0 }]) },
  });
});

test('a fully synced pilot assembles every section from its stored data and the name book', () => {
  const character = assembleBoardCharacter(raw(), NAMES, NOW);
  expect(character).toMatchObject({
    characterId: 9900000001,
    name: 'Aurel Vantesse',
    portraitUrl: 'https://p/1',
    corporation: { id: 1000035, name: 'Caldari Navy' },
    alliance: null,
    gaps: [],
  });
  const withAlliance = assembleBoardCharacter(
    raw({ identity: { ...raw().identity, allianceId: 99 } }),
    NAMES,
    NOW,
  );
  expect(withAlliance.alliance).toEqual({ id: 99, name: null });

  // Skills carry derived known and at-V counts.
  expect(character.skills).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: {
      totalSp: 41_512_880,
      unallocatedSp: 405_000,
      queue: [{ skill_id: 3334, queue_position: 0, finished_level: 5 }],
      levels: { '3327': 5, '3334': 4, '3387': 4 },
      known: 3,
      atV: 1,
    },
  });
  expect(character.profile).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.31 },
  });

  // The system, the station dock and the ship type are named.
  const jita = { id: 30000142, name: 'Jita', security: 0.945913, secClass: 'high' };
  expect(character.status).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: {
      online: true,
      lastLogin: '2026-09-27T09:00:00Z',
      system: jita,
      dock: { kind: 'station', id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', system: jita },
      ship: { typeId: 29984, typeName: 'Tengu', name: 'Quiet Ledger' },
    },
  });

  // Implant bonuses come off the ESI totals, and the next remap date is exposed.
  expect(character.attributes).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: {
      values: [
        { key: 'intelligence', base: 22, implant: 5 },
        { key: 'memory', base: 21, implant: 0 },
        { key: 'perception', base: 12, implant: 5 },
        { key: 'willpower', base: 17, implant: 0 },
        { key: 'charisma', base: 17, implant: 0 },
      ],
      bonusRemaps: 1,
      lastRemapDate: null,
      nextRemapDate: '2027-03-11T00:00:00Z',
    },
  });
  // Implants are ordered by slot.
  expect(character.implants).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: {
      implants: [
        { typeId: 10217, name: 'Ocular Filter - Improved', slot: 1 },
        { typeId: 10222, name: 'Cybernetic Subprocessor - Improved', slot: 4 },
      ],
    },
  });
  expect(character.clones).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: {
      home: {
        kind: 'station',
        id: 60003760,
        name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        system: { id: 30000142, name: 'Jita', security: 0.945913, secClass: 'high' },
      },
      lastJumpDate: '2026-09-18T12:00:00Z',
      jumpClones: [
        {
          id: 7,
          name: 'Away clone',
          location: { kind: 'structure', id: 1099000000001, name: 'Sobaseki - Driftwood Anchorage', system: null },
          implantCount: 2,
        },
      ],
    },
  });
  // The journal labels ref types and drops the stored raw type.
  expect(character.wallet).toEqual({ state: 'ready', refreshedAt: REFRESHED_MS, data: { balance: 3204115882.15 } });
  expect(character.journal).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: {
      windowStart: '2026-08-28T12:00:00.000Z',
      inflow: 100,
      outflow: 40,
      series: [{ t: 1, balance: 60 }],
      recent: [{ id: 9, date: '2026-09-26T00:00:00Z', refLabel: 'Bounties', amount: 100, description: 'b' }],
    },
  });
  // An active job past its end is ready; a delivered job holds no slot.
  expect(character.industry).toEqual({
    state: 'ready',
    refreshedAt: REFRESHED_MS,
    data: { active: 1, ready: 1, slots: { used: 2, max: 7 } },
  });
});

test('a structure dock is named from the character sheet, and unknown ids fall back', () => {
  const sheet: SheetSections = {
    ...FULL_SHEET,
    status: envelope<'status'>({
      location: { solarSystemId: 31000005, stationId: null, structureId: 1099000000001 },
      ship: { shipTypeId: 424242, shipItemId: 1, shipName: 'Odd' },
      online: { online: false, lastLogin: null, lastLogout: null },
    }),
  };
  const docked = assembleBoardCharacter(raw({ sheet }), NAMES, NOW);
  expect(docked.status).toMatchObject({
    data: {
      system: { id: 31000005, name: 'Unknown system', security: null, secClass: 'high' },
      dock: {
        kind: 'structure',
        id: 1099000000001,
        name: 'Sobaseki - Driftwood Anchorage',
        system: { id: 31000005, name: 'Unknown system' },
      },
      ship: { typeId: 424242, typeName: 'Unknown ship', name: 'Odd' },
    },
  });
});

test('counts used slots by the shared slot rule: a repeated job_id or an activity outside the slot categories holds no slot', () => {
  const job = (jobId: number, activityId: number) => industryJob({
    job_id: jobId,
    activity_id: activityId,
    status: 'active',
    end_date: new Date(NOW + HOUR).toISOString(),
  });
  const jobs = [job(1, 1), job(1, 1), job(4, 7), job(5, 9)];
  const { industry } = assembleBoardCharacter(
    raw({ jobs: { data: { jobs }, refreshedAt: REFRESHED_MS } }),
    NAMES,
    NOW,
  );
  expect(industry).toMatchObject({ state: 'ready', data: { slots: { used: 2, max: 7 } } });
});

test('a net worth snapshot sums the pilots it can value, and leaves out the rest', () => {
  const pilotOf = (raws: BoardRaw[]) => netWorthSnapshot(raws, VALUATION, '2026-09-27').pilots;
  // Wallet, assets, sell orders, escrow and implants, from stored holdings and prices.
  const total = 3204115882.15 + 274_400_000 + 448_000_000 + 1_750 + 216_000_000;
  const pending = raw({ identity: { ...raw().identity, characterId: 2 }, assets: { rows: null, refreshedAt: null } });
  const snapshot = netWorthSnapshot([raw(), pending], VALUATION, '2026-09-27');
  expect(snapshot).toEqual({
    day: '2026-09-27',
    netWorth: total,
    liquidIsk: 3204115882.15,
    pilotsIncluded: 1,
    pilotsTotal: 2,
    pilots: { '9900000001': { netWorth: total, liquidIsk: 3204115882.15 } },
  });
  expect(toHistoryDay(snapshot)).toEqual({
    day: '2026-09-27',
    netWorth: total,
    liquidIsk: 3204115882.15,
    included: 1,
    total: 2,
    pilots: snapshot.pilots,
  });

  // A pilot waits for both the wallet and the assets, and needs the assets scope.
  const { wallet: _wallet, ...noWallet } = FULL_SHEET;
  expect(pilotOf([raw({ sheet: noWallet })])).toEqual({});
  expect(pilotOf([raw({ health: { hasRefreshToken: true, missingScopes: ['esi-assets.read_assets.v1'] } })])).toEqual({});

  // A synced empty hangar counts; denied implants and orders add nothing.
  const sheet: SheetSections = {
    ...FULL_SHEET,
    implants: { data: null, refreshedAt: REFRESHED, denied: true },
    orders: { data: null, refreshedAt: REFRESHED, denied: true },
  };
  expect(pilotOf([raw({ sheet, assets: { rows: [], refreshedAt: REFRESHED_MS } })])).toEqual({
    '9900000001': { netWorth: 3204115882.15 + 36_000_000, liquidIsk: 3204115882.15 },
  });
});

test("the board serves each pilot's latest recorded net worth day, pending with none, and reconnect without assets or wallet", () => {
  const day = (date: string, pilots: BoardHistoryDay['pilots']): BoardHistoryDay => ({
    day: date,
    netWorth: 0,
    liquidIsk: 0,
    included: Object.keys(pilots).length,
    total: 2,
    pilots,
  });
  const other = raw({ identity: { ...raw().identity, characterId: 2 } });
  const board = assembleBoard([raw(), other], NAMES, NOW, [
    day('2026-09-25', { '9900000001': { netWorth: 10, liquidIsk: 4 }, '2': { netWorth: 7, liquidIsk: 1 } }),
    day('2026-09-26', { '9900000001': { netWorth: 12, liquidIsk: 5 } }),
  ]);
  // Dated at that day, without valuing on view.
  expect(board.characters.map((character) => character.netWorth)).toEqual([
    { state: 'ready', refreshedAt: Date.parse('2026-09-26T00:00:00Z'), data: { total: 12, liquid: 5 } },
    { state: 'ready', refreshedAt: Date.parse('2026-09-25T00:00:00Z'), data: { total: 7, liquid: 1 } },
  ]);

  expect(assembleBoardCharacter(raw(), NAMES, NOW).netWorth).toEqual({ state: 'pending' });
  const health = { hasRefreshToken: true, missingScopes: ['esi-assets.read_assets.v1'] };
  const noAssets = assembleBoardCharacter(raw({ health }), NAMES, NOW);
  expect(noAssets.netWorth).toEqual({ state: 'reconnect' });
  expect(noAssets.gaps).toEqual(['assets']);
  const denied: SheetSections = { ...FULL_SHEET, wallet: { data: null, refreshedAt: REFRESHED, denied: true } };
  expect(assembleBoardCharacter(raw({ sheet: denied }), NAMES, NOW).netWorth).toEqual({ state: 'reconnect' });
});

test('collectNameIds gathers the ids the name book must resolve, sorted and de-duplicated, skipping denied implants', () => {
  const other = raw({
    identity: { characterId: 2, name: 'B', portraitUrl: 'https://p/2', corporationId: 1000035, allianceId: 99 },
    sheet: { ...FULL_SHEET, implants: envelope<'implants'>({ implants: [10222] }) },
  });
  expect(collectNameIds([raw(), other])).toEqual({
    typeIds: [10208, 10216, 10217, 10222, 29984],
    systemIds: [30000142],
    stationIds: [60003760],
    entityIds: [99, 1000035],
  });

  const bare = raw({
    identity: { characterId: 3, name: 'C', portraitUrl: 'https://p/3', corporationId: null, allianceId: null },
    sheet: null,
    assets: { rows: null, refreshedAt: null },
  });
  expect(collectNameIds([bare])).toEqual({ typeIds: [], systemIds: [], stationIds: [], entityIds: [] });

  // Denied active implants are not looked up; jump-clone implants still are.
  const denied = raw({ sheet: {
    ...FULL_SHEET,
    implants: { ...envelope<'implants'>({ implants: [10222, 10217] }), denied: true },
  } });
  expect(collectNameIds([denied]).typeIds).toEqual([10208, 10216, 29984]);
});

test('collectValuationTypeIds gathers every asset, implant and open-order type a snapshot prices, skipping denied implants', () => {
  const other = raw({
    identity: { characterId: 2, name: 'B', portraitUrl: 'https://p/2', corporationId: 1000035, allianceId: 99 },
    sheet: {
      ...FULL_SHEET,
      implants: envelope<'implants'>({ implants: [10222] }),
      orders: envelope<'orders'>({ orders: { open: [{ typeId: 3327, volumeRemain: 1, isBuyOrder: false, escrow: 0 }] } }),
    },
    assets: { rows: [{ typeId: 34, quantity: 5, locationFlag: 'Hangar' }], refreshedAt: REFRESHED_MS },
  });
  expect(collectValuationTypeIds([raw(), other])).toEqual([34, 787, 3327, 10208, 10216, 10217, 10222, 29984, 44992]);

  // Nothing is priced before the first assets sync when no sheet exists.
  expect(collectValuationTypeIds([raw({ sheet: null, assets: { rows: null, refreshedAt: null } })])).toEqual([]);

  const denied = raw({ sheet: {
    ...FULL_SHEET,
    implants: { ...envelope<'implants'>({ implants: [10222, 10217] }), denied: true },
  } });
  expect(collectValuationTypeIds([denied])).toEqual([34, 787, 10208, 10216, 29984, 44992]);
});
