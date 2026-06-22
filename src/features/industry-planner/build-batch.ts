import type { TreeNode } from '@/data/eve-data/tree-resolver';

// Whole-run ("batched") raw-material totals — the cost basis for the planner.
//
// What a player must actually BUY to build the target from an empty hangar: you
// can't run 1.68 of a reaction, you run 2 and buy inputs for 2. So at every
// buildable node the run count is ceil(cumulative demand ÷ batch yield), with
// demand summed across ALL parents before the ceil (a shared sub-component is
// counted once, never per-parent). Leaves with no recipe accumulate into the
// raw total. This is the request-time correction on top of the eve-data
// resolver's MARGINAL (fractional-run) tree — it reads only the per-run input
// quantities and batch yields the resolver already provides and re-derives runs
// with ceil, so it never touches the resolver or its stored flat materials.
//
// ME0 throughout: the resolver's per-run quantities are ME0, reactions have no
// ME, and this base applies none to manufacturing either. Empty-hangar: no
// inventory netting ("use what I have" is a later transform off the same walk).

// One buildable type's recipe, flattened from the nested tree (the per-run
// inputs of the blueprint that produces it, plus how many it yields per run).
interface Recipe {
  batch: number;
  inputs: { typeId: number; qty: number }[];
}

// Flatten the nested tree into a per-typeId recipe map. A type is produced by
// exactly one blueprint (the resolver's productToBlueprint is 1:1), so every
// occurrence carries the same recipe — first one wins.
function flattenRecipes(tree: TreeNode[]): Map<number, Recipe> {
  const recipes = new Map<number, Recipe>();
  const collect = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.producedBy && !recipes.has(node.typeId)) {
        recipes.set(node.typeId, {
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

// The raw (leaf) type IDs in a tree — the materials with no recipe. Run- and
// price-independent, so it's the set the planner prices and refreshes.
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

// The whole-run batch ledger for `requestedRuns` runs of the blueprint at the
// root of `tree`: the raw (leaf) totals you buy from an empty hangar, PLUS, for
// every buildable, the whole runs its aggregate demand needs and the blueprint's
// per-run yield (`batch`). `runs × batch` is what a run-rounded build actually
// produces — the figure the build-plan columns show. One walk feeds both: the
// raws are the cost basis (`computeBatchMaterials`), the builds drive the tier
// display, so the two can never disagree on runs.
export interface BatchLedger {
  // Raw-material typeId → whole-run total quantity.
  raws: Map<number, number>;
  // Buildable typeId → its whole run count and per-run yield. Produced = runs × batch.
  builds: Map<number, { runs: number; batch: number }>;
}

// `requestedRuns` defaults to 1 — one run of the blueprint, today's per-run cost basis.
export function computeBatchLedger(tree: TreeNode[], requestedRuns = 1): BatchLedger {
  const recipes = flattenRecipes(tree);
  // Per buildable type: cumulative demand and the whole runs that demand needs.
  const ledger = new Map<number, { required: number; runs: number }>();
  const raws = new Map<number, number>();

  // Incremental walk: each visit tops up a type's cumulative demand, recomputes
  // its whole-run count, and recurses ONLY for the additional runs since the
  // last visit. Because runs is always ceil(cumulative ÷ batch), the totals that
  // reach the leaves are identical to a topological aggregate-then-ceil, with no
  // double-counting of shared sub-components — regardless of visit order.
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

  const builds = new Map<number, { runs: number; batch: number }>();
  for (const [typeId, entry] of ledger) {
    builds.set(typeId, { runs: entry.runs, batch: recipes.get(typeId)!.batch });
  }

  return { raws, builds };
}

// Raw-material totals to build `requestedRuns` runs of the blueprint at the root
// of `tree`, on the whole-run batch basis described above — the cost-panel basis.
// A thin projection of `computeBatchLedger`'s raws so the two share one walk.
export function computeBatchMaterials(
  tree: TreeNode[],
  requestedRuns = 1,
): { typeId: number; quantity: number }[] {
  return [...computeBatchLedger(tree, requestedRuns).raws.entries()].map(
    ([typeId, quantity]) => ({ typeId, quantity }),
  );
}

// The ACTUAL (marginal) downstream demand when one buildable is focused: what
// building its whole-run batch truly consumes at each descendant, with NO
// per-component batch rounding — the build-plan drill-down view. The focused type
// runs its whole-run count (from `ledger`, so it matches the column you clicked);
// below it, runs cascade fractionally (demand ÷ yield), so each cell is the exact
// quantity consumed, not rounded up to whole sub-runs. Example: a reaction's fuel
// blocks read the amount the reaction actually burns, not the two whole fuel-block
// runs the project's cost basis rounds up to.
//
// Keyed by depth RELATIVE to the focus (1 = the focus's direct inputs, 2 =
// theirs, …) to line up with `chainLevelsFrom`, so the build plan reads each lit
// tier's actuals by `relativeDepth = tier.depth − focus.depth`. The focus itself
// (relative depth 0) is omitted — it keeps showing its whole-run batch.
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
    const depth = relativeDepth + 1;
    let level = actuals.get(depth);
    if (!level) {
      level = new Map();
      actuals.set(depth, level);
    }
    for (const input of recipe.inputs) {
      const demand = runs * input.qty;
      level.set(input.typeId, (level.get(input.typeId) ?? 0) + demand);
      const childRecipe = recipes.get(input.typeId);
      if (childRecipe && childRecipe.batch > 0) walk(input.typeId, demand / childRecipe.batch, depth);
    }
  };
  walk(focusTypeId, rootRuns, 0);

  return actuals;
}
