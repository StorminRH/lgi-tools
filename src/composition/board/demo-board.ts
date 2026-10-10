import type { AttributeKey } from '@/data/eve-data/character-attributes';
import { systemSecurityClass } from '@/data/eve-data/security';
import { digestJournalBody } from '@/features/character-sheet/plan';
import { SHEET_SECTION_SCOPES } from '@/features/character-sheet/sync-eligibility';
import type {
  AttributesPart,
  ClonesPart,
  SectionEnvelope,
  SheetSectionData,
  SheetSectionKey,
  SheetSections,
} from '@/features/character-sheet/types';
import type { IndustryJob } from '@/features/industry-jobs/esi-projection';
import type { SkillQueueEntry } from '@/features/skill-queue/esi-projection';
import { characterPortraitUrl } from '@/lib/eve-image';
import { roundIsk } from '@/lib/math';
import type { AssetLine, PriceBook, TypeCategories } from '@/features/net-worth/valuation';
import type { BoardHistoryDay, BoardResponse, SkillCatalogGroup } from './api-contract';
import {
  assembleBoard,
  type BoardRaw,
  type NameBook,
  netWorthSnapshot,
  toHistoryDay,
  type TypeFacts,
} from './board-assemble';

export const DEMO_VARIANTS = ['full', 'one', 'reconnect', 'empty'] as const;
export type DemoVariant = (typeof DEMO_VARIANTS)[number];

export const FIXTURE_NOW = Date.parse('2026-09-27T12:00:00Z');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SYNTHETIC_CHARACTER_ID_BASE = 9_900_000_000;

const CALDARI_NAVY = 1000035;
const FEDERATION_NAVY = 1000120;
const BRUTOR_TRIBE = 1000049;
const EMPEROR_FAMILY = 1000086;
const BOUNDLESS_CREATION = 1000057;
const DEMO_ALLIANCE = 99_900_000_001;

const JITA = 30000142;
const TAMA = 30002813;
const RENS = 30002510;
const AMARR = 30002187;
const DODIXIE = 30002659;
const HEK = 30002053;

const JITA_4_4 = 60003760;
const AMARR_ORIS = 60008494;
const DODIXIE_9_20 = 60011866;
const RENS_6_8 = 60004588;
const HEK_8_12 = 60005686;
const DRIFTWOOD_ANCHORAGE = 1_099_000_000_001;

const TENGU = 29984;
const ISHTAR = 12005;
const RETRIEVER = 17478;
const ASTERO = 33468;
const CARACAL = 621;
const DRAKE = 24698;
const VENTURE = 32880;
const RIFTER = 587;
const TRITANIUM = 34;
const PYERITE = 35;
const PLEX = 44992;
const LARGE_SKILL_INJECTOR = 40520;
const RIFTER_BLUEPRINT = 787;
const TENGU_SKIN = 45843;
const CALDARI_CRUISER_SKILLBOOK = 3334;

const SHIP_CATEGORY = 6;
const MATERIAL_CATEGORY = 4;
const ACCESSORY_CATEGORY = 5;
const IMPLANT_CATEGORY = 20;

const NEW_SCOPES = (['wallet', 'clones', 'implants', 'structures'] as const).flatMap(
  (key) => SHEET_SECTION_SCOPES[key],
);

export function demoVariant(param: string | string[] | undefined): DemoVariant | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (value === undefined) return null;
  if (value === '') return 'full';
  return (DEMO_VARIANTS as readonly string[]).includes(value) ? (value as DemoVariant) : null;
}

const skill = (typeId: number, name: string, rank: number) => ({ typeId, name, rank });

const DEMO_CATALOG: SkillCatalogGroup[] = [
  {
    groupId: 257,
    name: 'Spaceship Command',
    skills: [
      skill(3327, 'Spaceship Command', 1),
      skill(3330, 'Caldari Frigate', 2),
      skill(33092, 'Caldari Destroyer', 2),
      skill(3334, 'Caldari Cruiser', 5),
      skill(33096, 'Caldari Battlecruiser', 6),
      skill(3332, 'Gallente Cruiser', 5),
      skill(16591, 'Heavy Assault Cruisers', 6),
      skill(17940, 'Mining Barge', 4),
      skill(12093, 'Covert Ops', 5),
    ],
  },
  {
    groupId: 255,
    name: 'Gunnery',
    skills: [
      skill(3300, 'Gunnery', 1),
      skill(3301, 'Small Hybrid Turret', 1),
      skill(3304, 'Medium Hybrid Turret', 3),
      skill(3302, 'Small Projectile Turret', 1),
    ],
  },
  {
    groupId: 256,
    name: 'Missiles',
    skills: [
      skill(3319, 'Missile Launcher Operation', 1),
      skill(3321, 'Light Missiles', 2),
      skill(3324, 'Heavy Missiles', 3),
    ],
  },
  {
    groupId: 273,
    name: 'Drones',
    skills: [
      skill(3436, 'Drones', 1),
      skill(3437, 'Drone Avionics', 1),
      skill(24241, 'Light Drone Operation', 1),
      skill(33699, 'Medium Drone Operation', 2),
    ],
  },
  {
    groupId: 1210,
    name: 'Armor',
    skills: [
      skill(3392, 'Mechanics', 1),
      skill(3394, 'Hull Upgrades', 2),
      skill(3393, 'Repair Systems', 1),
      skill(33078, 'Armor Layering', 3),
    ],
  },
  {
    groupId: 1209,
    name: 'Shields',
    skills: [
      skill(3416, 'Shield Operation', 1),
      skill(3419, 'Shield Management', 3),
      skill(3425, 'Shield Upgrades', 2),
      skill(3420, 'Tactical Shield Manipulation', 4),
    ],
  },
  {
    groupId: 275,
    name: 'Navigation',
    skills: [
      skill(3449, 'Navigation', 1),
      skill(3450, 'Afterburner', 1),
      skill(3453, 'Evasive Maneuvering', 2),
      skill(3455, 'Warp Drive Operation', 1),
      skill(3454, 'High Speed Maneuvering', 5),
      skill(3451, 'Fuel Conservation', 2),
    ],
  },
  {
    groupId: 1216,
    name: 'Engineering',
    skills: [
      skill(3426, 'CPU Management', 1),
      skill(3413, 'Power Grid Management', 1),
      skill(3418, 'Capacitor Management', 3),
      skill(3417, 'Capacitor Systems Operation', 1),
      skill(3432, 'Electronics Upgrades', 2),
      skill(3318, 'Weapon Upgrades', 2),
      skill(11207, 'Advanced Weapon Upgrades', 6),
    ],
  },
  {
    groupId: 268,
    name: 'Production',
    skills: [skill(3380, 'Industry', 1), skill(3387, 'Mass Production', 2), skill(3388, 'Advanced Industry', 3)],
  },
  {
    groupId: 1218,
    name: 'Resource Processing',
    skills: [skill(3386, 'Mining', 1), skill(3410, 'Astrogeology', 3), skill(3385, 'Reprocessing', 1)],
  },
];

function implantFacts(name: string, slot: number, key: AttributeKey, bonus: number): TypeFacts {
  return { name, implantSlot: slot, attributeBonus: { [key]: bonus } };
}

function implantSet(grade: string, bonus: number, ids: [number, number, number, number, number]): [number, TypeFacts][] {
  const [ocular, memory, neural, cyber, social] = ids;
  return [
    [ocular, implantFacts(`Ocular Filter - ${grade}`, 1, 'perception', bonus)],
    [memory, implantFacts(`Memory Augmentation - ${grade}`, 2, 'memory', bonus)],
    [neural, implantFacts(`Neural Boost - ${grade}`, 3, 'willpower', bonus)],
    [cyber, implantFacts(`Cybernetic Subprocessor - ${grade}`, 4, 'intelligence', bonus)],
    [social, implantFacts(`Social Adaptation Chip - ${grade}`, 5, 'charisma', bonus)],
  ];
}

const BASIC_IMPLANTS = [9899, 9941, 9942, 9943, 9956] as const;
const STANDARD_IMPLANTS = [10216, 10208, 10212, 10221, 10225] as const;
const IMPROVED_IMPLANTS = [10217, 10209, 10213, 10222, 10226] as const;

const ship = (name: string): TypeFacts => ({ name, implantSlot: null, attributeBonus: {} });

const DEMO_TYPES = new Map<number, TypeFacts>([
  [TENGU, ship('Tengu')],
  [ISHTAR, ship('Ishtar')],
  [RETRIEVER, ship('Retriever')],
  [ASTERO, ship('Astero')],
  ...implantSet('Basic', 3, [...BASIC_IMPLANTS]),
  ...implantSet('Standard', 4, [...STANDARD_IMPLANTS]),
  ...implantSet('Improved', 5, [...IMPROVED_IMPLANTS]),
]);

const system = (name: string, security: number) => ({
  name,
  security,
  secClass: systemSecurityClass(security, null),
});

const DEMO_SYSTEMS = new Map([
  [JITA, system('Jita', 0.945913)],
  [TAMA, system('Tama', 0.282556)],
  [RENS, system('Rens', 0.894582)],
  [AMARR, system('Amarr', 0.949)],
  [DODIXIE, system('Dodixie', 0.868407)],
  [HEK, system('Hek', 0.8)],
]);

const DEMO_PLACES = new Map([
  [JITA_4_4, { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', systemId: JITA }],
  [AMARR_ORIS, { name: 'Amarr VIII (Oris) - Emperor Family Academy', systemId: AMARR }],
  [DODIXIE_9_20, { name: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant', systemId: DODIXIE }],
  [RENS_6_8, { name: 'Rens VI - Moon 8 - Brutor Tribe Treasury', systemId: RENS }],
  [HEK_8_12, { name: 'Hek VIII - Moon 12 - Boundless Creation Factory', systemId: HEK }],
]);

const price = (jitaMid: number | null, average: number | null) => ({ jitaMid, average });

/** Rounded from the local Jita book and CCP averages on 2026-09-27; PLEX has no Jita book. */
const DEMO_PRICES: PriceBook = new Map([
  [TRITANIUM, price(4.0, 3.74)],
  [PYERITE, price(18.04, 17.63)],
  [PLEX, price(null, 4_692_289.39)],
  [LARGE_SKILL_INJECTOR, price(760_000_000, 739_868_976.53)],
  [TENGU, price(228_000_000, 224_575_808.66)],
  [ISHTAR, price(139_000_000, 138_145_641.51)],
  [RETRIEVER, price(43_700_000, 41_619_184.71)],
  [ASTERO, price(98_900_000, 92_749_353.76)],
  [CARACAL, price(12_000_000, 10_570_472.11)],
  [DRAKE, price(54_000_000, 50_977_474.16)],
  [VENTURE, price(278_000, 179_590.53)],
  [RIFTER, price(282_042.1, 291_389.14)],
  [RIFTER_BLUEPRINT, price(2_000_000, 2_900_000)],
  [TENGU_SKIN, price(500_000_000, 500_000_000)],
  [CALDARI_CRUISER_SKILLBOOK, price(1_000_000, 1_000_000)],
  ...BASIC_IMPLANTS.map((id) => [id, price(7_500_000, 8_194_316.5)] as const),
  ...STANDARD_IMPLANTS.map((id) => [id, price(19_000_000, 18_200_000)] as const),
  ...IMPROVED_IMPLANTS.map((id) => [id, price(90_000_000, 97_300_000)] as const),
]);

const DEMO_CATEGORIES: TypeCategories = new Map([
  [TRITANIUM, MATERIAL_CATEGORY],
  [PYERITE, MATERIAL_CATEGORY],
  [PLEX, ACCESSORY_CATEGORY],
  [LARGE_SKILL_INJECTOR, ACCESSORY_CATEGORY],
  ...[TENGU, ISHTAR, RETRIEVER, ASTERO, CARACAL, DRAKE, VENTURE, RIFTER].map((id) => [id, SHIP_CATEGORY] as const),
  [RIFTER_BLUEPRINT, 9],
  [TENGU_SKIN, 91],
  [CALDARI_CRUISER_SKILLBOOK, 16],
  ...[...BASIC_IMPLANTS, ...STANDARD_IMPLANTS, ...IMPROVED_IMPLANTS].map((id) => [id, IMPLANT_CATEGORY] as const),
]);

const DEMO_NAMES: NameBook = {
  types: DEMO_TYPES,
  systems: DEMO_SYSTEMS,
  npcStations: DEMO_PLACES,
  entities: {
    [CALDARI_NAVY]: 'Caldari Navy',
    [FEDERATION_NAVY]: 'Federation Navy',
    [BRUTOR_TRIBE]: 'Brutor Tribe',
    [EMPEROR_FAMILY]: 'Emperor Family',
    [BOUNDLESS_CREATION]: 'Boundless Creation',
    [DEMO_ALLIANCE]: 'Halcyon Drift',
  },
  skillCatalog: DEMO_CATALOG,
  prices: DEMO_PRICES,
  typeCategories: DEMO_CATEGORIES,
};

const hangar = (typeId: number, quantity: number, locationFlag = 'Hangar'): AssetLine => ({
  typeId,
  quantity,
  locationFlag,
});

const JOURNAL_CYCLE: ReadonlyArray<[refType: string, amount: number, description: string]> = [
  ['bounty_prizes', 18_450_000, 'Bounty prizes'],
  ['market_transaction', -142_000_000, 'Market buy: Caldari Navy Antimatter Charge M'],
  ['brokers_fee', -2_130_000, 'Broker fee'],
  ['market_transaction', 96_500_000, 'Market sale: Tengu Defensive - Amplification Node'],
  ['transaction_tax', -4_340_000, 'Sales tax'],
  ['industry_job_tax', -1_275_000, 'Industry facility tax'],
  ['player_trading', -35_000_000, 'Direct trade'],
  ['contract_price', 61_000_000, 'Contract: strategic cruiser subsystems'],
  ['insurance', 12_800_000, 'Insurance payout'],
  ['agent_mission_reward', 3_420_000, 'Mission reward'],
  ['jump_clone_activation_fee', -100_000, 'Jump clone activation'],
  ['planetary_export_tax', -960_000, 'Planetary export tax'],
  ['corporation_account_withdrawal', 25_000_000, 'Corporation payout'],
  ['daily_goal_payouts', 1_500_000, 'Daily goal'],
];

const JOURNAL_ROWS = 40;
const JOURNAL_STEP = 18 * HOUR;
const JOURNAL_START_JUST_PAST_30_DAYS = 30 * DAY + 6 * HOUR;

function demoJournalBody(now: number, scale: number, closing: number, idBase: number): unknown[] {
  const first = now - JOURNAL_START_JUST_PAST_30_DAYS;
  const amounts = Array.from({ length: JOURNAL_ROWS }, (_, i) => {
    const [, base] = JOURNAL_CYCLE[i % JOURNAL_CYCLE.length]!;
    return roundIsk(base * scale * (1 + ((i * 7) % 5) * 0.11));
  });
  const opening = closing - amounts.reduce((sum, amount) => sum + amount, 0);
  let balance = opening;
  return amounts.map((amount, i) => {
    const [refType, , description] = JOURNAL_CYCLE[i % JOURNAL_CYCLE.length]!;
    balance = roundIsk(balance + amount);
    return {
      id: idBase + i,
      date: new Date(first + i * JOURNAL_STEP).toISOString(),
      ref_type: refType,
      amount,
      balance,
      description,
    };
  });
}

function levelsOf(pairs: ReadonlyArray<[number, number]>): Record<string, number> {
  return Object.fromEntries(pairs.map(([typeId, level]) => [String(typeId), level]));
}

const AUREL_LEVELS = levelsOf([
  [3327, 5], [3330, 5], [33092, 4], [3334, 5], [33096, 3], [3332, 3], [16591, 4], [12093, 4],
  [3300, 5], [3301, 5], [3304, 4], [3319, 5], [3321, 5], [3324, 5],
  [3436, 5], [3437, 4], [24241, 5], [33699, 4],
  [3392, 5], [3394, 5], [3393, 3], [33078, 2], [3416, 5], [3419, 5], [3425, 5], [3420, 4],
  [3449, 5], [3450, 4], [3453, 4], [3455, 4], [3454, 4], [3451, 4],
  [3426, 5], [3413, 5], [3418, 5], [3417, 5], [3432, 5], [3318, 5], [11207, 4],
  [3380, 3], [3387, 4], [3386, 1],
]);

const KESSA_LEVELS = levelsOf([
  [3327, 5], [3332, 5], [16591, 3], [3300, 4], [3301, 4], [3304, 3],
  [3436, 5], [3437, 5], [24241, 5], [33699, 4],
  [3392, 4], [3394, 5], [3393, 3], [3416, 3], [3419, 3],
  [3449, 5], [3450, 3], [3453, 4], [3455, 3], [3454, 3],
  [3426, 5], [3413, 5], [3418, 4], [3417, 4], [3432, 4], [3318, 4],
]);

const TORVIN_LEVELS = levelsOf([
  [3327, 4], [3330, 3], [17940, 4], [3386, 5], [3410, 4], [3385, 3],
  [3380, 5], [3387, 4], [3388, 3], [3416, 4], [3419, 3], [3425, 3],
  [3449, 4], [3450, 3], [3455, 3], [3426, 4], [3413, 4], [3418, 3], [3417, 3], [3392, 3], [3394, 3],
]);

const ILYANA_LEVELS = levelsOf([
  [3327, 3], [3330, 3], [33092, 2], [3300, 2], [3301, 2], [3449, 3], [3450, 2],
  [3426, 3], [3413, 3], [3392, 2], [3394, 1], [3416, 3], [3436, 2], [12093, 1],
]);

function envelope<K extends SheetSectionKey>(data: SheetSectionData[K], refreshedAt: number): SectionEnvelope<K> {
  return { data, refreshedAt: new Date(refreshedAt).toISOString(), etags: {} };
}

function attributes(
  values: Record<AttributeKey, number>,
  remaps: { bonusRemaps: number; lastRemapDate: string | null; accruedRemapCooldownDate: string | null },
): AttributesPart {
  return { ...values, ...remaps };
}

interface DemoStatus {
  systemId: number;
  stationId: number | null;
  structureId: number | null;
  shipTypeId: number;
  shipName: string;
  online: boolean;
  lastLoginAt: number;
}

function statusData(status: DemoStatus, shipItemId: number): SheetSectionData['status'] {
  return {
    location: { solarSystemId: status.systemId, stationId: status.stationId, structureId: status.structureId },
    ship: { shipTypeId: status.shipTypeId, shipItemId, shipName: status.shipName },
    online: { online: status.online, lastLogin: new Date(status.lastLoginAt).toISOString(), lastLogout: null },
  };
}

function walletSections(now: number, journal: { scale: number; closing: number; idBase: number }): SheetSections {
  const digest = digestJournalBody(demoJournalBody(now, journal.scale, journal.closing, journal.idBase), new Date(now));
  if (digest === null) throw new Error('demo journal body must parse');
  return {
    wallet: envelope<'wallet'>({ balance: journal.closing }, now - 2 * 60_000),
    journal: envelope<'journal'>({ journal: digest }, now - 25 * 60_000),
  };
}

function queueEntry(
  skillId: number,
  position: number,
  level: number,
  sp: { start: number; end: number; trainingStart: number },
  window: { startAt: number; finishAt: number } | null,
): SkillQueueEntry {
  return {
    skill_id: skillId,
    queue_position: position,
    finished_level: level,
    level_start_sp: sp.start,
    level_end_sp: sp.end,
    training_start_sp: sp.trainingStart,
    ...(window === null
      ? {}
      : { start_date: new Date(window.startAt).toISOString(), finish_date: new Date(window.finishAt).toISOString() }),
  };
}

function manufacturingJob(jobId: number, status: IndustryJob['status'], startAt: number, endAt: number): IndustryJob {
  return {
    job_id: jobId,
    activity_id: 1,
    blueprint_type_id: 1002,
    product_type_id: 34,
    runs: 10,
    status,
    start_date: new Date(startAt).toISOString(),
    end_date: new Date(endAt).toISOString(),
  };
}

function aurel(now: number): BoardRaw {
  const characterId = SYNTHETIC_CHARACTER_ID_BASE + 1;
  const clones: ClonesPart = {
    home: { locationId: JITA_4_4, locationType: 'station' },
    jumpClones: [
      {
        jumpCloneId: 41_211_001,
        location: { locationId: AMARR_ORIS, locationType: 'station' },
        implantTypeIds: [...STANDARD_IMPLANTS.slice(0, 3)],
        name: 'Amarr trade clone',
      },
      {
        jumpCloneId: 41_211_002,
        location: { locationId: DRIFTWOOD_ANCHORAGE, locationType: 'structure' },
        implantTypeIds: [],
        name: null,
      },
    ],
    lastCloneJumpDate: new Date(now - 9 * DAY).toISOString(),
  };
  return {
    identity: {
      characterId,
      name: 'Aurel Vantesse',
      portraitUrl: characterPortraitUrl(characterId),
      corporationId: CALDARI_NAVY,
      allianceId: null,
    },
    health: { hasRefreshToken: true, missingScopes: [] },
    sheet: {
      profile: envelope<'profile'>(
        { character: { birthday: '2014-03-11T09:42:00Z', securityStatus: 2.31 } },
        now - 6 * HOUR,
      ),
      status: envelope<'status'>(
        statusData(
          {
            systemId: JITA,
            stationId: JITA_4_4,
            structureId: null,
            shipTypeId: TENGU,
            shipName: 'Quiet Ledger',
            online: true,
            lastLoginAt: now - 3 * HOUR,
          },
          1_030_000_000_101,
        ),
        now - 60_000,
      ),
      attributes: envelope<'attributes'>(
        {
          attributes: attributes(
            { intelligence: 27, memory: 21, perception: 17, willpower: 17, charisma: 17 },
            {
              bonusRemaps: 1,
              lastRemapDate: new Date(now - 200 * DAY).toISOString(),
              accruedRemapCooldownDate: new Date(now + 165 * DAY).toISOString(),
            },
          ),
        },
        now - 90_000,
      ),
      implants: envelope<'implants'>({ implants: [...IMPROVED_IMPLANTS] }, now - 90_000),
      clones: envelope<'clones'>({ clones }, now - 90_000),
      ...walletSections(now, { scale: 1, closing: 3_204_115_882.15, idBase: 1_900_000_000 }),
      structures: envelope<'structures'>(
        { names: { [DRIFTWOOD_ANCHORAGE]: { kind: 'named', name: 'Sobaseki - Driftwood Anchorage' } } },
        now - 40 * 60_000,
      ),
      orders: envelope<'orders'>(
        {
          orders: {
            open: [
              { typeId: CARACAL, volumeRemain: 2, isBuyOrder: false, escrow: 0 },
              { typeId: LARGE_SKILL_INJECTOR, volumeRemain: 1, isBuyOrder: false, escrow: 0 },
              { typeId: TRITANIUM, volumeRemain: 2_000_000, isBuyOrder: true, escrow: 7_900_000 },
            ],
          },
        },
        now - 35 * 60_000,
      ),
    },
    assets: {
      rows: [
        hangar(TRITANIUM, 4_000_000),
        hangar(PYERITE, 1_500_000),
        hangar(PLEX, 60),
        hangar(TENGU, 1),
        hangar(CARACAL, 3),
        hangar(DRAKE, 1),
        hangar(LARGE_SKILL_INJECTOR, 2),
        hangar(RIFTER_BLUEPRINT, 1),
        hangar(TENGU_SKIN, 1),
        hangar(CALDARI_CRUISER_SKILLBOOK, 1, 'Skill'),
      ],
      refreshedAt: now - 50 * 60_000,
    },
    skills: {
      data: {
        totalSp: 41_512_880,
        unallocatedSp: 405_000,
        entries: [
          queueEntry(3334, 0, 5, { start: 226_275, end: 1_280_000, trainingStart: 902_400 }, {
            startAt: now - 2 * DAY,
            finishAt: now + 20 * HOUR,
          }),
          queueEntry(33096, 1, 4, { start: 48_000, end: 271_530, trainingStart: 48_000 }, {
            startAt: now + 20 * HOUR,
            finishAt: now + 3 * DAY,
          }),
        ],
      },
      levels: AUREL_LEVELS,
      refreshedAt: now - 4 * 60_000,
    },
    jobs: {
      data: {
        jobs: [
          manufacturingJob(510_001, 'active', now - 19 * HOUR, now + 5 * HOUR),
          manufacturingJob(510_002, 'active', now - 6 * HOUR, now + 30 * HOUR),
          manufacturingJob(510_003, 'ready', now - 3 * DAY, now - 2 * HOUR),
        ],
      },
      refreshedAt: now - 6 * 60_000,
    },
  };
}

function kessa(now: number): BoardRaw {
  const characterId = SYNTHETIC_CHARACTER_ID_BASE + 2;
  return {
    identity: {
      characterId,
      name: 'Kessa Draymoor',
      portraitUrl: characterPortraitUrl(characterId),
      corporationId: FEDERATION_NAVY,
      allianceId: DEMO_ALLIANCE,
    },
    health: { hasRefreshToken: true, missingScopes: [] },
    sheet: {
      profile: envelope<'profile'>(
        { character: { birthday: '2019-08-02T18:05:00Z', securityStatus: -1.8 } },
        now - 11 * HOUR,
      ),
      status: envelope<'status'>(
        statusData(
          {
            systemId: TAMA,
            stationId: null,
            structureId: null,
            shipTypeId: ISHTAR,
            shipName: 'Sable Kite',
            online: false,
            lastLoginAt: now - 14 * HOUR,
          },
          1_030_000_000_202,
        ),
        now - 60_000,
      ),
      attributes: envelope<'attributes'>(
        {
          attributes: attributes(
            { intelligence: 17, memory: 17, perception: 27, willpower: 21, charisma: 17 },
            { bonusRemaps: 2, lastRemapDate: null, accruedRemapCooldownDate: null },
          ),
        },
        now - 90_000,
      ),
      implants: envelope<'implants'>({ implants: [...BASIC_IMPLANTS] }, now - 90_000),
      clones: envelope<'clones'>(
        {
          clones: {
            home: { locationId: DODIXIE_9_20, locationType: 'station' },
            jumpClones: [],
            lastCloneJumpDate: null,
          },
        },
        now - 90_000,
      ),
      ...walletSections(now, { scale: 0.25, closing: 812_450_000.5, idBase: 1_910_000_000 }),
      structures: envelope<'structures'>({ names: {} }, now - 40 * 60_000),
      orders: envelope<'orders'>({ orders: { open: [] } }, now - 35 * 60_000),
    },
    assets: {
      rows: [hangar(ISHTAR, 1), hangar(VENTURE, 2), hangar(TRITANIUM, 250_000)],
      refreshedAt: now - 50 * 60_000,
    },
    skills: {
      data: {
        totalSp: 18_240_100,
        entries: [
          queueEntry(33699, 0, 5, { start: 90_510, end: 512_000, trainingStart: 260_000 }, {
            startAt: now - 30 * HOUR,
            finishAt: now + 9 * HOUR,
          }),
        ],
      },
      levels: KESSA_LEVELS,
      refreshedAt: now - 3 * 60_000,
    },
    jobs: { data: { jobs: [] }, refreshedAt: now - 6 * 60_000 },
  };
}

function torvin(now: number): BoardRaw {
  const characterId = SYNTHETIC_CHARACTER_ID_BASE + 3;
  return {
    identity: {
      characterId,
      name: 'Torvin Hale',
      portraitUrl: characterPortraitUrl(characterId),
      corporationId: BRUTOR_TRIBE,
      allianceId: null,
    },
    health: { hasRefreshToken: true, missingScopes: [] },
    sheet: {
      profile: envelope<'profile'>(
        { character: { birthday: '2011-11-22T12:30:00Z', securityStatus: 0.42 } },
        now - 20 * HOUR,
      ),
      status: envelope<'status'>(
        statusData(
          {
            systemId: RENS,
            stationId: RENS_6_8,
            structureId: null,
            shipTypeId: RETRIEVER,
            shipName: 'Gravel Sparrow',
            online: false,
            lastLoginAt: now - 3 * DAY,
          },
          1_030_000_000_303,
        ),
        now - 60_000,
      ),
      attributes: envelope<'attributes'>(
        {
          attributes: attributes(
            { intelligence: 21, memory: 27, perception: 17, willpower: 17, charisma: 17 },
            {
              bonusRemaps: 0,
              lastRemapDate: new Date(now - 40 * DAY).toISOString(),
              accruedRemapCooldownDate: new Date(now + 325 * DAY).toISOString(),
            },
          ),
        },
        now - 90_000,
      ),
      implants: envelope<'implants'>({ implants: [] }, now - 90_000),
      clones: envelope<'clones'>(
        {
          clones: {
            home: { locationId: RENS_6_8, locationType: 'station' },
            jumpClones: [
              {
                jumpCloneId: 41_213_001,
                location: { locationId: HEK_8_12, locationType: 'station' },
                implantTypeIds: [BASIC_IMPLANTS[1], BASIC_IMPLANTS[3]],
                name: 'Hek hauler',
              },
            ],
            lastCloneJumpDate: new Date(now - 40 * DAY).toISOString(),
          },
        },
        now - 90_000,
      ),
      ...walletSections(now, { scale: 0.03, closing: 96_210_330.02, idBase: 1_920_000_000 }),
      structures: envelope<'structures'>({ names: {} }, now - 40 * 60_000),
      orders: envelope<'orders'>(
        { orders: { open: [{ typeId: TRITANIUM, volumeRemain: 500_000, isBuyOrder: false, escrow: 0 }] } },
        now - 35 * 60_000,
      ),
    },
    assets: {
      rows: [hangar(RETRIEVER, 1), hangar(VENTURE, 1), hangar(RIFTER, 1), hangar(TRITANIUM, 2_000_000), hangar(PYERITE, 800_000)],
      refreshedAt: now - 50 * 60_000,
    },
    skills: {
      data: {
        totalSp: 9_875_400,
        entries: [queueEntry(3419, 0, 4, { start: 24_000, end: 135_765, trainingStart: 61_000 }, null)],
      },
      levels: TORVIN_LEVELS,
      refreshedAt: now - 5 * 60_000,
    },
    jobs: {
      data: {
        jobs: [
          manufacturingJob(520_001, 'active', now - 12 * HOUR, now + 12 * HOUR),
          manufacturingJob(520_002, 'active', now - DAY, now + 2 * DAY),
          manufacturingJob(520_003, 'ready', now - 2 * DAY, now - 5 * HOUR),
          manufacturingJob(520_004, 'delivered', now - 6 * DAY, now - 4 * DAY),
        ],
      },
      refreshedAt: now - 6 * 60_000,
    },
  };
}

function ilyana(now: number): BoardRaw {
  const characterId = SYNTHETIC_CHARACTER_ID_BASE + 4;
  return {
    identity: {
      characterId,
      name: 'Ilyana Mirek',
      portraitUrl: characterPortraitUrl(characterId),
      corporationId: EMPEROR_FAMILY,
      allianceId: null,
    },
    health: { hasRefreshToken: true, missingScopes: [...NEW_SCOPES] },
    sheet: {
      profile: envelope<'profile'>(
        { character: { birthday: '2022-01-15T07:12:00Z', securityStatus: 0 } },
        now - 2 * HOUR,
      ),
      status: envelope<'status'>(
        statusData(
          {
            systemId: AMARR,
            stationId: AMARR_ORIS,
            structureId: null,
            shipTypeId: ASTERO,
            shipName: 'Vesper',
            online: true,
            lastLoginAt: now - 20 * 60_000,
          },
          1_030_000_000_404,
        ),
        now - 60_000,
      ),
      attributes: envelope<'attributes'>(
        {
          attributes: attributes(
            { intelligence: 24, memory: 24, perception: 17, willpower: 17, charisma: 17 },
            { bonusRemaps: 2, lastRemapDate: null, accruedRemapCooldownDate: null },
          ),
        },
        now - 90_000,
      ),
    },
    assets: { rows: [hangar(ASTERO, 1), hangar(RIFTER, 1)], refreshedAt: now - 50 * 60_000 },
    skills: {
      data: { totalSp: 4_120_500, entries: [] },
      levels: ILYANA_LEVELS,
      refreshedAt: now - 2 * 60_000,
    },
    jobs: { data: { jobs: [] }, refreshedAt: now - 6 * 60_000 },
  };
}

function bram(): BoardRaw {
  const characterId = SYNTHETIC_CHARACTER_ID_BASE + 5;
  return {
    identity: {
      characterId,
      name: 'Bram Oskarsen',
      portraitUrl: characterPortraitUrl(characterId),
      corporationId: BOUNDLESS_CREATION,
      allianceId: null,
    },
    health: { hasRefreshToken: false, missingScopes: [] },
    sheet: null,
    skills: { data: null, levels: null, refreshedAt: null },
    jobs: { data: null, refreshedAt: null },
    assets: { rows: null, refreshedAt: null },
  };
}

function demoRaws(now: number, variant: DemoVariant): BoardRaw[] {
  switch (variant) {
    case 'full':
      return [aurel(now), kessa(now), torvin(now), ilyana(now), bram()];
    case 'one':
      return [aurel(now)];
    case 'reconnect':
      return [ilyana(now), bram()];
    case 'empty':
      return [];
  }
}

const HISTORY_DAYS = 90;
const SKIPPED_DAY_PERIODS = [7, 11] as const;
const SKIPPED_DAY_OFFSETS = [3, 5] as const;

function utcDayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A day the demo account did not open the board; the chart must cope with the gap. */
function isSkippedDay(daysAgo: number): boolean {
  return SKIPPED_DAY_PERIODS.some((period, i) => daysAgo % period === SKIPPED_DAY_OFFSETS[i]);
}

/** Walks each pilot back from today's real figure with a slow drift and a deterministic wobble. */
function pastWorth(today: number, daysAgo: number, seed: number): number {
  const drift = 1 - daysAgo * 0.0035;
  const wobble = 1 + 0.02 * Math.sin(daysAgo / 3 + seed) + 0.01 * Math.cos(daysAgo / 7 + seed * 2);
  return roundIsk(today * drift * wobble);
}

function demoHistory(now: number, raws: readonly BoardRaw[]): BoardHistoryDay[] {
  const today = netWorthSnapshot(raws, DEMO_NAMES, utcDayOf(now));
  if (today.pilotsIncluded === 0) return [];
  const days: BoardHistoryDay[] = [];
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo -= 1) {
    if (isSkippedDay(daysAgo)) continue;
    const pilots: BoardHistoryDay['pilots'] = {};
    let netWorth = 0;
    let liquidIsk = 0;
    Object.entries(today.pilots).forEach(([id, worth], i) => {
      const past = { netWorth: pastWorth(worth.netWorth, daysAgo, i), liquidIsk: pastWorth(worth.liquidIsk, daysAgo, i + 1) };
      pilots[id] = past;
      netWorth += past.netWorth;
      liquidIsk += past.liquidIsk;
    });
    days.push({
      day: utcDayOf(now - daysAgo * DAY),
      netWorth: roundIsk(netWorth),
      liquidIsk: roundIsk(liquidIsk),
      included: today.pilotsIncluded,
      total: today.pilotsTotal,
      pilots,
    });
  }
  days.push(toHistoryDay(today));
  return days;
}

export function buildDemoBoard(now: number, variant: DemoVariant): BoardResponse {
  const raws = demoRaws(now, variant);
  return assembleBoard(raws, DEMO_NAMES, now, demoHistory(now, raws));
}
