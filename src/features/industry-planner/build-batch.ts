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
// `blueprintTypeId` is the producing blueprint — the key the owned-ME transform
// looks an ME level up by; inert for the ME0 cost basis.
interface Recipe {
  blueprintTypeId: number;
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
  // Buildable typeId → its whole run count, per-run yield, the ME applied to ITS
  // inputs (0 on the ME0 path / for an unowned blueprint), the producing
  // blueprint's type id, and the aggregate demand the whole runs were ceiled
  // from. Produced = runs × batch; surplus = runs × batch − required (what the
  // forced whole runs leave in the hangar). The `me` carries the owned (or
  // manually overridden) level through to the build-plan's drill-down and per-node
  // readouts; `blueprintTypeId` keys each node's ME control back to the override
  // map — so tiers, the cascade, and the controls all read one source and can
  // never disagree.
  builds: Map<
    number,
    { runs: number; batch: number; me: number; blueprintTypeId: number; required: number }
  >;
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

  const builds: BatchLedger['builds'] = new Map();
  for (const [typeId, entry] of ledger) {
    const recipe = recipes.get(typeId)!;
    // ME0 path: no owned-blueprint reduction is applied anywhere.
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

// --- Owned-blueprint material efficiency (3.7.5.2) -----------------------
//
// Per-component ME: each buildable node's material consumption is computed at
// the ME of the OWNED blueprint that produces it (best-ME-per-type, resolved
// upstream), falling back to ME0 for unowned nodes — so the cost basis reflects
// what the player actually owns. A pure overlay over the same tree: it never
// touches the resolver or the ME0 path, so the gross seed stays byte-identical
// when nothing is owned (`meOf` returns undefined → ME0 everywhere).
//
// The ME lookup is a callback (not the owned-blueprints map type) so this stays
// inside the industry-planner slice — a feature never imports another feature.

// What the transform needs to apply per-component ME: the per-blueprint ME
// lookup, and the TOP blueprint's id (the root tree nodes are ITS direct inputs,
// so the top blueprint's ME reduces them).
export interface MeOptions {
  meOf: (blueprintTypeId: number) => number | undefined;
  topBlueprintTypeId: number;
  // Optional per-node structure material factor (3.7.9.1.3): the (1 − structureMe/100)
  // a selected build structure applies to THIS blueprint's job, by its activity — an
  // Engineering Complex reduces manufacturing nodes; a Refinery does NOT reduce
  // reaction material (reactions get no structure ME), so it returns 1 there. Omitted
  // (or returning 1) ⇒ the material basis is byte-identical to the no-structure path.
  structureMeFactorOf?: (blueprintTypeId: number) => number;
}

function roundTo2(x: number): number {
  return Math.round(x * 100) / 100;
}

// EVE's manufacturing material quantity for `runs` runs of a blueprint at ME
// `me`, base per-run quantity `qty`, optionally reduced further by a structure
// material factor `structureMult` (3.7.9.1.3):
//   max(runs, ceil(round(qty · runs · (1 − ME/100) · structureMult, 2))).
// The blueprint ME and the structure compose as independent (1 − x) factors and
// the product is rounded ONCE (round-to-2 then ceil), floored at one unit per run
// — the verified EVE formula. `structureMult` defaults to 1, and ME ≤ 0 with no
// structure is exactly qty·runs, so the no-structure / unowned / reaction path is
// byte-identical to the pre-3.7.9 formula. `max(runs, …)` is EVE's "≥1 unit per
// run" floor; the round-to-2 before the ceil neutralises float noise.
function meAdjust(qty: number, runs: number, me: number, structureMult = 1): number {
  const meMult = me > 0 ? 1 - me / 100 : 1;
  const mult = meMult * structureMult;
  if (mult >= 1) return qty * runs; // both factors no-ops → exactly qty·runs
  return Math.max(runs, Math.ceil(roundTo2(qty * runs * mult)));
}

// The shared scaffolding of the topological (aggregate-then-resolve) walks:
// buildable demand accumulates in `demand`, recipe-less leaves in `raws`, and
// `ordered` visits parents before children (descending recipe height) so a
// buildable's demand is fully aggregated before its runs are derived. The
// batched ledger and the marginal walk differ only in HOW they turn demand
// into runs (ceil vs fractional) — this is everything they share.
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

// Per-buildable-type graph height over the recipe DAG (raws = 0). Memoised; the
// DAG is acyclic (the resolver guarantees it), so the recursion terminates.
function recipeHeights(recipes: Map<number, Recipe>): Map<number, number> {
  const heights = new Map<number, number>();
  const heightOf = (typeId: number): number => {
    const cached = heights.get(typeId);
    if (cached !== undefined) return cached;
    const recipe = recipes.get(typeId);
    if (!recipe) return 0; // raw leaf
    let h = 0;
    for (const input of recipe.inputs) h = Math.max(h, 1 + heightOf(input.typeId));
    heights.set(typeId, h);
    return h;
  };
  for (const typeId of recipes.keys()) heightOf(typeId);
  return heights;
}

// The whole-run batch ledger with per-component owned ME applied. Same shape and
// meaning as `computeBatchLedger`, but ME-aware: because ME's ceil is non-linear
// in the run count, each buildable's ME must be applied ONCE over its final run
// total — so this is a topological aggregate-then-ceil (process parents before
// children by descending height) rather than the ME0 path's incremental walk. A
// buildable's height is strictly greater than any of its inputs', so its demand
// is fully aggregated before its runs (and ME-reduced input draw) are computed.
// With `meOf` returning undefined everywhere this reproduces `computeBatchLedger`
// exactly (meAdjust → qty·runs), the byte-identical-at-ME0 guarantee.
export function computeBatchLedgerWithMe(
  tree: TreeNode[],
  requestedRuns: number,
  opts: MeOptions,
): BatchLedger {
  const recipes = flattenRecipes(tree);
  const { demand, raws, addDemand, ordered } = topologicalDemand(recipes);

  // Per-node structure material factor (3.7.9.1.3); 1 everywhere with no structure
  // selected, keeping the basis byte-identical.
  const structureFactorOf = opts.structureMeFactorOf ?? (() => 1);

  // Seed: the root tree nodes are the TOP blueprint's direct inputs, so the top
  // blueprint's ME (and the structure placed there) reduces them. requestedRuns
  // is an integer run count.
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
    // The ME of THIS buildable's own blueprint — applied to its inputs below, and
    // surfaced on the ledger so the drill-down + per-node readouts read it too.
    const me = opts.meOf(recipe.blueprintTypeId) ?? 0;
    builds.set(typeId, { runs, batch: recipe.batch, me, blueprintTypeId: recipe.blueprintTypeId, required });
    const structureMult = structureFactorOf(recipe.blueprintTypeId);
    for (const input of recipe.inputs)
      addDemand(input.typeId, meAdjust(input.qty, runs, me, structureMult));
  }

  return { raws, builds };
}

// Raw-material totals with per-component owned ME applied — the ME-aware twin of
// `computeBatchMaterials`, a thin projection of `computeBatchLedgerWithMe`'s raws.
export function computeBatchMaterialsWithMe(
  tree: TreeNode[],
  requestedRuns: number,
  opts: MeOptions,
): { typeId: number; quantity: number }[] {
  return [...computeBatchLedgerWithMe(tree, requestedRuns, opts).raws.entries()].map(
    ([typeId, quantity]) => ({ typeId, quantity }),
  );
}

// Marginal ("Item" basis) raw-material totals: what `requestedRuns` runs of the
// top blueprint actually CONSUME, with no batch rounding anywhere below the
// root — the fractional twin of `computeBatchMaterials(WithMe)`. Each buildable
// runs exactly demand ÷ yield (no ceil, no ≥1-per-run floor), so a hull that
// needs 16 units out of a 200-unit reaction batch is charged 16, not 200.
// Linear in `requestedRuns` by construction. ME (owned blueprint + structure)
// applies as linear factors per `meFactor` — the same fractional-lens semantics
// as `chainActualsFrom`; with no `opts` (or ME0 everywhere) the factors are ×1.
// Only the requested runs themselves stay whole (they arrive as an integer).
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

  // With no ceil the topological order is not load-bearing, but sharing the
  // walk's shape keeps the two bases easy to compare side by side.
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

// Every blueprint type that produces something in this build — the top product's
// blueprint plus every buildable node's producing blueprint. The set the client
// asks the owned-blueprints endpoint about (its ME lookup is keyed by these).
export function collectBlueprintTypeIds(tree: TreeNode[], topBlueprintTypeId: number): number[] {
  const out = new Set<number>([topBlueprintTypeId]);
  for (const recipe of flattenRecipes(tree).values()) out.add(recipe.blueprintTypeId);
  return [...out];
}

// Fractional material-efficiency factor for the marginal drill-down: ME `me`
// scales a parent's input draw by (1 − ME/100), with ME ≤ 0 (unowned / reaction)
// a no-op (×1). This is the LINEAR analog of `meAdjust` with no ceil and no
// ≥1-per-run floor — right for the drill-down because that view is the
// un-rounded marginal lens by construction (it already shows the sub-run
// quantities the cost basis rounds up). At ME0 it's ×1, so the cascade is
// byte-identical to the pre-ME path.
function meFactor(me: number): number {
  return me <= 0 ? 1 : 1 - me / 100;
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
// ME-aware: each parent's inputs are reduced by that parent's own owned-blueprint
// ME (carried on `ledger.builds[typeId].me`), applied fractionally per `meFactor`
// so it composes down the cascade. At ME0 the factor is ×1, so the actuals are
// byte-identical to the unowned path.
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
    // This parent's owned ME reduces how much of each input it draws.
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
