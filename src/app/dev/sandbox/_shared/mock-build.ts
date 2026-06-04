// Sample data for the UX exploration sandbox. NOT real — hand-authored so every
// tree / price / card variant is fed the identical input and can be compared
// like-for-like. Shapes match the live view-model types (`BlueprintStructure`,
// `BuildNode`, `BuildNodeDisplay`) so a copied/adapted renderer type-checks; the
// labels + tones mirror what `classifyBuildNode` would produce (teal root, blue
// manufactured, purple reaction, neutral mineral, magenta moon material) without
// importing the DB-coupled resolver.

import type {
  BlueprintStructure,
  BuildNode,
  BuildNodeDisplay,
} from '@/features/industry-planner/types';

// --- Type ids ------------------------------------------------------------
// Minerals + the product use real EVE type ids (so TypeIcon shows the real art);
// the manufactured components + reaction outputs use names with synthetic ids in
// a private range — TypeIcon 404s those and falls back to a clean monogram.
const WOLF = 11371;
const TRITANIUM = 34;
const PYERITE = 35;
const MEXALLON = 36;
const ISOGEN = 37;
const NOCXIUM = 38;

const SENSOR_CLUSTER = 9_000_001;
const ARMOR_PLATE = 9_000_002;
const REACTOR_UNIT = 9_000_003;
const CRYSTALLINE_CARBIDE = 9_000_010; // reaction output
const FERNITE_CARBIDE = 9_000_011; // reaction output
const CAESIUM = 9_000_020; // moon material
const CADMIUM = 9_000_021; // moon material
const PLATINUM = 9_000_022; // moon material

// --- The nested build tree (single root: the Wolf) -----------------------
// Depth 3 overall: Wolf → components → reaction outputs → moon materials, with
// direct minerals at several levels so the views have both breadth and depth.
const BUILD_TREE: BuildNode[] = [
  {
    typeId: WOLF,
    quantity: 1,
    inputs: [
      {
        typeId: SENSOR_CLUSTER,
        quantity: 6,
        inputs: [
          {
            typeId: CRYSTALLINE_CARBIDE,
            quantity: 40,
            inputs: [
              { typeId: CAESIUM, quantity: 100, inputs: [] },
              { typeId: PLATINUM, quantity: 60, inputs: [] },
            ],
          },
          { typeId: TRITANIUM, quantity: 1200, inputs: [] },
        ],
      },
      {
        typeId: ARMOR_PLATE,
        quantity: 8,
        inputs: [
          {
            typeId: FERNITE_CARBIDE,
            quantity: 20,
            inputs: [
              { typeId: CADMIUM, quantity: 80, inputs: [] },
              { typeId: CAESIUM, quantity: 40, inputs: [] },
            ],
          },
          { typeId: PYERITE, quantity: 2400, inputs: [] },
        ],
      },
      {
        typeId: REACTOR_UNIT,
        quantity: 3,
        inputs: [
          { typeId: TRITANIUM, quantity: 600, inputs: [] },
          { typeId: MEXALLON, quantity: 180, inputs: [] },
        ],
      },
      { typeId: TRITANIUM, quantity: 22_000, inputs: [] },
      { typeId: PYERITE, quantity: 8_000, inputs: [] },
      { typeId: MEXALLON, quantity: 2_500, inputs: [] },
      { typeId: ISOGEN, quantity: 500, inputs: [] },
      { typeId: NOCXIUM, quantity: 120, inputs: [] },
    ],
  },
];

// --- Per-type display (label + tone + height + isRaw), keyed by typeId ----
function d(
  name: string,
  height: number,
  isRaw: boolean,
  label: string,
  tone: BuildNodeDisplay['tone'],
): BuildNodeDisplay {
  return { name, height, isRaw, label, tone };
}

const BUILD_NODE_DISPLAY: Record<number, BuildNodeDisplay> = {
  [WOLF]: d('Wolf', 3, false, 'Assault Frigate', 'teal'),
  [SENSOR_CLUSTER]: d('Magnetometric Sensor Cluster', 2, false, 'Construction Components', 'blue'),
  [ARMOR_PLATE]: d('Fernite Carbide Armor Plate', 2, false, 'Construction Components', 'blue'),
  [REACTOR_UNIT]: d('Reactor Control Unit', 1, false, 'Construction Components', 'blue'),
  [CRYSTALLINE_CARBIDE]: d('Crystalline Carbonide', 1, false, 'Reaction', 'purple'),
  [FERNITE_CARBIDE]: d('Fernite Carbide', 1, false, 'Reaction', 'purple'),
  [CAESIUM]: d('Caesium', 0, true, 'Moon Materials', 'magenta'),
  [CADMIUM]: d('Cadmium', 0, true, 'Moon Materials', 'magenta'),
  [PLATINUM]: d('Platinum', 0, true, 'Moon Materials', 'magenta'),
  [TRITANIUM]: d('Tritanium', 0, true, 'Mineral', 'neutral'),
  [PYERITE]: d('Pyerite', 0, true, 'Mineral', 'neutral'),
  [MEXALLON]: d('Mexallon', 0, true, 'Mineral', 'neutral'),
  [ISOGEN]: d('Isogen', 0, true, 'Mineral', 'neutral'),
  [NOCXIUM]: d('Nocxium', 0, true, 'Mineral', 'neutral'),
};

const MATERIAL_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(BUILD_NODE_DISPLAY).map(([id, v]) => [Number(id), v.name]),
);

// Recursed raw totals (the cost basis the live resolver would produce).
const FLAT_MATERIALS: { typeId: number; quantity: number }[] = [
  { typeId: TRITANIUM, quantity: 29_200 },
  { typeId: PYERITE, quantity: 27_200 },
  { typeId: MEXALLON, quantity: 3_040 },
  { typeId: ISOGEN, quantity: 500 },
  { typeId: NOCXIUM, quantity: 120 },
  { typeId: CAESIUM, quantity: 920 },
  { typeId: CADMIUM, quantity: 640 },
  { typeId: PLATINUM, quantity: 360 },
];

const MATERIAL_CATEGORY: Record<number, string> = {
  [TRITANIUM]: 'Minerals',
  [PYERITE]: 'Minerals',
  [MEXALLON]: 'Minerals',
  [ISOGEN]: 'Minerals',
  [NOCXIUM]: 'Minerals',
  [CAESIUM]: 'Moon Materials',
  [CADMIUM]: 'Moon Materials',
  [PLATINUM]: 'Moon Materials',
};

export const MOCK_STRUCTURE: BlueprintStructure = {
  blueprintTypeId: 11370,
  activityId: 1,
  product: { typeId: WOLF, name: 'Wolf', quantityPerRun: 1 },
  tree: [],
  buildTree: BUILD_TREE,
  buildNodeDisplay: BUILD_NODE_DISPLAY,
  rootHeight: 3,
  flatMaterials: FLAT_MATERIALS,
  materialCategory: MATERIAL_CATEGORY,
  materialCategories: [
    { label: 'Minerals', tone: 'neutral' },
    { label: 'Moon Materials', tone: 'magenta' },
  ],
  materialNames: MATERIAL_NAMES,
};

// --- Price-animation sample figures --------------------------------------
// A believable last-known → confirmed-live move for the hero ISK figure each
// price variant animates. A few alternates let some variants show an up vs down
// tick.
export const MOCK_PRICE = {
  name: 'Wolf — build cost',
  lastKnown: 41_230_000,
  confirmed: 41_875_500,
};

// --- Card sample data ----------------------------------------------------
export interface CardSample {
  id: string;
  title: string;
  typeId: number;
  tone: BuildNodeDisplay['tone'];
  typeLabel: string;
  isk: number;
  sub: string;
  tags: { label: string; tone: BuildNodeDisplay['tone'] }[];
}

export const MOCK_CARDS: CardSample[] = [
  {
    id: 'wolf',
    title: 'Wolf',
    typeId: WOLF,
    tone: 'teal',
    typeLabel: 'Assault Frigate',
    isk: 41_875_500,
    sub: 'Manufacturing · 8 raw inputs',
    tags: [
      { label: 'Build', tone: 'blue' },
      { label: '+12.4% margin', tone: 'green' },
    ],
  },
  {
    id: 'jackdaw',
    title: 'Jackdaw',
    typeId: 34828,
    tone: 'teal',
    typeLabel: 'Tactical Destroyer',
    isk: 78_420_000,
    sub: 'Manufacturing · 11 raw inputs',
    tags: [
      { label: 'Build', tone: 'blue' },
      { label: '+4.1% margin', tone: 'orange' },
    ],
  },
  {
    id: 'fernite',
    title: 'Fernite Carbide',
    typeId: 9_000_011,
    tone: 'purple',
    typeLabel: 'Reaction',
    isk: 1_240_000,
    sub: 'Composite reaction · 2 moon inputs',
    tags: [
      { label: 'Reaction', tone: 'purple' },
      { label: '−2.0% margin', tone: 'red' },
    ],
  },
];
