// A compact builder that turns a readable nested spec into a valid
// `BlueprintStructure`, so the sandbox can offer several sample builds (a small
// frigate, a medium T3 cruiser, a large capital) without hand-writing each
// field. Labels + tones mirror what the live `classifyBuildNode` would assign.

import type { Tone } from '@/components/ui/tones';
import type {
  BlueprintStructure,
  BuildNode,
  BuildNodeDisplay,
  MaterialCategoryMeta,
} from '@/features/industry-planner/types';

type Cat =
  | 'component'
  | 'subsystem'
  | 'reaction'
  | 'mineral'
  | 'moon'
  | 'gas'
  | 'salvage'
  | 'pi';

interface Node {
  name: string;
  cat: Cat;
  qty: number;
  children?: Node[];
}

const CAT_META: Record<Cat, { label: string; tone: Tone; isRaw: boolean }> = {
  component: { label: 'Construction Components', tone: 'blue', isRaw: false },
  subsystem: { label: 'Subsystem', tone: 'green-strong', isRaw: false },
  reaction: { label: 'Reaction', tone: 'purple', isRaw: false },
  mineral: { label: 'Mineral', tone: 'neutral', isRaw: true },
  moon: { label: 'Moon Materials', tone: 'magenta', isRaw: true },
  gas: { label: 'Gas', tone: 'teal', isRaw: true },
  salvage: { label: 'Salvage', tone: 'yellow', isRaw: true },
  pi: { label: 'Planetary', tone: 'orange-soft', isRaw: true },
};

interface BuildSpec {
  productName: string;
  productGroup: string;
  blueprintTypeId: number;
  inputs: Node[];
}

export function buildStructure(spec: BuildSpec): BlueprintStructure {
  const display: Record<number, BuildNodeDisplay> = {};
  const names: Record<number, string> = {};
  const idByName = new Map<string, number>();
  let nextId = 9_100_000;
  const idFor = (name: string): number => {
    let id = idByName.get(name);
    if (id === undefined) {
      id = nextId++;
      idByName.set(name, id);
    }
    return id;
  };

  function build(node: Node): { built: BuildNode; height: number } {
    const id = idFor(node.name);
    const kids = (node.children ?? []).map(build);
    const height = kids.length ? 1 + Math.max(...kids.map((k) => k.height)) : 0;
    const meta = CAT_META[node.cat];
    const existing = display[id];
    if (existing) {
      // Per-type-stable display: a type reused at several depths keeps its
      // tallest height.
      existing.height = Math.max(existing.height, height);
    } else {
      display[id] = { name: node.name, height, isRaw: meta.isRaw, label: meta.label, tone: meta.tone };
      names[id] = node.name;
    }
    return { built: { typeId: id, quantity: node.qty, inputs: kids.map((k) => k.built) }, height };
  }

  const productId = idFor(spec.productName);
  const builtInputs = spec.inputs.map(build);
  const rootHeight = builtInputs.length ? 1 + Math.max(...builtInputs.map((k) => k.height)) : 1;
  display[productId] = {
    name: spec.productName,
    height: rootHeight,
    isRaw: false,
    label: spec.productGroup,
    tone: 'teal',
  };
  names[productId] = spec.productName;

  const buildTree: BuildNode[] = [
    { typeId: productId, quantity: 1, inputs: builtInputs.map((k) => k.built) },
  ];

  // Flat raw totals (sum every raw occurrence) + their source categories.
  const flat = new Map<number, number>();
  const categoryByType: Record<number, string> = {};
  const categoryTone = new Map<string, Tone>();
  const walk = (node: BuildNode) => {
    const d = display[node.typeId];
    if (d.isRaw) {
      flat.set(node.typeId, (flat.get(node.typeId) ?? 0) + node.quantity);
      categoryByType[node.typeId] = d.label;
      categoryTone.set(d.label, d.tone);
    }
    node.inputs.forEach(walk);
  };
  buildTree[0].inputs.forEach(walk);

  const materialCategories: MaterialCategoryMeta[] = [...categoryTone.entries()].map(
    ([label, tone]) => ({ label, tone }),
  );

  return {
    blueprintTypeId: spec.blueprintTypeId,
    activityId: 1,
    product: { typeId: productId, name: spec.productName, quantityPerRun: 1 },
    tree: [],
    buildTree,
    buildNodeDisplay: display,
    rootHeight,
    flatMaterials: [...flat.entries()].map(([typeId, quantity]) => ({ typeId, quantity })),
    materialCategory: categoryByType,
    materialCategories,
    materialNames: names,
  };
}

// ── Rifter — T1 frigate: shallow, a handful of minerals ──────────────────
const RIFTER = buildStructure({
  productName: 'Rifter',
  productGroup: 'Frigate',
  blueprintTypeId: 588,
  inputs: [
    { name: 'Tritanium', cat: 'mineral', qty: 24_000 },
    { name: 'Pyerite', cat: 'mineral', qty: 7_600 },
    { name: 'Mexallon', cat: 'mineral', qty: 2_600 },
    { name: 'Isogen', cat: 'mineral', qty: 480 },
    { name: 'Nocxium', cat: 'mineral', qty: 120 },
    { name: 'Zydrine', cat: 'mineral', qty: 30 },
  ],
});

// ── Loki — T3 strategic cruiser: subsystems + components + fullerene reactions ──
const LOKI = buildStructure({
  productName: 'Loki',
  productGroup: 'Strategic Cruiser',
  blueprintTypeId: 29990,
  inputs: [
    {
      name: 'Defensive Subsystem',
      cat: 'subsystem',
      qty: 1,
      children: [
        {
          name: 'Fullerite-C320',
          cat: 'reaction',
          qty: 22,
          children: [
            { name: 'Fullerene Gas C50', cat: 'gas', qty: 120 },
            { name: 'Fullerene Gas C60', cat: 'gas', qty: 70 },
          ],
        },
        { name: 'Tritanium', cat: 'mineral', qty: 3_200 },
      ],
    },
    {
      name: 'Propulsion Subsystem',
      cat: 'subsystem',
      qty: 1,
      children: [
        {
          name: 'Carbon Fiber',
          cat: 'reaction',
          qty: 16,
          children: [
            { name: 'Fullerene Gas C72', cat: 'gas', qty: 90 },
            { name: 'Hydrogen Isotopes', cat: 'gas', qty: 200 },
          ],
        },
        { name: 'Pyerite', cat: 'mineral', qty: 2_400 },
      ],
    },
    {
      name: 'Reinforced Bulkheads',
      cat: 'component',
      qty: 4,
      children: [
        { name: 'Tritanium', cat: 'mineral', qty: 600 },
        { name: 'Mexallon', cat: 'mineral', qty: 90 },
      ],
    },
    { name: 'Tritanium', cat: 'mineral', qty: 14_000 },
    { name: 'Pyerite', cat: 'mineral', qty: 5_200 },
    { name: 'Isogen', cat: 'mineral', qty: 700 },
  ],
});

// ── Archon — capital carrier: deep + wide (capital parts → components → reactions → moon) ──
function capPart(name: string, qty: number, reaction: string, m1: string, m2: string): Node {
  return {
    name,
    cat: 'component',
    qty,
    children: [
      {
        name: reaction,
        cat: 'reaction',
        qty: 30,
        children: [
          { name: m1, cat: 'moon', qty: 100 },
          { name: m2, cat: 'moon', qty: 60 },
        ],
      },
      { name: 'Tritanium', cat: 'mineral', qty: 12_000 },
      { name: 'Pyerite', cat: 'mineral', qty: 4_000 },
    ],
  };
}

const ARCHON = buildStructure({
  productName: 'Archon',
  productGroup: 'Carrier',
  blueprintTypeId: 23758,
  inputs: [
    capPart('Capital Armor Plates', 28, 'Sylramic Fibers', 'Caesium', 'Hydrogen'),
    capPart('Capital Construction Parts', 22, 'Fernite Carbide', 'Cadmium', 'Vanadium'),
    capPart('Capital Computer System', 14, 'Crystalline Carbonide', 'Platinum', 'Chromium'),
    capPart('Capital Power Generator', 10, 'Tungsten Carbide', 'Tungsten', 'Titanium'),
    capPart('Capital Sensor Cluster', 8, 'Phenolic Composites', 'Cobalt', 'Scandium'),
    {
      name: 'Capital Jump Drive',
      cat: 'component',
      qty: 3,
      children: [
        { name: 'Morphite', cat: 'salvage', qty: 220 },
        {
          name: 'Nanotransistors',
          cat: 'reaction',
          qty: 20,
          children: [
            { name: 'Platinum', cat: 'moon', qty: 80 },
            { name: 'Cobalt', cat: 'moon', qty: 50 },
          ],
        },
      ],
    },
    { name: 'Tritanium', cat: 'mineral', qty: 2_400_000 },
    { name: 'Pyerite', cat: 'mineral', qty: 620_000 },
    { name: 'Mexallon', cat: 'mineral', qty: 180_000 },
    { name: 'Isogen', cat: 'mineral', qty: 42_000 },
    { name: 'Nocxium', cat: 'mineral', qty: 9_800 },
    { name: 'Zydrine', cat: 'mineral', qty: 3_200 },
    { name: 'Megacyte', cat: 'mineral', qty: 1_400 },
  ],
});

export interface SampleBlueprint {
  id: string;
  label: string;
  sub: string;
  structure: BlueprintStructure;
}

export const SAMPLE_BLUEPRINTS: SampleBlueprint[] = [
  { id: 'rifter', label: 'Rifter', sub: 'T1 frigate · small', structure: RIFTER },
  { id: 'loki', label: 'Loki', sub: 'T3 cruiser · medium', structure: LOKI },
  { id: 'archon', label: 'Archon', sub: 'Carrier · large', structure: ARCHON },
];
