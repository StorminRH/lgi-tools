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
import { characterSheets } from '@/features/character-sheet/schema';
import type { SheetSections } from '@/features/character-sheet/types';
import { characterSkills, characterSkillSyncs } from '@/features/skill-queue/schema';
import { EVE_SCOPES } from '@/platform/auth/eve-sso-constants';
import { BOARD_GAPS, boardResponseSchema } from './api-contract';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  resolveEntityNames: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/data/eve-data/entity-names', () => ({ resolveEntityNames: mocks.resolveEntityNames }));
vi.mock('@/composition/sync/skills-sync', () => ({ refreshSkillsOnView: vi.fn() }));
vi.mock('@/composition/sync/industry-jobs-sync', () => ({ refreshJobsOnView: vi.fn() }));
vi.mock('@/composition/sync/character-sheet-sync', () => ({ refreshCharacterSheetsOnView: vi.fn() }));

import { getBoardForUserOnView } from './board-view';

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
  wallet: envelope({ balance: 3204115882.15 }),
  journal: envelope({
    journal: {
      windowStart: '2026-08-28T12:00:00.000Z',
      inflow: 100,
      outflow: 40,
      series: [{ t: 1, balance: 60 }],
      recent: [{ id: 9, date: '2026-09-26T00:00:00Z', refType: 'bounty_prizes', amount: 100, balance: 60, description: 'b' }],
    },
  }),
  structures: envelope({ names: { [ANCHORAGE]: { name: 'Sobaseki - Driftwood Anchorage' } } }),
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
  ]);
  await harness.db.insert(eveTypes).values([
    { id: TENGU, groupId: 963, name: 'Tengu', published: true },
    { id: OCULAR_IMPROVED, groupId: 300, name: 'Ocular Filter - Improved', published: true },
    { id: 3334, groupId: 257, name: 'Caldari Cruiser', published: true },
    { id: 3327, groupId: 257, name: 'Spaceship Command', published: true },
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

async function seedDatasets() {
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
          { key: 'perception', base: 17, implant: 5 },
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
    expect(aurel?.wallet).toEqual({ state: 'ready', refreshedAt: STAMP_MS, data: { balance: 3204115882.15 } });
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

  it('returns an empty roster for a user with no linked characters', async () => {
    await expect(getBoardForUserOnView('nobody')).resolves.toMatchObject({ characters: [] });
  });
});
