import { createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  INDUSTRY_ACTIVITY_IDS,
  REFERENCE_BLUEPRINT_TYPE_IDS,
  SDE_META_KEY_TREE_HASH,
} from './constants';
import {
  blueprintFlatMaterials,
  blueprintTrees,
  eveDataMeta,
  industryActivityMaterials,
  industryActivityProducts,
  industryBlueprints,
} from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PostgresJsDatabase<any>;

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

// Builds the resolver indexes from raw material/product rows, correcting
// for a degenerate shape in the SDE: ~51 deprecated, non-manufacturable
// items (old POS assembly arrays, silos, reactor arrays, outpost
// platforms, orbital ammo, a couple of hulls) ship a "1 of X makes 1 of
// X" recipe whose sole material is the product itself. EVE manufacturing
// is a strict DAG, so these are non-recipes, not real cycles.
//
// Two corrections, both keyed on the same self-referential shape:
//   1. Drop the self-referential material edge so the walker never reads
//      it as a self-loop.
//   2. A blueprint whose entire material list was self-referential can't
//      actually produce anything, so it is not registered as a producer.
//      Its product then resolves as a leaf (raw input) wherever consumed,
//      instead of routing into an empty blueprint and silently
//      contributing nothing. Today none of these products are consumed
//      elsewhere, but this keeps us correct if a future SDE starts
//      consuming one of these deprecated types.
export function buildIndexesFromRows(
  matRows: MaterialRow[],
  prodRows: ProductRow[],
): Indexes {
  // What each blueprint produces — drives both the self-edge filter and
  // the degenerate-producer demotion below.
  const blueprintProducts = new Map<number, Set<number>>();
  for (const r of prodRows) {
    const products = blueprintProducts.get(r.blueprintTypeId);
    if (products) products.add(r.productTypeId);
    else blueprintProducts.set(r.blueprintTypeId, new Set([r.productTypeId]));
  }

  // Direct materials, self-referential edges dropped. Track which
  // blueprints had any material row so we can tell a genuine "no recipe"
  // blueprint apart from one whose entire recipe was self-referential.
  const blueprintMaterials = new Map<number, Material[]>();
  const hadMaterialRow = new Set<number>();
  for (const r of matRows) {
    hadMaterialRow.add(r.blueprintTypeId);
    if (blueprintProducts.get(r.blueprintTypeId)?.has(r.materialTypeId)) {
      continue; // self-referential edge — see fn comment
    }
    const list = blueprintMaterials.get(r.blueprintTypeId);
    const entry: Material = { typeId: r.materialTypeId, quantity: r.quantity };
    if (list) list.push(entry);
    else blueprintMaterials.set(r.blueprintTypeId, [entry]);
  }

  // outputType -> producer. Skip blueprints whose entire material list was
  // self-referential (had rows, none survived) — see correction 2 above.
  const productToBlueprint = new Map<
    number,
    { blueprintTypeId: number; quantityPerRun: number }
  >();
  for (const r of prodRows) {
    const degenerate =
      hadMaterialRow.has(r.blueprintTypeId) &&
      !blueprintMaterials.has(r.blueprintTypeId);
    if (degenerate) continue;
    if (productToBlueprint.has(r.productTypeId)) continue; // first writer wins
    productToBlueprint.set(r.productTypeId, {
      blueprintTypeId: r.blueprintTypeId,
      quantityPerRun: r.quantity,
    });
  }

  return { blueprintMaterials, productToBlueprint };
}

async function buildIndexes(db: AnyPgDb): Promise<Indexes> {
  const activityIds = [...INDUSTRY_ACTIVITY_IDS];

  const matRows = await db
    .select({
      blueprintTypeId: industryActivityMaterials.blueprintTypeId,
      materialTypeId: industryActivityMaterials.materialTypeId,
      quantity: industryActivityMaterials.quantity,
    })
    .from(industryActivityMaterials)
    .where(inArray(industryActivityMaterials.activityId, activityIds));

  const prodRows = await db
    .select({
      blueprintTypeId: industryActivityProducts.blueprintTypeId,
      productTypeId: industryActivityProducts.productTypeId,
      quantity: industryActivityProducts.quantity,
    })
    .from(industryActivityProducts)
    .where(inArray(industryActivityProducts.activityId, activityIds));

  return buildIndexesFromRows(matRows, prodRows);
}

// How many runs of a producing blueprint a parent's need represents, as a
// FRACTION — `quantity / quantityPerRun`. We deliberately do NOT round up to
// whole runs: a build is charged only the fraction of a batch it actually
// consumes, with the remainder treated as reusable inventory. Whole-run
// rounding (the old `ceilDiv`) massively overstated deep builds where an
// intermediate is produced in large batches — e.g. one Fullerene Intercalated
// Sheets needs 33 Fulleroferrocene but the reaction makes 1000/run, so rounding
// up pulled a full 1000-unit batch's raw gas to satisfy 33 (~30× overbuild),
// which compounded across a T3/capital tree. Marginal (fractional) runs are the
// standard basis for a build-cost estimate.
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

// Content hash of the industry tables. Sensitive to row-level edits
// in the reference blueprints (so a CCP nudge to Rifter's Tritanium
// flips the hash) without scanning the full ~50k material rows on
// every check. Both sides — materials AND products — of the reference
// blueprints are sampled so a CCP edit to product-quantity (e.g.
// Rifter starts yielding 2 ships per run) flips the hash. Stored
// under SDE_META_KEY_TREE_HASH; the resolver short-circuits when the
// stored value matches.
export async function computeTreeResolverHash(db: AnyPgDb): Promise<string> {
  const refMatRows = await db
    .select({
      blueprintTypeId: industryActivityMaterials.blueprintTypeId,
      activityId: industryActivityMaterials.activityId,
      materialTypeId: industryActivityMaterials.materialTypeId,
      quantity: industryActivityMaterials.quantity,
    })
    .from(industryActivityMaterials)
    .where(
      inArray(
        industryActivityMaterials.blueprintTypeId,
        [...REFERENCE_BLUEPRINT_TYPE_IDS],
      ),
    );
  // Deterministic ordering JS-side so the hash is stable across
  // postgres versions without relying on ORDER BY in the SQL.
  refMatRows.sort(
    (a, b) =>
      a.blueprintTypeId - b.blueprintTypeId ||
      a.activityId - b.activityId ||
      a.materialTypeId - b.materialTypeId,
  );
  const matSamples = refMatRows
    .map((r) => `${r.blueprintTypeId}:${r.activityId}:${r.materialTypeId}:${r.quantity}`)
    .join(',');

  const refProdRows = await db
    .select({
      blueprintTypeId: industryActivityProducts.blueprintTypeId,
      activityId: industryActivityProducts.activityId,
      productTypeId: industryActivityProducts.productTypeId,
      quantity: industryActivityProducts.quantity,
    })
    .from(industryActivityProducts)
    .where(
      inArray(
        industryActivityProducts.blueprintTypeId,
        [...REFERENCE_BLUEPRINT_TYPE_IDS],
      ),
    );
  refProdRows.sort(
    (a, b) =>
      a.blueprintTypeId - b.blueprintTypeId ||
      a.activityId - b.activityId ||
      a.productTypeId - b.productTypeId,
  );
  const prodSamples = refProdRows
    .map((r) => `${r.blueprintTypeId}:${r.activityId}:${r.productTypeId}:${r.quantity}`)
    .join(',');

  const [{ counts }] = await db.execute<{ counts: string }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM industry_blueprints) || ':' ||
      (SELECT COUNT(*)::text FROM industry_activity_materials) || ':' ||
      (SELECT COUNT(*)::text FROM industry_activity_products) AS counts
  `);
  return createHash('sha256')
    .update(counts)
    .update(':')
    .update(matSamples)
    .update(':')
    .update(prodSamples)
    .digest('hex');
}

async function readMeta(db: AnyPgDb, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: eveDataMeta.value })
    .from(eveDataMeta)
    .where(eq(eveDataMeta.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function writeMeta(db: AnyPgDb, key: string, value: string): Promise<void> {
  await db
    .insert(eveDataMeta)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eveDataMeta.key,
      set: { value, updatedAt: new Date() },
    });
}

// Top-level entry: rebuilds blueprint_trees + blueprint_flat_materials
// for every row in industry_blueprints. Idempotent — short-circuits
// when the stored tree-resolver hash matches the current SDE shape.
// Set LGI_FORCE_TREE_REBUILD=1 to override (for when the resolver's
// own code changes).
export async function resolveAllTrees(db: AnyPgDb): Promise<ResolveSummary> {
  const start = Date.now();
  const forceRebuild = process.env.LGI_FORCE_TREE_REBUILD === '1';

  const hashBefore = await readMeta(db, SDE_META_KEY_TREE_HASH);
  const hashAfter = await computeTreeResolverHash(db);
  if (!forceRebuild && hashBefore !== null && hashBefore === hashAfter) {
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
  // leaving the tables empty for up to a week until the next Monday
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

    // EVE manufacturing is a strict DAG, and buildIndexesFromRows drops
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

    await writeMeta(tx, SDE_META_KEY_TREE_HASH, hashAfter);
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

