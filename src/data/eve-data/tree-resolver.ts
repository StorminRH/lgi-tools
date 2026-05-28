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
  // type and how many it yields per run.
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

  const blueprintMaterials = new Map<number, Material[]>();
  for (const r of matRows) {
    const list = blueprintMaterials.get(r.blueprintTypeId);
    const entry: Material = { typeId: r.materialTypeId, quantity: r.quantity };
    if (list) list.push(entry);
    else blueprintMaterials.set(r.blueprintTypeId, [entry]);
  }

  const productToBlueprint = new Map<
    number,
    { blueprintTypeId: number; quantityPerRun: number }
  >();
  for (const r of prodRows) {
    if (productToBlueprint.has(r.productTypeId)) continue; // first writer wins
    productToBlueprint.set(r.productTypeId, {
      blueprintTypeId: r.blueprintTypeId,
      quantityPerRun: r.quantity,
    });
  }

  return { blueprintMaterials, productToBlueprint };
}

function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === BigInt(0)) throw new Error('ceilDiv: divisor is zero');
  return (a + b - BigInt(1)) / b;
}

// Walks one blueprint's tree, producing both the JSONB tree shape and
// the flat materials accumulator. Memoized per blueprintId for the flat
// totals — the per-run flat materials are stable across parents, and
// capital recursion is what makes memoization worth the bytes.
export class TreeResolver {
  private flatMemo = new Map<number, Map<number, bigint>>();
  private cycleWarnings: string[] = [];
  private memoHits = 0;
  private memoMisses = 0;

  constructor(private indexes: Indexes) {}

  flatForOneRun(blueprintId: number): Map<number, bigint> {
    return this.walkFlat(blueprintId, new Set());
  }

  private walkFlat(blueprintId: number, visited: Set<number>): Map<number, bigint> {
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

    const result = new Map<number, bigint>();
    const materials = this.indexes.blueprintMaterials.get(blueprintId);
    if (!materials) {
      this.flatMemo.set(blueprintId, result);
      visited.delete(blueprintId);
      return result;
    }

    for (const mat of materials) {
      const child = this.indexes.productToBlueprint.get(mat.typeId);
      if (!child) {
        const cur = result.get(mat.typeId) ?? BigInt(0);
        result.set(mat.typeId, cur + BigInt(mat.quantity));
        continue;
      }
      const runsNeeded = ceilDiv(
        BigInt(mat.quantity),
        BigInt(child.quantityPerRun),
      );
      const childPerRun = this.walkFlat(child.blueprintTypeId, visited);
      for (const [k, v] of childPerRun) {
        result.set(k, (result.get(k) ?? BigInt(0)) + v * runsNeeded);
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
      const runsNeeded = Math.ceil(mat.quantity / child.quantityPerRun);
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
// every check. Stored under SDE_META_KEY_TREE_HASH; the resolver
// short-circuits when the stored value matches.
export async function computeTreeResolverHash(db: AnyPgDb): Promise<string> {
  const refRows = await db
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
  refRows.sort(
    (a, b) =>
      a.blueprintTypeId - b.blueprintTypeId ||
      a.activityId - b.activityId ||
      a.materialTypeId - b.materialTypeId,
  );
  const samples = refRows
    .map((r) => `${r.blueprintTypeId}:${r.activityId}:${r.materialTypeId}:${r.quantity}`)
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
    .update(samples)
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

  // Wipe + rewrite trees + flat materials. Cascade FKs handle the
  // ordering; everything that references industry_blueprints was
  // already truncated by runIngest if this is the deploy-time path.
  // On the cron-triggered re-resolve path (no full SDE re-ingest)
  // we still want a clean slate.
  await db.execute(
    sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}`,
  );

  const FLAT_BATCH_SIZE = 1000;
  const TREE_BATCH_SIZE = 500;
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
  let flatWritten = 0;
  let treeWritten = 0;
  const computedAt = new Date();

  for (const { id } of allBlueprintIds) {
    const flat = resolver.flatForOneRun(id);
    for (const [rawType, qty] of flat) {
      flatBatch.push({
        blueprintTypeId: id,
        rawMaterialTypeId: rawType,
        totalQuantity: qty,
      });
      if (flatBatch.length >= FLAT_BATCH_SIZE) {
        await db.insert(blueprintFlatMaterials).values(flatBatch);
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
      await db.insert(blueprintTrees).values(treeBatch);
      treeWritten += treeBatch.length;
      treeBatch = [];
    }
  }

  if (flatBatch.length > 0) {
    await db.insert(blueprintFlatMaterials).values(flatBatch);
    flatWritten += flatBatch.length;
  }
  if (treeBatch.length > 0) {
    await db.insert(blueprintTrees).values(treeBatch);
    treeWritten += treeBatch.length;
  }

  await writeMeta(db, SDE_META_KEY_TREE_HASH, hashAfter);

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

