import type { Npc, SiteDetail, SiteResource, Wave } from './types';

/**
 * Mock SiteDetail fixtures used by /preview/cards. Shapes match the
 * real `SiteDetail` interface so swapping these for `getSiteDetail()`
 * in Session 7 is a one-line change.
 *
 * Values mirror the visual prototype in
 * `LGI Tool References/card_reference.html`.
 */

let nextId = 1;
const id = () => nextId++;

interface NpcArgs {
  quantity: number;
  name: string;
  cls?: string;
  ehp?: number;
  dps?: number;
  web?: boolean;
  scram?: boolean;
  neut?: boolean;
  rr?: boolean;
  trigger?: boolean;
}

function npc(
  order: number,
  {
    quantity,
    name,
    cls = 'F',
    ehp,
    dps,
    web,
    scram,
    neut,
    rr,
    trigger,
  }: NpcArgs,
): Npc {
  return {
    id: id(),
    orderInWave: order,
    triggerLabel: trigger ? 'Trigger' : null,
    quantity,
    sleeperName: name,
    sleeperClassCode: cls,
    scram: scram ? 1 : null,
    web: web ? 1 : null,
    neut: neut ? 1 : null,
    rrep: rr ? 1 : null,
    sig: null,
    speed: null,
    distance: null,
    velocity: null,
    dps: dps ?? null,
    alpha: null,
    ehp: ehp ?? null,
  };
}

function wave(
  waveNumber: number,
  label: string,
  dpsTotal: number,
  npcs: Npc[],
): Wave {
  const ew = npcs.reduce(
    (acc, n) => ({
      web:   acc.web   + (n.web   ?? 0),
      scram: acc.scram + (n.scram ?? 0),
      neut:  acc.neut  + (n.neut  ?? 0),
      rr:    acc.rr    + (n.rrep  ?? 0),
    }),
    { web: 0, scram: 0, neut: 0, rr: 0 },
  );
  return {
    id: id(),
    waveNumber,
    waveLabel: label,
    ewWeb:   ew.web   || null,
    ewScram: ew.scram || null,
    ewNeut:  ew.neut  || null,
    ewRrep:  ew.rr    || null,
    dpsTotal,
    alphaTotal: null,
    ehpTotal: null,
    npcs,
  };
}

function resource(
  order: number,
  kind: SiteResource['resourceKind'],
  name: string,
  totalIsk: number,
  extras: Partial<Pick<SiteResource, 'units' | 'volumeM3' | 'iskPerM3'>> = {},
): SiteResource {
  return {
    id: id(),
    orderInSite: order,
    resourceKind: kind,
    resourceName: name,
    units: extras.units ?? null,
    volumeM3: extras.volumeM3 ?? null,
    iskPerM3: extras.iskPerM3 ?? null,
    totalIsk,
  };
}

// ── Combat ────────────────────────────────────────────────────────────────
const combatC1: SiteDetail = {
  id: id(),
  name: 'Perimeter Ambush Point',
  siteType: 'combat',
  wormholeClass: 'C1',
  signatureLabel: 'Anomaly',
  sourceTab: 'Class 1',
  blueLootIsk: 8_600_000,
  iskPerEhp: null,
  resourceValueIsk: null,
  waves: [
    wave(1, 'Wave 1', 24, [
      npc(1, { quantity: 2, name: 'Vigilant Sentry Tower', ehp: 11_000, dps: 8 }),
      npc(2, { quantity: 1, name: 'Emergent Escort', ehp: 1_000, dps: 4, web: true }),
      npc(3, { quantity: 1, name: 'Awakened Escort', ehp: 12_000, dps: 12, trigger: true }),
    ]),
    wave(2, 'Wave 2', 50, [
      npc(1, { quantity: 3, name: 'Emergent Patroller', ehp: 3_000, dps: 6, scram: true }),
      npc(2, { quantity: 2, name: 'Awakened Escort', ehp: 12_000, dps: 16, trigger: true }),
    ]),
    wave(3, 'Wave 3', 60, [
      npc(1, { quantity: 2, name: 'Awakened Escort', ehp: 12_000, dps: 16, rr: true, trigger: true }),
      npc(2, { quantity: 2, name: 'Awakened Patroller', ehp: 19_000, dps: 14, web: true, neut: true }),
    ]),
  ],
  resources: [],
};

const combatC3: SiteDetail = {
  id: id(),
  name: 'Frontier Barracks',
  siteType: 'combat',
  wormholeClass: 'C3',
  signatureLabel: 'Anomaly',
  sourceTab: 'Class 3',
  blueLootIsk: 42_800_000,
  iskPerEhp: null,
  resourceValueIsk: null,
  waves: [
    wave(1, 'Wave 1', 110, [
      npc(1, { quantity: 3, name: 'Emergent Watchman', ehp: 2_000, dps: 8, web: true, scram: true }),
      npc(2, { quantity: 2, name: 'Awakened Defender', cls: 'C', ehp: 14_000, dps: 27, neut: true, trigger: true }),
    ]),
    wave(2, 'Wave 2', 280, [
      npc(1, { quantity: 2, name: 'Awakened Escort', ehp: 12_000, dps: 28, web: true }),
      npc(2, { quantity: 1, name: 'Sleepless Sentinel', cls: 'B', ehp: 46_000, dps: 80, rr: true, neut: true }),
    ]),
  ],
  resources: [],
};

const combatC5: SiteDetail = {
  id: id(),
  name: 'Oruze Construct',
  siteType: 'combat',
  wormholeClass: 'C5',
  signatureLabel: 'Anomaly',
  sourceTab: 'Class 5',
  blueLootIsk: 320_000_000,
  iskPerEhp: null,
  resourceValueIsk: null,
  waves: [
    wave(1, 'Wave 1', 620, [
      npc(1, { quantity: 4, name: 'Emergent Watchman', ehp: 2_000, dps: 10, web: true }),
      npc(2, { quantity: 3, name: 'Awakened Escort', ehp: 12_000, dps: 40, neut: true }),
      npc(3, { quantity: 2, name: 'Sleepless Sentinel', cls: 'B', ehp: 46_000, dps: 140, rr: true, trigger: true }),
    ]),
    wave(2, 'Wave 2', 1100, [
      npc(1, { quantity: 3, name: 'Awakened Defender', cls: 'C', ehp: 14_000, dps: 60, neut: true }),
      npc(2, { quantity: 2, name: 'Sleepless Guardian', cls: 'B', ehp: 80_000, dps: 290, rr: true, web: true, trigger: true }),
    ]),
  ],
  resources: [],
};

// ── Ore ───────────────────────────────────────────────────────────────────
const oreC2: SiteDetail = {
  id: id(),
  name: 'Ordinary Perimeter Deposit',
  siteType: 'ore',
  wormholeClass: 'C2',
  signatureLabel: 'Ore Signature',
  sourceTab: 'Ore Signatures',
  blueLootIsk: null,
  iskPerEhp: null,
  resourceValueIsk: 184_200_000,
  waves: [],
  resources: [
    resource(1, 'ore', 'Kernite', 88_400_000, { units: 6, volumeM3: 360_000 }),
    resource(2, 'ore', 'Omber', 95_800_000, { units: 8, volumeM3: 480_000 }),
  ],
};

const oreC3: SiteDetail = {
  id: id(),
  name: 'Unusual Core Deposit',
  siteType: 'ore',
  wormholeClass: 'C3',
  signatureLabel: 'Ore Signature',
  sourceTab: 'Ore Signatures',
  blueLootIsk: 18_200_000,
  iskPerEhp: null,
  resourceValueIsk: 312_400_000,
  waves: [
    wave(1, 'Initial', 90, [
      npc(1, { quantity: 3, name: 'Emergent Watchman', ehp: 2_000, dps: 6, web: true }),
      npc(2, { quantity: 1, name: 'Sleepless Sentinel', cls: 'B', ehp: 46_000, dps: 72, neut: true }),
    ]),
  ],
  resources: [
    resource(1, 'ore', 'Arkonor',  124_800_000, { units: 3, volumeM3: 180_000 }),
    resource(2, 'ore', 'Bistot',    98_600_000, { units: 4, volumeM3: 240_000 }),
    resource(3, 'ore', 'Crokite',   89_000_000, { units: 5, volumeM3: 300_000 }),
  ],
};

// ── Gas ───────────────────────────────────────────────────────────────────
const gasC2: SiteDetail = {
  id: id(),
  name: 'Ordinary Perimeter Reservoir',
  siteType: 'gas',
  wormholeClass: 'C2',
  signatureLabel: 'Gas Signature',
  sourceTab: 'Gas Signatures',
  blueLootIsk: 12_400_000,
  iskPerEhp: null,
  resourceValueIsk: 180_000_000,
  waves: [
    wave(1, 'Delayed', 80, [
      npc(1, { quantity: 4, name: 'Emergent Watchman', ehp: 2_000, dps: 8, web: true, scram: true }),
      npc(2, { quantity: 2, name: 'Awakened Escort', ehp: 12_000, dps: 24 }),
    ]),
  ],
  resources: [
    resource(1, 'gas', 'Fullerite-C50', 110_000_000, { volumeM3: 5_000 }),
    resource(2, 'gas', 'Fullerite-C60',  70_000_000, { volumeM3: 2_500 }),
  ],
};

const gasC4: SiteDetail = {
  id: id(),
  name: 'Vital Core Reservoir',
  siteType: 'gas',
  wormholeClass: 'C4',
  signatureLabel: 'Gas Signature',
  sourceTab: 'Gas Signatures',
  blueLootIsk: 62_400_000,
  iskPerEhp: null,
  resourceValueIsk: 428_000_000,
  waves: [
    wave(1, 'Delayed', 280, [
      npc(1, { quantity: 3, name: 'Awakened Defender', cls: 'C', ehp: 14_000, dps: 30, web: true }),
      npc(2, { quantity: 2, name: 'Sleepless Sentinel', cls: 'B', ehp: 46_000, dps: 80, rr: true, neut: true }),
    ]),
  ],
  resources: [
    resource(1, 'gas', 'Fullerite-C320', 284_000_000, { volumeM3: 10_000 }),
    resource(2, 'gas', 'Fullerite-C28',  144_000_000, { volumeM3: 5_000 }),
  ],
};

// ── Relic ─────────────────────────────────────────────────────────────────
const relicC1: SiteDetail = {
  id: id(),
  name: 'Crumbling Frontier Ruins',
  siteType: 'relic',
  wormholeClass: 'C1',
  signatureLabel: 'Relic Signature',
  sourceTab: 'Relic Signatures',
  blueLootIsk: null,
  iskPerEhp: null,
  resourceValueIsk: 38_400_000,
  waves: [],
  resources: [
    resource(1, 'relic', 'Ruins',            12_400_000),
    resource(2, 'relic', 'Crumbling Ruins',  10_800_000),
    resource(3, 'relic', 'Debris',           15_200_000),
  ],
};

const relicC3: SiteDetail = {
  id: id(),
  name: 'Forgotten Perimeter Coronation Platform',
  siteType: 'relic',
  wormholeClass: 'C3',
  signatureLabel: 'Relic Signature',
  sourceTab: 'Relic Signatures',
  blueLootIsk: 24_600_000,
  iskPerEhp: null,
  resourceValueIsk: 88_200_000,
  waves: [
    wave(1, 'Initial', 72, [
      npc(1, { quantity: 2, name: 'Emergent Watchman', ehp: 2_000, dps: 8, web: true }),
      npc(2, { quantity: 2, name: 'Awakened Escort', ehp: 12_000, dps: 28, neut: true, trigger: true }),
    ]),
  ],
  resources: [
    resource(1, 'relic', 'Ruins',           22_400_000),
    resource(2, 'relic', 'Crumbling Ruins', 18_800_000),
    resource(3, 'relic', 'Rubble',          28_600_000),
    resource(4, 'relic', 'Debris',          18_400_000),
  ],
};

// ── Data ──────────────────────────────────────────────────────────────────
const dataC1: SiteDetail = {
  id: id(),
  name: 'Unsecured Frontier Receiver',
  siteType: 'data',
  wormholeClass: 'C1',
  signatureLabel: 'Data Signature',
  sourceTab: 'Data Signatures',
  blueLootIsk: null,
  iskPerEhp: null,
  resourceValueIsk: 54_800_000,
  waves: [],
  resources: [
    resource(1, 'data', 'Databank',         12_400_000),
    resource(2, 'data', 'Databank',          9_800_000),
    resource(3, 'data', 'Central Databank', 18_200_000),
    resource(4, 'data', 'Backup Databank',  14_400_000),
  ],
};

const dataC4: SiteDetail = {
  id: id(),
  name: 'Unsecured Perimeter Transponder Farm',
  siteType: 'data',
  wormholeClass: 'C4',
  signatureLabel: 'Data Signature',
  sourceTab: 'Data Signatures',
  blueLootIsk: 38_200_000,
  iskPerEhp: null,
  resourceValueIsk: 96_000_000,
  waves: [
    wave(1, 'Initial', 180, [
      npc(1, { quantity: 3, name: 'Emergent Watchman', ehp: 2_000, dps: 8, web: true, scram: true }),
      npc(2, { quantity: 2, name: 'Awakened Escort', ehp: 12_000, dps: 42, neut: true, trigger: true }),
    ]),
  ],
  resources: [
    resource(1, 'data', 'Databank',         28_400_000),
    resource(2, 'data', 'Central Databank', 34_200_000),
    resource(3, 'data', 'Backup Databank',  33_400_000),
  ],
};

export const MOCK_SITES: SiteDetail[] = [
  combatC1,
  combatC3,
  combatC5,
  oreC2,
  oreC3,
  gasC2,
  gasC4,
  relicC1,
  relicC3,
  dataC1,
  dataC4,
];
