import type { TreeNode } from '@/data/eve-data/tree-resolver';

interface Recipe {
  blueprintTypeId: number;
  batch: number;
  inputs: { typeId: number; qty: number }[];
}

function flattenRecipes(tree: TreeNode[]): Map<number, Recipe> {
  const recipes = new Map<number, Recipe>();
  const collect = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.producedBy && !recipes.has(node.typeId)) {
        recipes.set(node.typeId, {
          blueprintTypeId: node.producedBy.blueprintTypeId,
          batch: node.producedBy.quantityPerRun,
          inputs: node.inputs.map((i) => ({ typeId: i.typeId, qty: i.quantity })),
        });
        collect(node.inputs);
      }
    }
  };
  collect(tree);
  return recipes;
}

export function collectRawTypeIds(tree: TreeNode[]): number[] {
  const recipes = flattenRecipes(tree);
  const raws = new Set<number>();
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (recipes.has(node.typeId)) walk(node.inputs);
      else raws.add(node.typeId);
    }
  };
  walk(tree);
  return [...raws];
}

export interface BatchLedger {
  raws: Map<number, number>;
  builds: Map<
    number,
    { runs: number; batch: number; me: number; blueprintTypeId: number; required: number }
  >;
}

export function computeBatchLedger(tree: TreeNode[], requestedRuns = 1): BatchLedger {
  const recipes = flattenRecipes(tree);
  const ledger = new Map<number, { required: number; runs: number }>();
  const raws = new Map<number, number>();

  const walk = (typeId: number, qtyNeeded: number) => {
    const recipe = recipes.get(typeId);
    if (!recipe) {
      raws.set(typeId, (raws.get(typeId) ?? 0) + qtyNeeded);
      return;
    }
    let entry = ledger.get(typeId);
    if (!entry) {
      entry = { required: 0, runs: 0 };
      ledger.set(typeId, entry);
    }
    const prevRuns = entry.runs;
    entry.required += qtyNeeded;
    entry.runs = recipe.batch > 0 ? Math.ceil(entry.required / recipe.batch) : 0;
    const additionalRuns = entry.runs - prevRuns;
    if (additionalRuns > 0) {
      for (const input of recipe.inputs) walk(input.typeId, additionalRuns * input.qty);
    }
  };

  for (const node of tree) walk(node.typeId, node.quantity * requestedRuns);

  const builds: BatchLedger['builds'] = new Map();
  for (const [typeId, entry] of ledger) {
    const recipe = recipes.get(typeId)!;
    builds.set(typeId, {
      runs: entry.runs,
      batch: recipe.batch,
      me: 0,
      blueprintTypeId: recipe.blueprintTypeId,
      required: entry.required,
    });
  }

  return { raws, builds };
}

export function computeBatchMaterials(
  tree: TreeNode[],
  requestedRuns = 1,
): { typeId: number; quantity: number }[] {
  return [...computeBatchLedger(tree, requestedRuns).raws.entries()].map(
    ([typeId, quantity]) => ({ typeId, quantity }),
  );
}

export interface MeOptions {
  meOf: (blueprintTypeId: number) => number | undefined;
  topBlueprintTypeId: number;
  structureMeFactorOf?: (blueprintTypeId: number) => number;
}

function roundTo2(x: number): number {
  return Math.round(x * 100) / 100;
}

function meAdjust(qty: number, runs: number, me: number, structureMult = 1): number {
  const meMult = me > 0 ? 1 - me / 100 : 1;
  const mult = meMult * structureMult;
  if (mult >= 1) return qty * runs;
  return Math.max(runs, Math.ceil(roundTo2(qty * runs * mult)));
}

function topologicalDemand(recipes: Map<number, Recipe>): {
  demand: Map<number, number>;
  raws: Map<number, number>;
  addDemand: (typeId: number, qty: number) => void;
  ordered: number[];
} {
  const heights = recipeHeights(recipes);
  const demand = new Map<number, number>();
  const raws = new Map<number, number>();
  const addDemand = (typeId: number, qty: number) => {
    if (recipes.has(typeId)) demand.set(typeId, (demand.get(typeId) ?? 0) + qty);
    else raws.set(typeId, (raws.get(typeId) ?? 0) + qty);
  };
  const ordered = [...recipes.keys()].sort(
    (a, b) => (heights.get(b) ?? 0) - (heights.get(a) ?? 0),
  );
  return { demand, raws, addDemand, ordered };
}

function recipeHeights(recipes: Map<number, Recipe>): Map<number, number> {
  const heights = new Map<number, number>();
  const heightOf = (typeId: number): number => {
    const cached = heights.get(typeId);
    if (cached !== undefined) return cached;
    const recipe = recipes.get(typeId);
    if (!recipe) return 0;
    let h = 0;
    for (const input of recipe.inputs) h = Math.max(h, 1 + heightOf(input.typeId));
    heights.set(typeId, h);
    return h;
  };
  for (const typeId of recipes.keys()) heightOf(typeId);
  return heights;
}

export function computeBatchLedgerWithMe(
  tree: TreeNode[],
  requestedRuns: number,
  opts: MeOptions,
): BatchLedger {
  const recipes = flattenRecipes(tree);
  const { demand, raws, addDemand, ordered } = topologicalDemand(recipes);

  const structureFactorOf = opts.structureMeFactorOf ?? (() => 1);

  const topMe = opts.meOf(opts.topBlueprintTypeId) ?? 0;
  for (const node of tree)
    addDemand(
      node.typeId,
      meAdjust(node.quantity, requestedRuns, topMe, structureFactorOf(opts.topBlueprintTypeId)),
    );
  const builds: BatchLedger['builds'] = new Map();
  for (const typeId of ordered) {
    const recipe = recipes.get(typeId)!;
    const required = demand.get(typeId) ?? 0;
    const runs = recipe.batch > 0 ? Math.ceil(required / recipe.batch) : 0;
    const me = opts.meOf(recipe.blueprintTypeId) ?? 0;
    builds.set(typeId, { runs, batch: recipe.batch, me, blueprintTypeId: recipe.blueprintTypeId, required });
    const structureMult = structureFactorOf(recipe.blueprintTypeId);
    for (const input of recipe.inputs)
      addDemand(input.typeId, meAdjust(input.qty, runs, me, structureMult));
  }

  return { raws, builds };
}

export function computeBatchMaterialsWithMe(
  tree: TreeNode[],
  requestedRuns: number,
  opts: MeOptions,
): { typeId: number; quantity: number }[] {
  return [...computeBatchLedgerWithMe(tree, requestedRuns, opts).raws.entries()].map(
    ([typeId, quantity]) => ({ typeId, quantity }),
  );
}

export function computeMarginalMaterials(
  tree: TreeNode[],
  requestedRuns = 1,
  opts?: MeOptions,
): { typeId: number; quantity: number }[] {
  const recipes = flattenRecipes(tree);
  const { demand, raws, addDemand, ordered } = topologicalDemand(recipes);

  const meOf = opts?.meOf ?? (() => undefined);
  const structureFactorOf = opts?.structureMeFactorOf ?? (() => 1);
  const factorFor = (blueprintTypeId: number) =>
    meFactor(meOf(blueprintTypeId) ?? 0) * structureFactorOf(blueprintTypeId);

  const topFactor = opts ? factorFor(opts.topBlueprintTypeId) : 1;
  for (const node of tree) addDemand(node.typeId, node.quantity * requestedRuns * topFactor);

  for (const typeId of ordered) {
    const recipe = recipes.get(typeId)!;
    const required = demand.get(typeId) ?? 0;
    const runs = recipe.batch > 0 ? required / recipe.batch : 0;
    const factor = factorFor(recipe.blueprintTypeId);
    for (const input of recipe.inputs) addDemand(input.typeId, input.qty * runs * factor);
  }

  return [...raws.entries()].map(([typeId, quantity]) => ({ typeId, quantity }));
}

export function collectBlueprintTypeIds(tree: TreeNode[], topBlueprintTypeId: number): number[] {
  const out = new Set<number>([topBlueprintTypeId]);
  for (const recipe of flattenRecipes(tree).values()) out.add(recipe.blueprintTypeId);
  return [...out];
}

function meFactor(me: number): number {
  return me <= 0 ? 1 : 1 - me / 100;
}

export interface MultibuyOptions {
  buildSet: Set<number>;
  ownedOf?: (typeId: number) => number;
}

function seedTopDemand(
  tree: TreeNode[],
  requestedRuns: number,
  meOpts: MeOptions,
  addDemand: (typeId: number, qty: number) => void,
): void {
  const structureFactorOf = meOpts.structureMeFactorOf ?? (() => 1);
  const topMe = meOpts.meOf(meOpts.topBlueprintTypeId) ?? 0;
  for (const node of tree)
    addDemand(
      node.typeId,
      meAdjust(node.quantity, requestedRuns, topMe, structureFactorOf(meOpts.topBlueprintTypeId)),
    );
}

function expandBuild(
  recipe: Recipe,
  net: number,
  meOpts: MeOptions,
  addDemand: (typeId: number, qty: number) => void,
): void {
  const runs = recipe.batch > 0 ? Math.ceil(net / recipe.batch) : 0;
  const me = meOpts.meOf(recipe.blueprintTypeId) ?? 0;
  const structureMult = (meOpts.structureMeFactorOf ?? (() => 1))(recipe.blueprintTypeId);
  for (const input of recipe.inputs)
    addDemand(input.typeId, meAdjust(input.qty, runs, me, structureMult));
}

export function computeMultibuyDemand(
  tree: TreeNode[],
  requestedRuns: number,
  meOpts: MeOptions,
  opts: MultibuyOptions,
): Map<number, number> {
  const recipes = flattenRecipes(tree);
  const { demand, raws, addDemand, ordered } = topologicalDemand(recipes);
  const ownedOf = opts.ownedOf ?? (() => 0);
  seedTopDemand(tree, requestedRuns, meOpts, addDemand);

  const buy = new Map<number, number>();
  for (const typeId of ordered) {
    const net = Math.max(0, (demand.get(typeId) ?? 0) - ownedOf(typeId));
    if (net <= 0) continue;
    if (!opts.buildSet.has(typeId)) {
      buy.set(typeId, net);
      continue;
    }
    expandBuild(recipes.get(typeId)!, net, meOpts, addDemand);
  }

  for (const [typeId, qty] of raws) {
    const net = Math.max(0, qty - ownedOf(typeId));
    if (net > 0) buy.set(typeId, net);
  }
  return buy;
}

export function chainActualsFrom(
  tree: TreeNode[],
  focusTypeId: number,
  ledger: BatchLedger,
): Map<number, Map<number, number>> {
  const recipes = flattenRecipes(tree);
  const actuals = new Map<number, Map<number, number>>();
  const rootRuns = ledger.builds.get(focusTypeId)?.runs ?? 0;

  const walk = (typeId: number, runs: number, relativeDepth: number) => {
    const recipe = recipes.get(typeId);
    if (!recipe) return;
    const factor = meFactor(ledger.builds.get(typeId)?.me ?? 0);
    const depth = relativeDepth + 1;
    let level = actuals.get(depth);
    if (!level) {
      level = new Map();
      actuals.set(depth, level);
    }
    for (const input of recipe.inputs) {
      const demand = runs * input.qty * factor;
      level.set(input.typeId, (level.get(input.typeId) ?? 0) + demand);
      const childRecipe = recipes.get(input.typeId);
      if (childRecipe && childRecipe.batch > 0) walk(input.typeId, demand / childRecipe.batch, depth);
    }
  };
  walk(focusTypeId, rootRuns, 0);

  return actuals;
}
