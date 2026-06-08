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

// Raw-material totals to build `requestedRuns` runs of the blueprint at the root
// of `tree`, on the whole-run batch basis described above. `requestedRuns`
// defaults to 1 — one run of the blueprint, today's per-run cost basis.
export function computeBatchMaterials(
  tree: TreeNode[],
  requestedRuns = 1,
): { typeId: number; quantity: number }[] {
  const recipes = flattenRecipes(tree);
  // Per buildable type: cumulative demand and the whole runs that demand needs.
  const ledger = new Map<number, { required: number; runs: number }>();
  const raw = new Map<number, number>();

  // Incremental walk: each visit tops up a type's cumulative demand, recomputes
  // its whole-run count, and recurses ONLY for the additional runs since the
  // last visit. Because runs is always ceil(cumulative ÷ batch), the totals that
  // reach the leaves are identical to a topological aggregate-then-ceil, with no
  // double-counting of shared sub-components — regardless of visit order.
  const walk = (typeId: number, qtyNeeded: number) => {
    const recipe = recipes.get(typeId);
    if (!recipe) {
      raw.set(typeId, (raw.get(typeId) ?? 0) + qtyNeeded);
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

  return [...raw.entries()].map(([typeId, quantity]) => ({ typeId, quantity }));
}
