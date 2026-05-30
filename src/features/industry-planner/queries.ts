import { and, eq, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/db';
import { eveTypes, industryActivityProducts } from '@/db/schema';
import { BLUEPRINT_STRUCTURE_TAG, INDUSTRY_ACTIVITY_IDS } from '@/data/eve-data/constants';
import {
  getBlueprintTree,
  getFlatMaterials,
  getTypesByIds,
} from '@/data/eve-data/queries';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { PRICES_FRESHNESS_TAG } from '@/data/market-prices/cache';
import { getPrices } from '@/data/market-prices/queries';
import { assemblePricing, type PriceLite } from './build-pricing';
import type {
  BlueprintIndexEntry,
  BlueprintPricing,
  BlueprintStructure,
} from './types';

// The industry-planner feature is the composition layer that sits ABOVE the
// eve-data, market-prices, and industry-math data slices — the one place
// allowed to join them (feature → data is permitted; data ⊥ data is not). The
// pure margin math lives in industry-math; everything here is glue + caching.

const ACTIVITY_IDS = Array.from(INDUSTRY_ACTIVITY_IDS);

function uniq(ids: number[]): number[] {
  return [...new Set(ids)];
}

// Every type ID referenced anywhere in the nested tree (for labelling nodes).
function collectTreeTypeIds(nodes: TreeNode[], acc: number[] = []): number[] {
  for (const node of nodes) {
    acc.push(node.typeId);
    if (node.inputs.length > 0) collectTreeTypeIds(node.inputs, acc);
  }
  return acc;
}

// Deploy-static blueprint structure: the nested tree, the flattened raw
// materials (cost basis), and names for everything. No price dependency, so it
// renders in the static shell. Cached `'max'` (build ID drops it on deploy,
// which covers deploy-time SDE ingest) and tagged so the weekly drift cron can
// bust it after a no-deploy re-ingest. Warm loads hit the cache → no DB query.
export async function getBlueprintStructure(
  blueprintId: number,
): Promise<BlueprintStructure | null> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  // Which item does this blueprint produce, and how many per run? A blueprint
  // has at most one of manufacturing (1) / reaction (11); prefer manufacturing
  // if both somehow exist. No product row ⇒ not a manufacturable/reaction
  // blueprint ⇒ no planner page.
  const productRows = await db
    .select({
      productTypeId: industryActivityProducts.productTypeId,
      quantity: industryActivityProducts.quantity,
      activityId: industryActivityProducts.activityId,
    })
    .from(industryActivityProducts)
    .where(
      and(
        eq(industryActivityProducts.blueprintTypeId, blueprintId),
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
      ),
    );
  if (productRows.length === 0) return null;
  productRows.sort((a, b) => a.activityId - b.activityId);
  const chosen = productRows[0];

  const [treeResult, flat] = await Promise.all([
    getBlueprintTree(blueprintId),
    getFlatMaterials(blueprintId),
  ]);
  const tree = treeResult?.treeJson ?? [];

  const nameIds = uniq([
    chosen.productTypeId,
    ...flat.map((f) => f.rawMaterialTypeId),
    ...collectTreeTypeIds(tree),
  ]);
  const types = await getTypesByIds(nameIds);
  const materialNames: Record<number, string> = {};
  for (const t of types) materialNames[t.id] = t.name;

  return {
    blueprintTypeId: blueprintId,
    activityId: chosen.activityId,
    product: {
      typeId: chosen.productTypeId,
      name: materialNames[chosen.productTypeId] ?? `Type ${chosen.productTypeId}`,
      quantityPerRun: chosen.quantity,
    },
    tree,
    flatMaterials: flat.map((f) => ({
      typeId: f.rawMaterialTypeId,
      quantity: Number(f.totalQuantity),
    })),
    materialNames,
  };
}

// Priced cost panel: flat materials × live prices + margin. One batched price
// query across all materials + the product (never per-material in a loop).
// Cached `'hours'` + the prices freshness tag, so the cron's revalidate keeps
// it fresh; the client tops up any null/stale rows on demand. Returns null only
// when the blueprint itself doesn't resolve (page already handled that via the
// structure read).
export async function getBlueprintPricing(
  blueprintId: number,
): Promise<BlueprintPricing | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(PRICES_FRESHNESS_TAG);

  const structure = await getBlueprintStructure(blueprintId); // cache hit — no extra DB
  if (!structure) return null;

  const priceIds = uniq([
    ...structure.flatMaterials.map((m) => m.typeId),
    structure.product.typeId,
  ]);
  const priceMap = await getPrices(priceIds); // single WHERE type_id IN (...)

  // Same assembler the client uses after an on-demand refresh, so the streamed
  // figure and the refreshed figure are computed identically.
  return assemblePricing(structure, (typeId): PriceLite | undefined => {
    const p = priceMap.get(typeId);
    if (!p) return undefined;
    return {
      bestBuy: p.bestBuy,
      bestSell: p.bestSell,
      pct5Buy: p.pct5Buy,
      pct5Sell: p.pct5Sell,
      updatedAtMs: p.updatedAt.getTime(),
    };
  });
}

// Compact search index: one entry per blueprint, labelled by the published
// item it produces. Cached `'max'` (deploy-static, SDE-tagged). Fetched once by
// the lazy Blueprints search source on the client's first blueprint keystroke,
// so the ~5k-entry index never rides the initial bundle. Filtering to published
// products also drops the degenerate self-recipe junk (those produce
// unpublished types).
export async function getBlueprintSearchIndex(): Promise<BlueprintIndexEntry[]> {
  'use cache';
  cacheLife('max');
  cacheTag(BLUEPRINT_STRUCTURE_TAG);

  const rows = await db
    .select({
      blueprintTypeId: industryActivityProducts.blueprintTypeId,
      activityId: industryActivityProducts.activityId,
      name: eveTypes.name,
    })
    .from(industryActivityProducts)
    .innerJoin(eveTypes, eq(eveTypes.id, industryActivityProducts.productTypeId))
    .where(
      and(
        inArray(industryActivityProducts.activityId, ACTIVITY_IDS),
        eq(eveTypes.published, true),
      ),
    );

  // One entry per blueprint; prefer the manufacturing product (lower activity
  // id) if a blueprint somehow carries both.
  const byBlueprint = new Map<number, { name: string; activityId: number }>();
  for (const r of rows) {
    const existing = byBlueprint.get(r.blueprintTypeId);
    if (!existing || r.activityId < existing.activityId) {
      byBlueprint.set(r.blueprintTypeId, { name: r.name, activityId: r.activityId });
    }
  }
  return [...byBlueprint.entries()]
    .map(([blueprintTypeId, v]) => ({ blueprintTypeId, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
