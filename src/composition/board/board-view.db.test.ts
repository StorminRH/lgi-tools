import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import {
  dgmAttributeTypes,
  eveGroups,
  eveNpcStations,
  eveSolarSystems,
  eveTypes,
  typeDogma,
} from '@/data/eve-data/schema';
import { adjustedPrices } from '@/data/industry-indices/schema';
import { marketPrices } from '@/data/market-prices/schema';
import { characterSheets } from '@/features/character-sheet/schema';
import * as sheetQueries from '@/features/character-sheet/queries';
import type { SheetSections } from '@/features/character-sheet/types';
import { netWorthDays } from '@/features/net-worth/schema';
import { ownedAssets, ownedAssetSyncs } from '@/features/owned-assets/schema';
import { characterSkills, characterSkillSyncs } from '@/features/skill-queue/schema';
import { EVE_SCOPES } from '@/platform/auth/eve-sso-constants';
import { BOARD_GAPS, boardResponseSchema } from './api-contract';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  resolveEntityNames: vi.fn(),
  refreshSheets: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/data/eve-data/entity-names', () => ({ resolveEntityNames: mocks.resolveEntityNames }));
vi.mock('@/composition/sync/skills-sync', () => ({ refreshSkillsOnView: vi.fn() }));
vi.mock('@/composition/sync/industry-jobs-sync', () => ({ refreshJobsOnView: vi.fn() }));
vi.mock('@/composition/sync/character-sheet-sync', () => ({ refreshCharacterSheetsOnView: mocks.refreshSheets }));
vi.mock('@/composition/sync/owned-assets-sync', () => ({ refreshCharacterAssetsOnView: vi.fn() }));

import { getBoardForUserOnView, recordNetWorthSnapshot } from './board-view';

const harness = await createDbTestHarness({
  schema: 'test_board_view',
  tables: [
    'user',
    'account',
    'characters',
    'character_sheets',
    'character_skills',
    'character_skill_syncs',
    'character_industry_jobs',
    'character_industry_job_syncs',
    'eve_groups',
    'eve_types',
    'eve_solar_systems',
    'eve_npc_stations',
    'type_dogma',
    'dgm_attribute_types',
    'owned_assets',
    'owned_asset_syncs',
    'market_prices',
    'adjusted_prices',
    'net_worth_days',
  ],
  foreignKeys: [
    { table: 'net_worth_days', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
});

const USER_ID = 'board-user';
const AUREL = 90000101;
const BRAM = 90000102;
const ILYANA = 90000103;
const CALDARI_NAVY = 1000035;
const ALLIANCE = 99000001;
const JITA = 30000142;
const AMARR = 30002187;
const JITA_4_4 = 60003760;
const AMARR_ORIS = 60008494;
const ANCHORAGE = 1099000000001;
const TENGU = 29984;
const OCULAR_IMPROVED = 10217;
const TRITANIUM = 34;
const PYERITE = 35;
const PLEX = 44992;
const RIFTER_BLUEPRINT = 787;
const TENGU_SKIN = 45843;
const CALDARI_CRUISER_SKILLBOOK = 3334;
const ISHTAR = 12005;
const CARACAL = 621;

const WALLET = 3204115882.15;
/** Tritanium min(4.0, 3.5); Tengu min(228M, 224M); PLEX at average; Ishtar's junk bid is floored away so min(ask 139.095M, average); Caracal likewise, no average, so the ask. */
const ASSET_VALUE = 1_000_000 * 3.5 + 224_000_000 + 10 * 4_690_000 + 138_145_641.51 + 12_000_000;
const SELL_ORDERS = 2 * 224_000_000;
const BUY_ESCROW = 1_750;
const IMPLANTS = 2 * 90_000_000;
const NET_WORTH = Math.round((WALLET + ASSET_VALUE + SELL_ORDERS + BUY_ESCROW + IMPLANTS) * 100) / 100;

const STAMP = '2026-09-27T11:58:00.000Z';
const STAMP_MS = Date.parse(STAMP);

const ENTITY_NAMES: Record<string, string> = {
  [CALDARI_NAVY]: 'Caldari Navy',
  [ALLIANCE]: 'Halcyon Drift',
  [AMARR_ORIS]: 'Amarr VIII (Oris) - Emperor Family Academy',
};

const envelope = <T>(data: T) => ({ data, refreshedAt: STAMP, etags: {} });

const AUREL_SHEET: SheetSections = {
  profile: envelope({ character: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.31 } }),
  status: envelope({
    location: { solarSystemId: JITA, stationId: JITA_4_4, structureId: null },
    ship: { shipTypeId: TENGU, shipItemId: 1, shipName: 'Quiet Ledger' },
    online: { online: true, lastLogin: '2026-09-27T09:00:00Z', lastLogout: null },
  }),
  attributes: envelope({
    attributes: {
      intelligence: 27, memory: 21, perception: 17, willpower: 17, charisma: 17,
      bonusRemaps: 1, lastRemapDate: null, accruedRemapCooldownDate: '2027-03-11T00:00:00Z',
    },
  }),
  implants: envelope({ implants: [OCULAR_IMPROVED] }),
  clones: envelope({
    clones: {
      home: { locationId: AMARR_ORIS, locationType: 'station' as const },
      jumpClones: [
        {
          jumpCloneId: 7,
          location: { locationId: ANCHORAGE, locationType: 'structure' as const },
          implantTypeIds: [OCULAR_IMPROVED],
          name: null,
        },
      ],
      lastCloneJumpDate: '2026-09-18T12:00:00Z',
    },
  }),
  wallet: envelope({ balance: WALLET }),
  journal: envelope({
    journal: {
      windowStart: '2026-08-28T12:00:00.000Z',
      inflow: 100,
      outflow: 40,
      series: [{ t: 1, balance: 60 }],
      recent: [{ id: 9, date: '2026-09-26T00:00:00Z', refType: 'bounty_prizes', amount: 100, balance: 60, description: 'b' }],
    },
  }),
  structures: envelope({ names: { [ANCHORAGE]: { kind: 'named', name: 'Sobaseki - Driftwood Anchorage' } } }),
  orders: envelope({
    orders: {
      open: [
        { typeId: TENGU, volumeRemain: 2, isBuyOrder: false, escrow: 0 },
        { typeId: TRITANIUM, volumeRemain: 500, isBuyOrder: true, escrow: BUY_ESCROW },
      ],
    },
  }),
};

const group = (id: number, categoryId: number, name: string) => ({
  id, categoryId, name, useBasePrice: false, anchored: false, anchorable: false, fittableNonSingleton: false, published: true,
});
const attribute = (id: number, name: string) => ({ id, name, published: true, stackable: true, highIsGood: true });

async function seedSde() {
  await harness.db.insert(eveGroups).values([
    group(257, 16, 'Spaceship Command'),
    group(963, 6, 'Strategic Cruiser'),
    group(300, 20, 'Cyberimplant'),
    group(18, 4, 'Mineral'),
    group(1875, 5, 'PLEX'),
    group(105, 9, 'Frigate Blueprint'),
    group(1950, 91, 'Ship SKINs'),
  ]);
  await harness.db.insert(eveTypes).values([
    { id: TENGU, groupId: 963, name: 'Tengu', published: true, marketGroupId: 1139 },
    { id: OCULAR_IMPROVED, groupId: 300, name: 'Ocular Filter - Improved', published: true, marketGroupId: 1000 },
    { id: CALDARI_CRUISER_SKILLBOOK, groupId: 257, name: 'Caldari Cruiser', published: true, marketGroupId: 377 },
    { id: 3327, groupId: 257, name: 'Spaceship Command', published: true },
    { id: TRITANIUM, groupId: 18, name: 'Tritanium', published: true, marketGroupId: 1857 },
    { id: PYERITE, groupId: 18, name: 'Pyerite', published: true, marketGroupId: 1857 },
    { id: PLEX, groupId: 1875, name: 'PLEX', published: true, marketGroupId: 1923 },
    { id: RIFTER_BLUEPRINT, groupId: 105, name: 'Rifter Blueprint', published: true, marketGroupId: 1361 },
    { id: TENGU_SKIN, groupId: 1950, name: 'Tengu Exoplanets Hunter SKIN', published: true, marketGroupId: 2370 },
    { id: ISHTAR, groupId: 963, name: 'Ishtar', published: true, marketGroupId: 1139 },
    { id: CARACAL, groupId: 963, name: 'Caracal', published: true, marketGroupId: 75 },
  ]);
  await harness.db.insert(dgmAttributeTypes).values([
    attribute(331, 'implantness'),
    attribute(178, 'perceptionBonus'),
    attribute(275, 'skillTimeConstant'),
  ]);
  await harness.db.insert(typeDogma).values([
    { typeId: OCULAR_IMPROVED, attributes: { 331: 1, 178: 5 } },
    { typeId: 3334, attributes: { 275: 5 } },
    { typeId: 3327, attributes: { 275: 1 } },
  ]);
  await harness.db.insert(eveSolarSystems).values([
    { id: JITA, constellationId: 1, regionId: 1, name: 'Jita', securityStatus: 0.945913 },
    { id: AMARR, constellationId: 1, regionId: 1, name: 'Amarr', securityStatus: 0.949 },
  ]);
  await harness.db.insert(eveNpcStations).values([
    {
      id: JITA_4_4, solarSystemId: JITA, operationId: 14, typeId: 52678, ownerId: CALDARI_NAVY,
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      manufacturingCapable: true, researchCapable: true, industryCapable: true,
    },
    {
      id: AMARR_ORIS, solarSystemId: AMARR, operationId: 32, typeId: 1932, ownerId: 1000086, name: null,
      manufacturingCapable: false, researchCapable: false, industryCapable: false,
    },
  ]);
}

async function seedRoster() {
  await seedUser(harness.db, USER_ID);
  await seedCharacter(harness.db, AUREL, {
    name: 'Aurel Vantesse', portraitUrl: 'https://p/1', corporationId: CALDARI_NAVY, allianceId: ALLIANCE,
  });
  await seedCharacter(harness.db, BRAM, { name: 'Bram Oskarsen', portraitUrl: 'https://p/2' });
  await seedCharacter(harness.db, ILYANA, { name: 'Ilyana Mirek', portraitUrl: 'https://p/3', corporationId: 1000086 });
  await seedEveAccount(harness.db, { id: 'a1', characterId: AUREL, userId: USER_ID }, {
    refreshToken: 'rt', scope: EVE_SCOPES.join(' '), createdAt: new Date('2026-07-01T00:00:00Z'),
  });
  await seedEveAccount(harness.db, { id: 'a2', characterId: BRAM, userId: USER_ID }, {
    refreshToken: null, scope: EVE_SCOPES.join(' '), createdAt: new Date('2026-07-02T00:00:00Z'),
  });
  await seedEveAccount(harness.db, { id: 'a3', characterId: ILYANA, userId: USER_ID }, {
    refreshToken: 'rt', scope: 'publicData', createdAt: new Date('2026-07-03T00:00:00Z'),
  });
}

function priceRow(typeId: number, pct5: number) {
  return {
    typeId,
    bestBuy: pct5,
    bestSell: pct5,
    pct5Buy: pct5,
    pct5Sell: pct5,
    updatedAt: new Date(STAMP),
    staleAfter: new Date('2026-09-28T00:00:00Z'),
    source: 'esi',
  };
}

async function seedWealth() {
  const hangar = (typeId: number, quantity: number, locationFlag = 'Hangar') => ({
    ownerType: 'character' as const, ownerId: AUREL, typeId, quantity, locationId: JITA_4_4, locationFlag, locationType: 'station',
  });
  await harness.db.insert(ownedAssets).values([
    hangar(TRITANIUM, 1_000_000),
    hangar(PYERITE, 500),
    hangar(TENGU, 1),
    hangar(PLEX, 10),
    hangar(RIFTER_BLUEPRINT, 1),
    hangar(TENGU_SKIN, 1),
    hangar(CALDARI_CRUISER_SKILLBOOK, 1, 'Skill'),
    hangar(ISHTAR, 1),
    hangar(CARACAL, 1),
  ]);
  await harness.db.insert(ownedAssetSyncs).values({
    ownerType: 'character', ownerId: AUREL, lastRefreshedAt: new Date(STAMP), pageEtags: [],
  });
  await harness.db.insert(marketPrices).values([
    { ...priceRow(TRITANIUM, 4), pct5Buy: 3.95, pct5Sell: 4.05 },
    { ...priceRow(TENGU, 228_000_000), pct5Buy: 227_900_000, pct5Sell: 228_100_000 },
    priceRow(OCULAR_IMPROVED, 90_000_000),
    priceRow(PLEX, 1),
    priceRow(RIFTER_BLUEPRINT, 2_000_000),
    priceRow(TENGU_SKIN, 500_000_000),
    priceRow(CALDARI_CRUISER_SKILLBOOK, 1_000_000),
    { ...priceRow(ISHTAR, 139_095_000), bestBuy: 3_300_000, pct5Buy: 3_275_400, pct5Sell: 139_095_000 },
    { ...priceRow(CARACAL, 12_000_000), bestBuy: 500_000, pct5Buy: 490_497, pct5Sell: 12_000_000 },
  ]);
  await harness.db.insert(adjustedPrices).values([
    { typeId: TRITANIUM, adjustedPrice: 3.07, averagePrice: 3.5, updatedAt: new Date(STAMP) },
    { typeId: TENGU, adjustedPrice: 149_000_000, averagePrice: 224_000_000, updatedAt: new Date(STAMP) },
    { typeId: OCULAR_IMPROVED, adjustedPrice: 78_000_000, averagePrice: 97_000_000, updatedAt: new Date(STAMP) },
    { typeId: PLEX, adjustedPrice: 0, averagePrice: 4_690_000, updatedAt: new Date(STAMP) },
    { typeId: RIFTER_BLUEPRINT, adjustedPrice: 0, averagePrice: 2_900_000, updatedAt: new Date(STAMP) },
    { typeId: ISHTAR, adjustedPrice: 100_000_000, averagePrice: 138_145_641.51, updatedAt: new Date(STAMP) },
  ]);
  await harness.db.insert(netWorthDays).values([
    { userId: USER_ID, day: '2026-09-25', netWorth: 100, liquidIsk: 50, pilotsIncluded: 1, pilotsTotal: 3, pilots: { [AUREL]: { netWorth: 100, liquidIsk: 50 } }, recordedAt: new Date(STAMP) },
    { userId: USER_ID, day: '2026-09-20', netWorth: 90, liquidIsk: 40, pilotsIncluded: 1, pilotsTotal: 3, pilots: { [AUREL]: { netWorth: 90, liquidIsk: 40 } }, recordedAt: new Date(STAMP) },
  ]);
}

async function seedDatasets() {
  await seedWealth();
  await harness.db.insert(characterSheets).values({
    characterId: AUREL, sections: AUREL_SHEET, lastRefreshedAt: new Date(STAMP),
  });
  await harness.db.insert(characterSkills).values({
    characterId: AUREL,
    totalSp: 41_512_880,
    unallocatedSp: 405_000,
    queue: [{ skill_id: 3334, queue_position: 0, finished_level: 5 }],
    skillLevels: { '3334': 5, '3327': 5, '3387': 4 },
  });
  await harness.db.insert(characterSkillSyncs).values({
    characterId: AUREL, lastRefreshedAt: new Date(STAMP), queueEtag: null, skillsEtag: null,
  });
  const jobs = [
    { job_id: 1, activity_id: 1, blueprint_type_id: 1002, runs: 1, status: 'active', start_date: '2026-09-27T00:00:00Z', end_date: '2099-01-01T00:00:00Z' },
    { job_id: 2, activity_id: 1, blueprint_type_id: 1002, runs: 1, status: 'active', start_date: '2026-09-26T00:00:00Z', end_date: '2026-09-27T01:00:00Z' },
  ];
  await harness.sql`
    INSERT INTO character_industry_jobs (character_id, jobs) VALUES (${AUREL}, ${JSON.stringify(jobs)}::jsonb)
  `;
  await harness.sql`
    INSERT INTO character_industry_job_syncs (character_id, last_refreshed_at, jobs_etag)
    VALUES (${AUREL}, ${STAMP}::timestamptz, NULL)
  `;
}

describe.skipIf(!harness.reachable)('getBoardForUserOnView assembles the board from Neon', () => {
  beforeAll(async () => {
    mocks.resolveEntityNames.mockImplementation(async (ids: number[]) =>
      Object.fromEntries(ids.flatMap((id) => (ENTITY_NAMES[id] ? [[String(id), ENTITY_NAMES[id]]] : []))),
    );
    await seedSde();
    await seedRoster();
    await seedDatasets();
  });

  it('returns a contract-valid board with no scope strings and one write-behind', async () => {
    const board = await getBoardForUserOnView(USER_ID);

    expect(boardResponseSchema.parse(board)).toEqual(board);
    expect(JSON.stringify(board)).not.toContain('esi-');
    expect(board.characters.map((c) => c.characterId)).toEqual([AUREL, BRAM, ILYANA]);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.resolveEntityNames).toHaveBeenCalledWith([CALDARI_NAVY, 1000086, ALLIANCE, AMARR_ORIS]);
  });

  it('names every section of a fully synced character from the SDE, the sheet and the names resolver', async () => {
    const [aurel] = (await getBoardForUserOnView(USER_ID)).characters;
    const jita = { id: JITA, name: 'Jita', security: 0.945913, secClass: 'high' };
    const amarr = { id: AMARR, name: 'Amarr', security: 0.949, secClass: 'high' };

    expect(aurel).toMatchObject({
      name: 'Aurel Vantesse',
      portraitUrl: 'https://p/1',
      corporation: { id: CALDARI_NAVY, name: 'Caldari Navy' },
      alliance: { id: ALLIANCE, name: 'Halcyon Drift' },
      gaps: [],
    });
    expect(aurel?.profile).toEqual({
      state: 'ready', refreshedAt: STAMP_MS, data: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.31 },
    });
    expect(aurel?.status).toEqual({
      state: 'ready',
      refreshedAt: STAMP_MS,
      data: {
        online: true,
        lastLogin: '2026-09-27T09:00:00Z',
        system: jita,
        dock: { kind: 'station', id: JITA_4_4, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', system: jita },
        ship: { typeId: TENGU, typeName: 'Tengu', name: 'Quiet Ledger' },
      },
    });
    expect(aurel?.attributes).toMatchObject({
      data: {
        values: [
          { key: 'intelligence', base: 27, implant: 0 },
          { key: 'memory', base: 21, implant: 0 },
          { key: 'perception', base: 12, implant: 5 },
          { key: 'willpower', base: 17, implant: 0 },
          { key: 'charisma', base: 17, implant: 0 },
        ],
        nextRemapDate: '2027-03-11T00:00:00Z',
      },
    });
    expect(aurel?.implants).toEqual({
      state: 'ready',
      refreshedAt: STAMP_MS,
      data: { implants: [{ typeId: OCULAR_IMPROVED, name: 'Ocular Filter - Improved', slot: 1 }] },
    });
    expect(aurel?.clones).toEqual({
      state: 'ready',
      refreshedAt: STAMP_MS,
      data: {
        home: { kind: 'station', id: AMARR_ORIS, name: 'Amarr VIII (Oris) - Emperor Family Academy', system: amarr },
        lastJumpDate: '2026-09-18T12:00:00Z',
        jumpClones: [
          {
            id: 7,
            name: null,
            location: { kind: 'structure', id: ANCHORAGE, name: 'Sobaseki - Driftwood Anchorage', system: null },
            implantCount: 1,
          },
        ],
      },
    });
    expect(aurel?.wallet).toEqual({ state: 'ready', refreshedAt: STAMP_MS, data: { balance: WALLET } });
    expect(aurel?.journal).toMatchObject({
      data: { recent: [{ id: 9, refLabel: 'Bounties', amount: 100, description: 'b' }] },
    });
    expect(aurel?.skills).toEqual({
      state: 'ready',
      refreshedAt: STAMP_MS,
      data: {
        totalSp: 41_512_880,
        unallocatedSp: 405_000,
        queue: [{ skill_id: 3334, queue_position: 0, finished_level: 5 }],
        levels: { '3334': 5, '3327': 5, '3387': 4 },
        known: 3,
        atV: 2,
      },
    });
    expect(aurel?.industry).toEqual({
      state: 'ready',
      refreshedAt: STAMP_MS,
      data: { active: 1, ready: 1, slots: { used: 2, max: 7 } },
    });
  });

  it('sends the catalog once and derives reconnect states from token and scope health', async () => {
    const board = await getBoardForUserOnView(USER_ID);
    expect(board.skillCatalog).toEqual([
      {
        groupId: 257,
        name: 'Spaceship Command',
        skills: [
          { typeId: 3334, name: 'Caldari Cruiser', rank: 5 },
          { typeId: 3327, name: 'Spaceship Command', rank: 1 },
        ],
      },
    ]);

    const [, bram, ilyana] = board.characters;
    expect(bram?.gaps).toEqual([...BOARD_GAPS]);
    expect(bram?.corporation).toBeNull();
    expect(bram?.skills).toEqual({ state: 'reconnect' });
    expect(bram?.wallet).toEqual({ state: 'reconnect' });

    expect(ilyana?.gaps).toEqual(expect.arrayContaining(['skills', 'location', 'industry']));
    expect(ilyana?.corporation).toEqual({ id: 1000086, name: null });
    expect(ilyana?.profile).toEqual({ state: 'pending' });
    expect(ilyana?.skills).toEqual({ state: 'reconnect' });
    expect(ilyana?.status).toEqual({ state: 'reconnect' });
  });

  it('values the synced pilot from stored prices only, flooring junk bids and excluding blueprints, SKINs and skillbooks', async () => {
    const board = await getBoardForUserOnView(USER_ID);
    const [aurel, bram, ilyana] = board.characters;

    expect(aurel?.netWorth).toEqual({
      state: 'ready',
      refreshedAt: STAMP_MS,
      data: {
        total: NET_WORTH,
        liquid: WALLET,
        assets: ASSET_VALUE,
        sellOrders: SELL_ORDERS,
        buyEscrow: BUY_ESCROW,
        implants: IMPLANTS,
      },
    });
    expect(ASSET_VALUE).toBe(424_545_641.51);
    expect(NET_WORTH).toBe(4_256_663_273.66);
    expect(bram?.netWorth).toEqual({ state: 'reconnect' });
    expect(ilyana?.netWorth).toEqual({ state: 'reconnect' });
    expect(board.history).toEqual([
      { day: '2026-09-20', netWorth: 90, liquidIsk: 40, included: 1, total: 3, pilots: { [AUREL]: { netWorth: 90, liquidIsk: 40 } } },
      { day: '2026-09-25', netWorth: 100, liquidIsk: 50, included: 1, total: 3, pilots: { [AUREL]: { netWorth: 100, liquidIsk: 50 } } },
    ]);
  });

  it('records the day after the write-behind and seeds price rows for unpriced marketable types', async () => {
    await recordNetWorthSnapshot(USER_ID, new Date(STAMP));

    const rows = await harness.db.select().from(netWorthDays).orderBy(netWorthDays.day);
    expect(rows.map((row) => row.day)).toEqual(['2026-09-20', '2026-09-25', '2026-09-27']);
    expect(rows[2]).toEqual({
      userId: USER_ID,
      day: '2026-09-27',
      netWorth: NET_WORTH,
      liquidIsk: WALLET,
      pilotsIncluded: 1,
      pilotsTotal: 3,
      pilots: { [AUREL]: { netWorth: NET_WORTH, liquidIsk: WALLET } },
      recordedAt: new Date(STAMP),
    });

    const [pyerite] = await harness.db.select().from(marketPrices).where(eq(marketPrices.typeId, PYERITE));
    expect(pyerite).toMatchObject({ typeId: PYERITE, pct5Buy: null, pct5Sell: null, staleAfter: new Date(0), source: 'esi' });
    expect((await getBoardForUserOnView(USER_ID)).history).toHaveLength(3);
  });

  it('returns an empty roster for a user with no linked characters', async () => {
    await expect(getBoardForUserOnView('nobody')).resolves.toMatchObject({ characters: [], history: [] });
  });

  it.each([false, true])('records the refreshed wallet through after even with a stale sheet cache (first view: %s)', async (firstView) => {
    const userId = `refresh-user-${firstView}`;
    const characterId = firstView ? 90000201 : 90000202;
    await seedUser(harness.db, userId);
    await seedCharacter(harness.db, characterId);
    await seedEveAccount(harness.db, { id: userId, characterId, userId }, {
      refreshToken: 'rt', scope: EVE_SCOPES.join(' '),
    });
    await harness.db.insert(ownedAssetSyncs).values({ ownerType: 'character', ownerId: characterId, lastRefreshedAt: new Date(STAMP) });
    if (!firstView) await sheetQueries.mergeSheetSection(characterId, 'wallet', {
      data: { balance: 100 }, refreshedAt: STAMP, etags: {},
    });
    const staleSheets = await sheetQueries.getCharacterSheets([characterId]);
    const cachedRead = vi.spyOn(sheetQueries, 'getCharacterSheets').mockResolvedValue(staleSheets);
    mocks.refreshSheets.mockImplementationOnce(async () => {
      await sheetQueries.mergeSheetSection(characterId, 'wallet', {
        data: { balance: 750 }, refreshedAt: STAMP, etags: {},
      });
    });
    try {
      const before = await getBoardForUserOnView(userId);
      expect(before.characters[0]?.wallet).toMatchObject(firstView ? { state: 'pending' } : { data: { balance: 100 } });
      const callback = mocks.after.mock.lastCall?.[0] as () => Promise<void>;
      await callback();
      const [row] = await harness.db.select().from(netWorthDays).where(eq(netWorthDays.userId, userId));
      expect(row).toMatchObject({ day: new Date().toISOString().slice(0, 10), liquidIsk: 750, netWorth: 750 });
      expect(row?.pilots).toEqual({ [characterId]: { liquidIsk: 750, netWorth: 750 } });
      expect(cachedRead).toHaveBeenCalledTimes(1);
    } finally {
      cachedRead.mockRestore();
    }
  });
});
