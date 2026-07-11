import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { AnyPgDb } from '@/lib/db-types';
import { readEnv } from '@/lib/env';
import {
  INDUSTRY_ACTIVITY_NAMES,
  REFERENCE_BLUEPRINT_TYPE_IDS,
  SDE_META_KEY_TREE_HASH,
  TREE_RESOLVER_ALGO_VERSION,
} from './constants';
import { getSdeMetaValue, setSdeMetaValue } from './meta';
import {
  blueprintFlatMaterials,
  blueprintTrees,
  eveTypes,
  industryBlueprints,
} from './schema';


// Materialised tree node used both as the JSONB row in `blueprint_trees`
// and as the in-memory representation walked by the resolver. `inputs`
// is non-recursive at the leaf — leaves have `inputs: []`.
export type TreeNode = {
  typeId: number;
  quantity: number; // qty required by the parent for one parent run
  // For non-leaf nodes: the per-run inputs of the producing blueprint,
  // multiplied through. Leaves carry the empty array.
  inputs: TreeNode[];
  // Present only on non-leaf nodes — the blueprint that produces this
  // type, how many it yields per run, and the (fractional) runs the parent's
  // need represents — see `runsFor`.
  producedBy?: { blueprintTypeId: number; quantityPerRun: number; runsNeeded: number };
};

// Graph height of every type that appears in a materialised build tree: the
// longest path from the type down to a raw leaf. A raw leaf (empty `inputs`)
// is height 0; a buildable is 1 + the tallest of its inputs. Height is a
// property of a type's recipe subtree, which the resolver guarantees is
// identical wherever that type appears (cycle-free DAG, path-independent), so
// we memoise by typeId and the first computed value is authoritative — this
// collapses a capital's millions of duplicated occurrences to one entry per
// distinct type. Pure: operates on the JSON tree, no DB.
export function computeHeights(nodes: TreeNode[]): Map<number, number> {
  const heights = new Map<number, number>();
  const visit = (node: TreeNode): number => {
    const memoed = heights.get(node.typeId);
    if (memoed !== undefined) return memoed;
    let h = 0;
    for (const child of node.inputs) {
      const childHeight = visit(child);
      if (childHeight + 1 > h) h = childHeight + 1;
    }
    heights.set(node.typeId, h);
    return h;
  };
  for (const node of nodes) visit(node);
  return heights;
}

export type ResolveSummary = {
  blueprintsResolved: number;
  flatMaterialsWritten: number;
  treesWritten: number;
  memoHits: number;
  memoMisses: number;
  cycleWarnings: string[];
  hashBefore: string | null;
  hashAfter: string;
  skipped: boolean;
  durationMs: number;
};

export type Material = { typeId: number; quantity: number };
export type Indexes = {
  // blueprintTypeId -> direct materials. We collapse activity 1 + 11
  // into a single per-blueprint list because no blueprint has BOTH
  // (a manufacturing recipe is mutually exclusive with a reaction
  // recipe), so the union is unambiguous.
  blueprintMaterials: Map<number, Material[]>;
  // outputTypeId -> producer. Used to decide "is this material itself
  // produced by a blueprint?" — i.e. leaf vs. recurse.
  productToBlueprint: Map<number, { blueprintTypeId: number; quantityPerRun: number }>;
};

export type MaterialRow = {
  blueprintTypeId: number;
  materialTypeId: number;
  quantity: number;
};
export type ProductRow = {
  blueprintTypeId: number;
  productTypeId: number;
  quantity: number;
};

// CCP blueprint `activities` JSON — the subset the resolver reads. Each activity
// (keyed by CCP's string name: `manufacturing`, `reaction`, …) carries optional
// `materials` / `products` lists of `{ typeID, quantity }`, plus `time` — the
// base seconds for ONE run (ME0/TE0, no skill/structure bonuses), read by the
// planner's Build-time tile.
type ActivityIO = {
  materials?: { typeID: number; quantity: number }[];
  products?: { typeID: number; quantity: number }[];
  time?: number;
};
export type BlueprintActivities = Record<string, ActivityIO | undefined>;

// Flatten a blueprint's manufacturing + reaction activities into flat
// material/product rows — the shared currency consumed by the index builder
// (buildIndexesFromActivities), the resolver hash (computeTreeResolverHash) and
// the tracked-types query. The two activities are collapsed per blueprint (see
// Indexes — a blueprint has one or the other), so the activity id isn't carried.
export function activitiesToRows(
  blueprintTypeId: number,
  activities: BlueprintActivities,
): { mats: MaterialRow[]; prods: ProductRow[] } {
  const mats: MaterialRow[] = [];
  const prods: ProductRow[] = [];
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const act = activities?.[name];
    if (!act) continue;
    for (const m of act.materials ?? []) {
      mats.push({ blueprintTypeId, materialTypeId: m.typeID, quantity: m.quantity });
    }
    for (const p of act.products ?? []) {
      prods.push({ blueprintTypeId, productTypeId: p.typeID, quantity: p.quantity });
    }
  }
  return { mats, prods };
}

// The base build time (SECONDS for one run) a blueprint produces under: the
// `time` of its manufacturing or reaction activity, preferring manufacturing (a
// blueprint carries at most one of the two). Returns null when neither carries a
// positive numeric time — the degenerate self-recipes (and any malformed row)
// have no honest build time, so the Build-time tile simply omits them.
export function pickBuildTimeSeconds(activities: BlueprintActivities): number | null {
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const time = activities?.[name]?.time;
    if (typeof time === 'number' && time > 0) return time;
  }
  return null;
}

// Builds the resolver indexes directly from CCP's per-blueprint `activities`,
// correcting for a degenerate shape in the SDE: ~51 deprecated, non-manufacturable
// items (old POS assembly arrays, silos, reactor arrays, outpost platforms,
// orbital ammo, a couple of hulls) ship a "1 of X makes 1 of X" recipe whose sole
// material is the product itself. EVE manufacturing is a strict DAG, so these are
// non-recipes, not real cycles.
//
// Two corrections, both keyed on the same self-referential shape:
//   1. Drop the self-referential material edge so the walker never reads it as a
//      self-loop. A blueprint's own products sit right beside its materials, so
//      this is a local check per blueprint.
//   2. A blueprint whose entire material list was self-referential can't actually
//      produce anything, so it is not registered as a producer. Its product then
//      resolves as a leaf (raw input) wherever consumed, instead of routing into
//      an empty blueprint and silently contributing nothing. Today none of these
//      products are consumed elsewhere, but this keeps us correct if a future SDE
//      starts consuming one of these deprecated types.
export function buildIndexesFromActivities(
  rows: {
    blueprintTypeId: number;
    activities: BlueprintActivities;
    published?: boolean | null;
  }[],
): Indexes {
  const blueprintMaterials = new Map<number, Material[]>();
  const productToBlueprint = new Map<
    number,
    { blueprintTypeId: number; quantityPerRun: number }
  >();

  // Producer selection below is first-writer-wins, so ROW ORDER decides which
  // blueprint wins a product made by more than one. Order published producers
  // first (deterministic blueprintTypeId tie-break) so the real, in-game
  // blueprint beats CCP's unpublished test/dev artifacts that share a product:
  // e.g. the unpublished "Test Reaction Blueprint" (45732, 20 Tungsten Carbide
  // per run) must never beat the published "Tungsten Carbide Reaction Formula"
  // (46207, 10000/run) — picking the former inflates every downstream reaction
  // ~500x. This mirrors the game client, which hides unpublished blueprints.
  // Fallback-safe: a product whose only producer is unpublished still registers
  // (it is the first — and only — row seen). `published` absent/null counts as
  // published, so synthetic test rows and any blueprint type missing from
  // eve_types stay selectable. The tie-break also removes the latent
  // non-determinism of the unordered source query.
  const ordered = [...rows].sort((a, b) => {
    const au = a.published === false ? 1 : 0;
    const bu = b.published === false ? 1 : 0;
    return au - bu || a.blueprintTypeId - b.blueprintTypeId;
  });

  for (const { blueprintTypeId, activities } of ordered) {
    const { mats, prods } = activitiesToRows(blueprintTypeId, activities);
    const ownProducts = new Set(prods.map((p) => p.productTypeId));
    const realMaterials = mats
      .filter((m) => !ownProducts.has(m.materialTypeId)) // correction 1
      .map((m) => ({ typeId: m.materialTypeId, quantity: m.quantity }));
    if (realMaterials.length > 0) {
      blueprintMaterials.set(blueprintTypeId, realMaterials);
    }
    // correction 2: had materials, none survived — don't register as a producer
    const degenerate = mats.length > 0 && realMaterials.length === 0;
    if (degenerate) continue;
    for (const p of prods) {
      if (productToBlueprint.has(p.productTypeId)) continue; // first writer wins
      productToBlueprint.set(p.productTypeId, {
        blueprintTypeId,
        quantityPerRun: p.quantity,
      });
    }
  }

  return { blueprintMaterials, productToBlueprint };
}

async function buildIndexes(db: AnyPgDb): Promise<Indexes> {
  // Join eve_types for each blueprint's published flag so producer selection can
  // prefer the real in-game blueprint over unpublished test/dev artifacts. The
  // authoritative ordering happens in memory in buildIndexesFromActivities — no
  // DB ORDER BY, whose DESC NULLS FIRST wouldn't match the in-memory null
  // handling anyway. leftJoin: keep a blueprint even if its type row is somehow
  // absent (published → null → treated as selectable).
  const rows = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
      published: eveTypes.published,
    })
    .from(industryBlueprints)
    .leftJoin(eveTypes, eq(industryBlueprints.blueprintTypeId, eveTypes.id));
  return buildIndexesFromActivities(
    rows as {
      blueprintTypeId: number;
      activities: BlueprintActivities;
      published: boolean | null;
    }[],
  );
}

// How many runs of a producing blueprint a parent's need represents, as a
// FRACTION — `quantity / quantityPerRun`, deliberately NOT rounded up. This
// keeps the resolver's stored tree + flat materials a MARGINAL structural
// artifact: each intermediate is charged only the fraction of a batch a single
// build consumes. That output is pinned by `pnpm validate:resolver`.
//
// This is NOT the planner's displayed cost basis. The planner re-derives
// whole-run "batched" totals at request time from these same per-run quantities
// (runs = ceil(demand ÷ batch yield)) in the feature layer — industry-planner's
// build-batch.ts — which is what a builder actually buys from an empty hangar.
// That aggregate-then-ceil is distinct from the old PER-EDGE `ceilDiv` removed
// here: per-edge rounding ceil'd every occurrence independently and compounded
// (~30× on deep T3/capital trees — one Fullerene Intercalated Sheets needs 33
// Fulleroferrocene against a 1000/run reaction); summing all demand for a type
// before a single ceil does not.
function runsFor(quantity: number, quantityPerRun: number): number {
  if (quantityPerRun === 0) throw new Error('runsFor: quantityPerRun is zero');
  return quantity / quantityPerRun;
}

// Walks one blueprint's tree, producing both the JSONB tree shape and
// the flat materials accumulator. Memoized per blueprintId for the flat
// totals — the per-run flat materials are stable across parents, and
// capital recursion is what makes memoization worth the bytes.
export class TreeResolver {
  // Raw-material totals are FRACTIONAL during the walk (a parent consumes a
  // fraction of a producing run — see `runsFor`), so they accumulate as numbers,
  // not bigints. The caller rounds to whole units at the storage boundary. Real
  // totals (a capital's millions of minerals) stay far under 2^53, so float
  // accumulation is exact enough; rounding happens once, at the end.
  private flatMemo = new Map<number, Map<number, number>>();
  private cycleWarnings: string[] = [];
  private memoHits = 0;
  private memoMisses = 0;

  constructor(private indexes: Indexes) {}

  flatForOneRun(blueprintId: number): Map<number, number> {
    return this.walkFlat(blueprintId, new Set());
  }

  private walkFlat(blueprintId: number, visited: Set<number>): Map<number, number> {
    const memoed = this.flatMemo.get(blueprintId);
    if (memoed) {
      this.memoHits++;
      return memoed;
    }
    this.memoMisses++;

    if (visited.has(blueprintId)) {
      this.cycleWarnings.push(
        `cycle at blueprint ${blueprintId}; path [${[...visited].join(' -> ')}]`,
      );
      return new Map();
    }
    visited.add(blueprintId);

    const result = new Map<number, number>();
    const materials = this.indexes.blueprintMaterials.get(blueprintId);
    if (!materials) {
      this.flatMemo.set(blueprintId, result);
      visited.delete(blueprintId);
      return result;
    }

    for (const mat of materials) {
      const child = this.indexes.productToBlueprint.get(mat.typeId);
      if (!child) {
        const cur = result.get(mat.typeId) ?? 0;
        result.set(mat.typeId, cur + mat.quantity);
        continue;
      }
      // childPerRun is the raws for ONE run of the producing blueprint
      // (memoized, stable across parents). The parent only needs `mat.quantity`
      // of the child's `quantityPerRun`-per-run output, so it bears that
      // fraction of the run's raws — not a whole rounded-up run.
      const runs = runsFor(mat.quantity, child.quantityPerRun);
      const childPerRun = this.walkFlat(child.blueprintTypeId, visited);
      for (const [k, v] of childPerRun) {
        result.set(k, (result.get(k) ?? 0) + v * runs);
      }
    }

    this.flatMemo.set(blueprintId, result);
    visited.delete(blueprintId);
    return result;
  }

  // Builds the nested-tree JSON for one blueprint. Walks fresh per
  // blueprint (no memo for the tree shape — it'd be redundant since
  // the JSON is written once per top-level blueprint, not per parent
  // path). Cycle-guarded the same way as walkFlat.
  treeForOneRun(blueprintId: number): TreeNode[] {
    return this.walkTree(blueprintId, new Set());
  }

  private walkTree(blueprintId: number, visited: Set<number>): TreeNode[] {
    if (visited.has(blueprintId)) return [];
    visited.add(blueprintId);
    const materials = this.indexes.blueprintMaterials.get(blueprintId) ?? [];
    const nodes: TreeNode[] = [];
    for (const mat of materials) {
      const child = this.indexes.productToBlueprint.get(mat.typeId);
      if (!child) {
        nodes.push({ typeId: mat.typeId, quantity: mat.quantity, inputs: [] });
        continue;
      }
      // Share the fractional `runsFor` helper with walkFlat so the two
      // walkers can never disagree on runs-needed — the displayed tree's
      // marginal runs match the flat-material cost basis by construction.
      const runsNeeded = runsFor(mat.quantity, child.quantityPerRun);
      nodes.push({
        typeId: mat.typeId,
        quantity: mat.quantity,
        inputs: this.walkTree(child.blueprintTypeId, visited),
        producedBy: {
          blueprintTypeId: child.blueprintTypeId,
          quantityPerRun: child.quantityPerRun,
          runsNeeded,
        },
      });
    }
    visited.delete(blueprintId);
    return nodes;
  }

  stats() {
    return {
      memoHits: this.memoHits,
      memoMisses: this.memoMisses,
      cycleWarnings: [...this.cycleWarnings],
    };
  }
}

// Content hash of the blueprint recipe data, the resolver's idempotency gate.
// Sensitive to recipe edits in the reference blueprints (so a CCP nudge to
// Rifter's Tritanium — or a yield change — flips the hash) by sampling their
// manufacturing + reaction recipes fully, PLUS global edge counts so a blueprint
// added/removed or re-recipe'd anywhere triggers a rebuild — without
// canonicalising all ~5k blueprints' JSON on every check. Also folds in every
// blueprint's published flag, since producer selection now prefers published
// blueprints — so a CCP publish/unpublish flip with no recipe change still
// invalidates the trees on the cron re-resolve path. Stored under
// SDE_META_KEY_TREE_HASH; the resolver short-circuits when the stored value
// matches (and trees are still present — see resolveAllTrees).
export async function computeTreeResolverHash(db: AnyPgDb): Promise<string> {
  const all = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
      published: eveTypes.published,
    })
    .from(industryBlueprints)
    .leftJoin(eveTypes, eq(industryBlueprints.blueprintTypeId, eveTypes.id));

  const refSet = new Set<number>(REFERENCE_BLUEPRINT_TYPE_IDS);
  let blueprintCount = 0;
  let matEdges = 0;
  let prodEdges = 0;
  const refSamples: string[] = [];
  const publishedSamples: string[] = [];

  for (const r of all) {
    blueprintCount++;
    // Fold each blueprint's published flag into the hash: producer selection
    // depends on it, so a CCP publish/unpublish flip with no recipe edit must
    // still invalidate the trees. null/undefined counts as published, matching
    // the resolver's selection fallback.
    publishedSamples.push(`${r.blueprintTypeId}:${r.published === false ? 0 : 1}`);
    const activities = (r.activities ?? {}) as BlueprintActivities;
    // Global edge counts across every activity key — matches the old row-count
    // sensitivity to any recipe edge appearing/disappearing.
    for (const key of Object.keys(activities)) {
      const act = activities[key];
      matEdges += act?.materials?.length ?? 0;
      prodEdges += act?.products?.length ?? 0;
    }
    if (!refSet.has(r.blueprintTypeId)) continue;
    // Full deterministic sample of the resolver-relevant (manufacturing +
    // reaction) recipe for each reference blueprint.
    const { mats, prods } = activitiesToRows(r.blueprintTypeId, activities);
    for (const m of mats) {
      refSamples.push(`${m.blueprintTypeId}:m:${m.materialTypeId}:${m.quantity}`);
    }
    for (const p of prods) {
      refSamples.push(`${p.blueprintTypeId}:p:${p.productTypeId}:${p.quantity}`);
    }
  }
  // Deterministic ordering JS-side so the hash is stable across runs.
  refSamples.sort();
  publishedSamples.sort();

  return createHash('sha256')
    .update(TREE_RESOLVER_ALGO_VERSION)
    .update(':')
    .update(`${blueprintCount}:${matEdges}:${prodEdges}`)
    .update(':')
    .update(refSamples.join(','))
    .update(':')
    .update(publishedSamples.join(','))
    .digest('hex');
}

// True when blueprint_trees holds at least one row. runIngest truncates the
// derived tables before the deploy/cron pipeline reaches the resolver, so the
// hash gate alone is not enough to decide a skip is safe — see resolveAllTrees.
async function hasResolvedTrees(db: AnyPgDb): Promise<boolean> {
  const [{ exists }] = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM ${blueprintTrees}) AS exists`,
  );
  return exists;
}

// Top-level entry: rebuilds blueprint_trees + blueprint_flat_materials
// for every row in industry_blueprints. Idempotent — short-circuits
// when the stored tree-resolver hash matches the current SDE shape.
// Set LGI_FORCE_TREE_REBUILD=1 to override (for when the resolver's
// own code changes).
export async function resolveAllTrees(db: AnyPgDb): Promise<ResolveSummary> {
  const start = Date.now();
  const forceRebuild = readEnv('LGI_FORCE_TREE_REBUILD') === '1';

  const hashBefore = await getSdeMetaValue(db, SDE_META_KEY_TREE_HASH);
  const hashAfter = await computeTreeResolverHash(db);
  // Only honour the skip when the resolved trees are actually still present.
  // runIngest TRUNCATEs blueprint_trees/blueprint_flat_materials, so on a
  // re-ingest whose sample-blueprint hash is unchanged (e.g. an SDE
  // version-marker change with no recipe change) the hash would match while
  // the tables sit empty — skipping then would leave them empty until the next
  // forced rebuild. Re-checking presence keeps the no-op deploy path (no
  // re-ingest, trees intact) fast while never persisting an empty result.
  if (
    !forceRebuild &&
    hashBefore !== null &&
    hashBefore === hashAfter &&
    (await hasResolvedTrees(db))
  ) {
    return {
      blueprintsResolved: 0,
      flatMaterialsWritten: 0,
      treesWritten: 0,
      memoHits: 0,
      memoMisses: 0,
      cycleWarnings: [],
      hashBefore,
      hashAfter,
      skipped: true,
      durationMs: Date.now() - start,
    };
  }

  const indexes = await buildIndexes(db);
  const resolver = new TreeResolver(indexes);

  const allBlueprintIds = await db
    .select({ id: industryBlueprints.blueprintTypeId })
    .from(industryBlueprints);

  const FLAT_BATCH_SIZE = 1000;
  const TREE_BATCH_SIZE = 500;
  const computedAt = new Date();
  let flatWritten = 0;
  let treeWritten = 0;

  // TRUNCATE + writes + hash update all live in one transaction so a
  // mid-flight timeout (Vercel function killed at 300s, transient DB
  // error, etc.) rolls back to the pre-resolve state instead of
  // leaving the tables empty for up to a day until the next daily
  // cron retries. Recovery becomes automatic: the hash isn't written
  // unless every batch committed, so the next invocation will see a
  // hash mismatch and re-run.
  await db.transaction(async (tx) => {
    // Wipe + rewrite trees + flat materials. Cascade FKs handle the
    // ordering; everything that references industry_blueprints was
    // already truncated by runIngest if this is the deploy-time path.
    // On the cron-triggered re-resolve path (no full SDE re-ingest)
    // we still want a clean slate.
    await tx.execute(
      sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}`,
    );

    let flatBatch: Array<{
      blueprintTypeId: number;
      rawMaterialTypeId: number;
      totalQuantity: bigint;
    }> = [];
    let treeBatch: Array<{
      blueprintTypeId: number;
      treeJson: unknown;
      computedAt: Date;
    }> = [];

    for (const { id } of allBlueprintIds) {
      const flat = resolver.flatForOneRun(id);
      for (const [rawType, qty] of flat) {
        // Fractional totals are rounded to whole units once here, at the
        // storage boundary (the column is bigint). A material whose marginal
        // share rounds to zero contributes nothing and is dropped.
        const rounded = Math.round(qty);
        if (rounded <= 0) continue;
        flatBatch.push({
          blueprintTypeId: id,
          rawMaterialTypeId: rawType,
          totalQuantity: BigInt(rounded),
        });
        if (flatBatch.length >= FLAT_BATCH_SIZE) {
          await tx.insert(blueprintFlatMaterials).values(flatBatch);
          flatWritten += flatBatch.length;
          flatBatch = [];
        }
      }

      const tree = resolver.treeForOneRun(id);
      treeBatch.push({
        blueprintTypeId: id,
        treeJson: tree,
        computedAt,
      });
      if (treeBatch.length >= TREE_BATCH_SIZE) {
        await tx.insert(blueprintTrees).values(treeBatch);
        treeWritten += treeBatch.length;
        treeBatch = [];
      }
    }

    if (flatBatch.length > 0) {
      await tx.insert(blueprintFlatMaterials).values(flatBatch);
      flatWritten += flatBatch.length;
    }
    if (treeBatch.length > 0) {
      await tx.insert(blueprintTrees).values(treeBatch);
      treeWritten += treeBatch.length;
    }

    // EVE manufacturing is a strict DAG, and buildIndexesFromActivities drops
    // the known degenerate self-recipes. Any remaining cycle is a novel
    // SDE shape the filter doesn't cover — fail loudly (rolling back the
    // TRUNCATE + writes) rather than silently persisting empty flat
    // materials for the offending blueprints.
    const { cycleWarnings } = resolver.stats();
    if (cycleWarnings.length > 0) {
      throw new Error(
        `tree resolver detected ${cycleWarnings.length} unexpected cycle(s); ` +
          `first few: ${cycleWarnings.slice(0, 5).join(' | ')}`,
      );
    }

    await setSdeMetaValue(tx, SDE_META_KEY_TREE_HASH, hashAfter);
  });

  const stats = resolver.stats();
  return {
    blueprintsResolved: allBlueprintIds.length,
    flatMaterialsWritten: flatWritten,
    treesWritten: treeWritten,
    memoHits: stats.memoHits,
    memoMisses: stats.memoMisses,
    cycleWarnings: stats.cycleWarnings,
    hashBefore,
    hashAfter,
    skipped: false,
    durationMs: Date.now() - start,
  };
}

