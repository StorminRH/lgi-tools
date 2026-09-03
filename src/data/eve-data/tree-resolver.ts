import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
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

export type TreeNode = {
  typeId: number;
  quantity: number;
  inputs: TreeNode[];
  producedBy?: { blueprintTypeId: number; quantityPerRun: number; runsNeeded: number };
};

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
  blueprintMaterials: Map<number, Material[]>;
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

export type ActivityIO = {
  materials?: { typeID: number; quantity: number }[];
  products?: { typeID: number; quantity: number }[];
  time?: number;
};
export type BlueprintActivities = Record<string, ActivityIO | undefined>;

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

export function pickBuildTimeSeconds(activities: BlueprintActivities): number | null {
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const time = activities?.[name]?.time;
    if (typeof time === 'number' && time > 0) return time;
  }
  return null;
}

/**
 * Builds the resolver indexes directly from CCP's per-blueprint `activities`,
 * correcting for a degenerate shape in the SDE: ~51 deprecated, non-manufacturable
 * items (old POS assembly arrays, silos, reactor arrays, outpost platforms,
 * orbital ammo, a couple of hulls) ship a "1 of X makes 1 of X" recipe whose sole
 * material is the product itself. EVE manufacturing is a strict DAG, so these are
 * non-recipes, not real cycles.
 *
 * Two corrections, both keyed on the same self-referential shape:
 *   1. Drop the self-referential material edge so the walker never reads it as a
 *      self-loop. A blueprint's own products sit right beside its materials, so
 *      this is a local check per blueprint.
 *   2. A blueprint whose entire material list was self-referential can't actually
 *      produce anything, so it is not registered as a producer. Its product then
 *      resolves as a leaf (raw input) wherever consumed, instead of routing into
 *      an empty blueprint and silently contributing nothing. Today none of these
 *      products are consumed elsewhere, but this keeps us correct if a future SDE
 *      starts consuming one of these deprecated types.
 */
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

  const ordered = [...rows].sort((a, b) => {
    const au = a.published === false ? 1 : 0;
    const bu = b.published === false ? 1 : 0;
    return au - bu || a.blueprintTypeId - b.blueprintTypeId;
  });

  for (const { blueprintTypeId, activities } of ordered) {
    const { mats, prods } = activitiesToRows(blueprintTypeId, activities);
    const ownProducts = new Set(prods.map((p) => p.productTypeId));
    const realMaterials = mats
      .filter((m) => !ownProducts.has(m.materialTypeId))
      .map((m) => ({ typeId: m.materialTypeId, quantity: m.quantity }));
    if (realMaterials.length > 0) {
      blueprintMaterials.set(blueprintTypeId, realMaterials);
    }
    const degenerate = mats.length > 0 && realMaterials.length === 0;
    if (degenerate) continue;
    for (const p of prods) {
      if (productToBlueprint.has(p.productTypeId)) continue;
      productToBlueprint.set(p.productTypeId, {
        blueprintTypeId,
        quantityPerRun: p.quantity,
      });
    }
  }

  return { blueprintMaterials, productToBlueprint };
}

async function buildIndexes(db: AnyPgDb): Promise<Indexes> {
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

function runsFor(quantity: number, quantityPerRun: number): number {
  if (quantityPerRun === 0) throw new Error('runsFor: quantityPerRun is zero');
  return quantity / quantityPerRun;
}

export class TreeResolver {
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

export function hashResolverInputs(
  rows: ReadonlyArray<{
    blueprintTypeId: number;
    activities: unknown;
    published: boolean | null;
  }>,
): string {
  const refSet = new Set<number>(REFERENCE_BLUEPRINT_TYPE_IDS);
  let blueprintCount = 0;
  let matEdges = 0;
  let prodEdges = 0;
  const refSamples: string[] = [];
  const publishedSamples: string[] = [];

  for (const r of rows) {
    blueprintCount++;
    publishedSamples.push(`${r.blueprintTypeId}:${r.published === false ? 0 : 1}`);
    const activities = (r.activities ?? {}) as BlueprintActivities;
    for (const key of Object.keys(activities)) {
      const act = activities[key];
      matEdges += act?.materials?.length ?? 0;
      prodEdges += act?.products?.length ?? 0;
    }
    if (!refSet.has(r.blueprintTypeId)) continue;
    const { mats, prods } = activitiesToRows(r.blueprintTypeId, activities);
    for (const m of mats) {
      refSamples.push(`${m.blueprintTypeId}:m:${m.materialTypeId}:${m.quantity}`);
    }
    for (const p of prods) {
      refSamples.push(`${p.blueprintTypeId}:p:${p.productTypeId}:${p.quantity}`);
    }
  }
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

async function computeTreeResolverHash(db: AnyPgDb): Promise<string> {
  const all = await db
    .select({
      blueprintTypeId: industryBlueprints.blueprintTypeId,
      activities: industryBlueprints.activities,
      published: eveTypes.published,
    })
    .from(industryBlueprints)
    .leftJoin(eveTypes, eq(industryBlueprints.blueprintTypeId, eveTypes.id));
  return hashResolverInputs(all);
}

async function hasResolvedTrees(db: AnyPgDb): Promise<boolean> {
  const [{ exists }] = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM ${blueprintTrees}) AS exists`,
  );
  return exists;
}

export type FlatMaterialRow = {
  blueprintTypeId: number;
  rawMaterialTypeId: number;
  totalQuantity: bigint;
};

export function roundedFlatRows(
  flat: Iterable<[number, number]>,
  blueprintTypeId: number,
): FlatMaterialRow[] {
  const out: FlatMaterialRow[] = [];
  for (const [rawType, qty] of flat) {
    const rounded = Math.round(qty);
    if (rounded <= 0) continue;
    out.push({ blueprintTypeId, rawMaterialTypeId: rawType, totalQuantity: BigInt(rounded) });
  }
  return out;
}

export function hashGateSkips(args: {
  forceRebuild: boolean;
  hashBefore: string | null;
  hashAfter: string;
}): boolean {
  return !args.forceRebuild && args.hashBefore !== null && args.hashBefore === args.hashAfter;
}

export function assertNoResolverCycles(stats: { cycleWarnings: string[] }): void {
  if (stats.cycleWarnings.length > 0) {
    throw new Error(
      `tree resolver detected ${stats.cycleWarnings.length} unexpected cycle(s); ` +
        `first few: ${stats.cycleWarnings.slice(0, 5).join(' | ')}`,
    );
  }
}

export function makeBatchInserter<T>(
  batchSize: number,
  sink: (batch: T[]) => Promise<void>,
) {
  let buffer: T[] = [];
  let written = 0;
  return {
    async add(rows: readonly T[]): Promise<void> {
      for (const row of rows) {
        buffer.push(row);
        if (buffer.length >= batchSize) {
          await sink(buffer);
          written += buffer.length;
          buffer = [];
        }
      }
    },
    async flush(): Promise<void> {
      if (buffer.length > 0) {
        await sink(buffer);
        written += buffer.length;
        buffer = [];
      }
    },
    written(): number {
      return written;
    },
  };
}

export async function resolveAllTrees(db: PostgresJsDb): Promise<ResolveSummary> {
  const start = Date.now();
  const forceRebuild = readEnv('LGI_FORCE_TREE_REBUILD') === '1';

  const hashBefore = await getSdeMetaValue(db, SDE_META_KEY_TREE_HASH);
  const hashAfter = await computeTreeResolverHash(db);
  if (hashGateSkips({ forceRebuild, hashBefore, hashAfter }) && (await hasResolvedTrees(db))) {
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

  const { flatWritten, treeWritten } = await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}`,
    );

    const flat = makeBatchInserter<FlatMaterialRow>(FLAT_BATCH_SIZE, async (batch) => {
      await tx.insert(blueprintFlatMaterials).values(batch);
    });
    const tree = makeBatchInserter<{ blueprintTypeId: number; treeJson: TreeNode[]; computedAt: Date }>(
      TREE_BATCH_SIZE,
      async (batch) => {
        await tx.insert(blueprintTrees).values(batch);
      },
    );

    for (const { id } of allBlueprintIds) {
      await flat.add(roundedFlatRows(resolver.flatForOneRun(id), id));
      await tree.add([{ blueprintTypeId: id, treeJson: resolver.treeForOneRun(id), computedAt }]);
    }
    await flat.flush();
    await tree.flush();

    assertNoResolverCycles(resolver.stats());
    await setSdeMetaValue(tx, SDE_META_KEY_TREE_HASH, hashAfter);
    return { flatWritten: flat.written(), treeWritten: tree.written() };
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
