import { describe, expect, it } from 'vitest';
import type { SectionEnvelope, SheetSections } from '@/features/character-sheet/types';
import { BOARD_GAPS, type BoardCharacter, type BoardHistoryDay } from './api-contract';
import {
  assembleBoard,
  assembleBoardCharacter,
  type BoardRaw,
  collectNameIds,
  type NameBook,
  netWorthSnapshot,
  toHistoryDay,
} from './board-assemble';

const NOW = Date.parse('2026-09-27T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const REFRESHED = '2026-09-27T11:58:00.000Z';
const REFRESHED_MS = Date.parse(REFRESHED);

const envelope = <K extends keyof SheetSections>(data: NonNullable<SheetSections[K]>['data']): SectionEnvelope<K> =>
  ({ data, refreshedAt: REFRESHED, etags: {} }) as SectionEnvelope<K>;

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
  typeCategories: new Map([[34, 4], [29984, 6], [10217, 20], [10222, 20], [10216, 20], [10208, 20], [44992, 5], [787, 9]]),
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

it('excludes denied active implants from name lookup and valuation while keeping jump-clone implants', () => {
  const ids = collectNameIds([raw({ sheet: {
    ...FULL_SHEET,
    implants: { ...envelope<'implants'>({ implants: [10222, 10217] }), denied: true },
  } })]);
  expect(ids.typeIds).not.toContain(10222);
  expect(ids.typeIds).not.toContain(10217);
  expect(ids.valuationTypeIds).not.toContain(10222);
  expect(ids.valuationTypeIds).not.toContain(10217);
  expect(ids.typeIds).toEqual(expect.arrayContaining([10216, 10208]));
});

describe('assembleBoardCharacter section states', () => {
  it('marks every section reconnect and names every gap when there is no refresh token', () => {
    const character = assembleBoardCharacter(raw({ health: { hasRefreshToken: false, missingScopes: [] } }), NAMES, NOW);
    expect(Object.values(states(character))).toEqual(SECTION_KEYS.map(() => 'reconnect'));
    expect(character.gaps).toEqual([...BOARD_GAPS]);
  });

  it('marks only the sections behind a missing scope reconnect, and names that gap once', () => {
    const health = { hasRefreshToken: true, missingScopes: ['esi-wallet.read_character_wallet.v1'] };
    const character = assembleBoardCharacter(raw({ health }), NAMES, NOW);
    expect(states(character)).toEqual({
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
    expect(character.gaps).toEqual(['wallet']);
  });

  it('is pending everywhere for an eligible character with nothing synced yet', () => {
    const character = assembleBoardCharacter(
      raw({
        sheet: null,
        skills: { data: null, levels: null, refreshedAt: null },
        jobs: { data: null, refreshedAt: null },
        assets: { rows: null, refreshedAt: null },
      }),
      NAMES,
      NOW,
    );
    expect(Object.values(states(character))).toEqual(SECTION_KEYS.map(() => 'pending'));
    expect(character.gaps).toEqual([]);
  });

  it('never serves data from a denied section: it is reconnect and adds its gap', () => {
    const sheet: SheetSections = {
      ...FULL_SHEET,
      wallet: { ...FULL_SHEET.wallet!, denied: true },
      implants: { data: null, refreshedAt: REFRESHED, etags: {}, denied: true },
    };
    const character = assembleBoardCharacter(raw({ sheet }), NAMES, NOW);
    expect(character.wallet).toEqual({ state: 'reconnect' });
    expect(character.implants).toEqual({ state: 'reconnect' });
    expect(character.journal.state).toBe('ready');
    expect(character.gaps).toEqual(['wallet', 'implants']);
    expect(character.attributes).toMatchObject({
      data: { values: expect.arrayContaining([{ key: 'intelligence', base: 27, implant: 0 }]) },
    });
  });
});

describe('assembleBoardCharacter ready data', () => {
  const character = assembleBoardCharacter(raw(), NAMES, NOW);

  it('carries identity and resolves corporation and alliance names', () => {
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
  });

  it('maps skills with derived known and at-V counts', () => {
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
  });

  it('maps the profile straight through', () => {
    expect(character.profile).toEqual({
      state: 'ready',
      refreshedAt: REFRESHED_MS,
      data: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.31 },
    });
  });

  it('names the system, the station dock and the ship type', () => {
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
  });

  it('names a structure dock from the character sheet and falls back for unknown ids', () => {
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

  it('separates implant bonuses from ESI totals and exposes the next remap date', () => {
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
  });

  it('orders implants by slot', () => {
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
  });

  it('maps clones with a station home and a structure jump clone', () => {
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
  });

  it('maps wallet and journal, labelling ref types and dropping the stored raw type', () => {
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
  });

  it('summarises industry: an active job past its end is ready, delivered jobs hold no slot', () => {
    expect(character.industry).toEqual({
      state: 'ready',
      refreshedAt: REFRESHED_MS,
      data: { active: 1, ready: 1, slots: { used: 2, max: 7 } },
    });
  });

  it('counts used slots by the shared slot rule: a repeated job_id or an activity outside the slot categories holds no slot', () => {
    const job = (jobId: number, activityId: number) => ({
      job_id: jobId,
      activity_id: activityId,
      blueprint_type_id: 1002,
      runs: 1,
      status: 'active' as const,
      start_date: '2026-09-27T00:00:00Z',
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
});

describe('net worth valuation', () => {
  const TOTAL = 3204115882.15 + 274_400_000 + 448_000_000 + 1_750 + 216_000_000;
  const pilotOf = (raws: BoardRaw[]) => netWorthSnapshot(raws, NAMES, '2026-09-27').pilots;

  it('values wallet, assets, sell orders, escrow and implants from stored holdings and prices', () => {
    expect(pilotOf([raw()])).toEqual({ '9900000001': { netWorth: TOTAL, liquidIsk: 3204115882.15 } });
  });

  it('leaves out a pilot until both the wallet and the assets have synced, or without the assets scope', () => {
    expect(pilotOf([raw({ assets: { rows: null, refreshedAt: null } })])).toEqual({});
    const { wallet: _wallet, ...noWallet } = FULL_SHEET;
    expect(pilotOf([raw({ sheet: noWallet })])).toEqual({});
    expect(pilotOf([raw({ health: { hasRefreshToken: true, missingScopes: ['esi-assets.read_assets.v1'] } })])).toEqual({});
  });

  it('counts a synced empty hangar and adds nothing from denied implants or orders', () => {
    const sheet: SheetSections = {
      ...FULL_SHEET,
      implants: { data: null, refreshedAt: REFRESHED, etags: {}, denied: true },
      orders: { data: null, refreshedAt: REFRESHED, etags: {}, denied: true },
    };
    expect(pilotOf([raw({ sheet, assets: { rows: [], refreshedAt: REFRESHED_MS } })])).toEqual({
      '9900000001': { netWorth: 3204115882.15 + 36_000_000, liquidIsk: 3204115882.15 },
    });
  });
});

describe('assembleBoardCharacter net worth', () => {
  const day = (date: string, pilots: BoardHistoryDay['pilots']): BoardHistoryDay => ({
    day: date,
    netWorth: 0,
    liquidIsk: 0,
    included: Object.keys(pilots).length,
    total: 2,
    pilots,
  });

  it("serves each pilot's latest recorded day, dated at that day, without valuing on view", () => {
    const other = raw({ identity: { ...raw().identity, characterId: 2 } });
    const board = assembleBoard([raw(), other], NAMES, NOW, [
      day('2026-09-25', { '9900000001': { netWorth: 10, liquidIsk: 4 }, '2': { netWorth: 7, liquidIsk: 1 } }),
      day('2026-09-26', { '9900000001': { netWorth: 12, liquidIsk: 5 } }),
    ]);
    expect(board.characters.map((character) => character.netWorth)).toEqual([
      { state: 'ready', refreshedAt: Date.parse('2026-09-26T00:00:00Z'), data: { total: 12, liquid: 5 } },
      { state: 'ready', refreshedAt: Date.parse('2026-09-25T00:00:00Z'), data: { total: 7, liquid: 1 } },
    ]);
  });

  it('is pending with no recorded day, and reconnect without the assets scope or with a denied wallet', () => {
    expect(assembleBoardCharacter(raw(), NAMES, NOW).netWorth).toEqual({ state: 'pending' });
    const health = { hasRefreshToken: true, missingScopes: ['esi-assets.read_assets.v1'] };
    const character = assembleBoardCharacter(raw({ health }), NAMES, NOW);
    expect(character.netWorth).toEqual({ state: 'reconnect' });
    expect(character.gaps).toEqual(['assets']);
    const denied: SheetSections = { ...FULL_SHEET, wallet: { data: null, refreshedAt: REFRESHED, etags: {}, denied: true } };
    expect(assembleBoardCharacter(raw({ sheet: denied }), NAMES, NOW).netWorth).toEqual({ state: 'reconnect' });
  });
});

describe('collectNameIds', () => {
  it('gathers the ids the name book must resolve, sorted and de-duplicated', () => {
    const other = raw({
      identity: { characterId: 2, name: 'B', portraitUrl: 'https://p/2', corporationId: 1000035, allianceId: 99 },
      sheet: { ...FULL_SHEET, implants: envelope<'implants'>({ implants: [10222] }) },
    });
    expect(collectNameIds([raw(), other])).toEqual({
      typeIds: [10208, 10216, 10217, 10222, 29984],
      systemIds: [30000142],
      stationIds: [60003760],
      entityIds: [99, 1000035],
      valuationTypeIds: [34, 787, 10208, 10216, 10217, 10222, 29984, 44992],
    });
  });

  it('asks for nothing when no sheet exists', () => {
    const bare = raw({
      identity: { characterId: 3, name: 'C', portraitUrl: 'https://p/3', corporationId: null, allianceId: null },
      sheet: null,
      assets: { rows: null, refreshedAt: null },
    });
    expect(collectNameIds([bare])).toEqual({ typeIds: [], systemIds: [], stationIds: [], entityIds: [], valuationTypeIds: [] });
  });
});

describe('netWorthSnapshot and toHistoryDay', () => {
  it('sums only the pilots with a computable net worth and reports included of total', () => {
    const pending = raw({ identity: { ...raw().identity, characterId: 2 }, assets: { rows: null, refreshedAt: null } });
    const snapshot = netWorthSnapshot([raw(), pending], NAMES, '2026-09-27');
    const total = 3204115882.15 + 274_400_000 + 448_000_000 + 1_750 + 216_000_000;
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
  });
});

describe('assembleBoard', () => {
  it('assembles every character and sends the catalog and history once', () => {
    const history = [{ day: '2026-09-26', netWorth: 1, liquidIsk: 1, included: 1, total: 1, pilots: {} }];
    const board = assembleBoard([raw(), raw()], NAMES, NOW, history);
    expect(board.characters).toHaveLength(2);
    expect(board.skillCatalog).toBe(NAMES.skillCatalog);
    expect(board.history).toBe(history);
  });
});
